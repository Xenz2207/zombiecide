import { missions, type MissionId } from "../../src/game";
import { shopPrices } from "../../src/shop";
import { clearReward, validateCredentials } from "../../src/shared";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN?: string;
}

interface UserRow {
  id: number;
  username: string;
  username_key: string;
  salt: string;
  hash: string;
  coins: number;
  fail_count: number;
  locked_until: number;
  last_clear_at: number;
}

const SESSION_MS = 30 * 24 * 3600 * 1000;
const LOCK_MS = 5 * 60 * 1000;
const MAX_FAILS = 5;
const MIN_CLEAR_INTERVAL_MS = 15_000; // a real mission cannot be cleared faster than this
const PBKDF2_ITERATIONS = 100_000; // Workers' maximum

const enc = new TextEncoder();
const toHex = (buffer: ArrayBuffer | Uint8Array): string => Array.from(new Uint8Array(buffer as ArrayBuffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return toHex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256));
}

async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function accountFor(db: D1Database, userId: number) {
  const user = await db.prepare("SELECT username, coins FROM users WHERE id = ?").bind(userId).first<{ username: string; coins: number }>();
  if (!user) throw new HttpError(401, "ไม่พบบัญชี");
  const rows = await db.prepare("SELECT mission_id, best_rounds, clears, first_cleared_at FROM cleared WHERE user_id = ?").bind(userId).all<{ mission_id: string; best_rounds: number; clears: number; first_cleared_at: number }>();
  const cleared: Record<string, { bestRounds: number; clears: number; firstClearedAt: number }> = {};
  for (const row of rows.results) cleared[row.mission_id] = { bestRounds: row.best_rounds, clears: row.clears, firstClearedAt: row.first_cleared_at };
  return { username: user.username, coins: user.coins, cleared };
}

async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomHex(32);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, Date.now() + SESSION_MS),
  ]);
  return token;
}

async function authenticate(request: Request, db: D1Database): Promise<{ userId: number; tokenHash: string }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const tokenHash = await sha256(token);
  const session = await db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, Date.now()).first<{ user_id: number }>();
  if (!session) throw new HttpError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return { userId: session.user_id, tokenHash };
}

async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
  }
}

async function handle(request: Request, env: Env, path: string): Promise<unknown> {
  const db = env.DB;

  if (path === "/api/register" && request.method === "POST") {
    const { username, password } = await readBody<{ username?: string; password?: string }>(request);
    if (typeof username !== "string" || typeof password !== "string") throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
    const invalid = validateCredentials(username, password);
    if (invalid) throw new HttpError(400, invalid);
    const salt = randomHex(16);
    try {
      const inserted = await db
        .prepare("INSERT INTO users (username, username_key, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(username.trim(), username.trim().toLowerCase(), salt, await hashPassword(password, salt), Date.now())
        .run();
      const userId = inserted.meta.last_row_id as number;
      return { token: await createSession(db, userId), account: await accountFor(db, userId) };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    }
  }

  if (path === "/api/login" && request.method === "POST") {
    const { username, password } = await readBody<{ username?: string; password?: string }>(request);
    if (typeof username !== "string" || typeof password !== "string") throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
    const user = await db.prepare("SELECT * FROM users WHERE username_key = ?").bind(username.trim().toLowerCase()).first<UserRow>();
    const bad = new HttpError(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    if (!user) {
      await hashPassword(password, "0".repeat(32)); // keep timing similar for unknown users
      throw bad;
    }
    if (user.locked_until > Date.now()) throw new HttpError(429, "ลองผิดหลายครั้งเกินไป กรุณารอ 5 นาที");
    if (!timingSafeEqual(user.hash, await hashPassword(password, user.salt))) {
      const fails = user.fail_count + 1;
      await db.prepare("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?").bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0, user.id).run();
      throw bad;
    }
    await db.prepare("UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = ?").bind(user.id).run();
    return { token: await createSession(db, user.id), account: await accountFor(db, user.id) };
  }

  const { userId, tokenHash } = await authenticate(request, db);

  if (path === "/api/me" && request.method === "GET") return { account: await accountFor(db, userId) };

  if (path === "/api/logout" && request.method === "POST") {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return { ok: true };
  }

  if (path === "/api/clear" && request.method === "POST") {
    const { missionId, rounds } = await readBody<{ missionId?: string; rounds?: number }>(request);
    const mission = missions.find((item) => item.id === (missionId as MissionId));
    if (!mission || !Number.isInteger(rounds) || rounds! < 1 || rounds! > 200) throw new HttpError(400, "ข้อมูลด่านไม่ถูกต้อง");
    const user = await db.prepare("SELECT last_clear_at FROM users WHERE id = ?").bind(userId).first<{ last_clear_at: number }>();
    const now = Date.now();
    if (!user || now - user.last_clear_at < MIN_CLEAR_INTERVAL_MS) throw new HttpError(429, "ส่งผลด่านถี่เกินไป");
    const previous = await db.prepare("SELECT best_rounds FROM cleared WHERE user_id = ? AND mission_id = ?").bind(userId, mission.id).first<{ best_rounds: number }>();
    const firstClear = !previous;
    const reward = clearReward(mission.objectiveZoneIds.length, rounds!, firstClear);
    await db.batch([
      db.prepare("UPDATE users SET coins = coins + ?, last_clear_at = ? WHERE id = ?").bind(reward, now, userId),
      db
        .prepare(
          `INSERT INTO cleared (user_id, mission_id, best_rounds, clears, first_cleared_at) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(user_id, mission_id) DO UPDATE SET clears = clears + 1, best_rounds = MIN(best_rounds, excluded.best_rounds)`,
        )
        .bind(userId, mission.id, rounds, now),
    ]);
    return { account: await accountFor(db, userId), result: { reward, firstClear, newBest: Boolean(previous) && rounds! < previous!.best_rounds } };
  }

  if (path === "/api/purchase" && request.method === "POST") {
    const { itemId } = await readBody<{ itemId?: string }>(request);
    const price = typeof itemId === "string" && Object.hasOwn(shopPrices, itemId) ? shopPrices[itemId] : undefined;
    if (price === undefined) throw new HttpError(400, "ไม่พบสินค้า");
    // Atomic: only deducts when the balance is sufficient, so concurrent requests cannot overspend.
    const updated = await db.prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?").bind(price, userId, price).run();
    if (updated.meta.changes !== 1) throw new HttpError(402, "เหรียญไม่พอ");
    return { account: await accountFor(db, userId) };
  }

  throw new HttpError(404, "ไม่พบ endpoint");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ALLOWED_ORIGIN is a comma-separated allow-list (or "*"). Echo back the request origin only if it is listed.
    const allowed = (env.ALLOWED_ORIGIN ?? "*").split(",").map((item) => item.trim());
    const origin = request.headers.get("origin") ?? "";
    const cors = {
      "access-control-allow-origin": allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0],
      vary: "origin",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const data = await handle(request, env, new URL(request.url).pathname);
      return Response.json(data, { headers: cors });
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers: cors });
      console.error(error);
      return Response.json({ error: "เซิร์ฟเวอร์ขัดข้อง" }, { status: 500, headers: cors });
    }
  },
};
