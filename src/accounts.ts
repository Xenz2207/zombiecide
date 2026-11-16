import type { MissionId } from "./game";
import { clearReward, validateCredentials } from "./shared";

/**
 * Account layer with two interchangeable backends:
 *  - server: Cloudflare Worker + D1 (used when VITE_API_URL is set). Coins, rewards and prices are decided server-side.
 *  - local: browser-only fallback (localStorage) so the game still works with no backend configured.
 */

export interface ClearRecord {
  bestRounds: number;
  clears: number;
  firstClearedAt: number;
}

export interface Account {
  username: string;
  coins: number;
  cleared: Partial<Record<MissionId, ClearRecord>>;
}

export interface ClearResult {
  reward: number;
  firstClear: boolean;
  newBest: boolean;
}

type Fail = { ok: false; error: string };
export type AuthResult = { ok: true; account: Account } | Fail;

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
export const usingServer = Boolean(API);
const TOKEN_KEY = "dead-zone-protocol-token-v1";
const ACCOUNTS_KEY = "dead-zone-protocol-accounts-v1";
const SESSION_KEY = "dead-zone-protocol-session-v1";

// ---------------------------------------------------------------- server backend

async function call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<{ ok: true; data: T } | (Fail & { status: number })> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: json.error ?? "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", status: response.status };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง", status: 0 };
  }
}

async function serverAuth(path: "/api/register" | "/api/login", username: string, password: string): Promise<AuthResult> {
  const result = await call<{ token: string; account: Account }>(path, "POST", { username, password });
  if (!result.ok) return result;
  localStorage.setItem(TOKEN_KEY, result.data.token);
  return { ok: true, account: result.data.account };
}

// ---------------------------------------------------------------- local backend

interface LocalAccount extends Account {
  salt: string;
  hash: string;
}
type Store = Record<string, LocalAccount>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}
const writeStore = (store: Store): void => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
const toHex = (bytes: ArrayBuffer | Uint8Array): string => Array.from(new Uint8Array(bytes as ArrayBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
const normalize = (name: string): string => name.trim().toLowerCase();
const publicView = ({ username, coins, cleared }: LocalAccount): Account => ({ username, coins, cleared });

async function hashPassword(password: string, salt: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120_000, hash: "SHA-256" }, key, 256);
    return toHex(bits);
  }
  let h = 2166136261; // weak fallback for insecure contexts; local-only
  for (const byte of new TextEncoder().encode(`${salt}:${password}`)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h.toString(16);
}

function localUpdate(mutator: (account: LocalAccount) => void): LocalAccount | null {
  const key = localStorage.getItem(SESSION_KEY);
  const store = readStore();
  const account = key ? store[key] : undefined;
  if (!account) return null;
  mutator(account);
  writeStore(store);
  return account;
}

// ---------------------------------------------------------------- public API

export async function restoreSession(): Promise<Account | null> {
  if (usingServer) {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    const result = await call<{ account: Account }>("/api/me", "GET");
    if (!result.ok) {
      if (result.status === 401) localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return result.data.account;
  }
  const key = localStorage.getItem(SESSION_KEY);
  const account = key ? readStore()[key] : undefined;
  return account ? publicView(account) : null;
}

export async function register(username: string, password: string): Promise<AuthResult> {
  const invalid = validateCredentials(username, password);
  if (invalid) return { ok: false, error: invalid };
  if (usingServer) return serverAuth("/api/register", username.trim(), password);
  const store = readStore();
  const key = normalize(username);
  if (store[key]) return { ok: false, error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" };
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);
  const account: LocalAccount = { username: username.trim(), coins: 0, cleared: {}, salt, hash: await hashPassword(password, salt) };
  store[key] = account;
  writeStore(store);
  localStorage.setItem(SESSION_KEY, key);
  return { ok: true, account: publicView(account) };
}

export async function login(username: string, password: string): Promise<AuthResult> {
  if (usingServer) return serverAuth("/api/login", username.trim(), password);
  const key = normalize(username);
  const account = readStore()[key];
  if (!account || account.hash !== (await hashPassword(password, account.salt))) return { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  localStorage.setItem(SESSION_KEY, key);
  return { ok: true, account: publicView(account) };
}

export async function logout(): Promise<void> {
  if (usingServer) {
    await call("/api/logout", "POST");
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}

/** Report a mission clear. The server recomputes the reward itself; the client only claims "I cleared X in N rounds". */
export async function claimClear(missionId: MissionId, objectiveCount: number, rounds: number): Promise<{ account: Account; result: ClearResult } | null> {
  if (usingServer) {
    const result = await call<{ account: Account; result: ClearResult }>("/api/clear", "POST", { missionId, rounds });
    return result.ok ? result.data : null;
  }
  let result: ClearResult | null = null;
  const updated = localUpdate((account) => {
    const previous = account.cleared[missionId];
    const firstClear = !previous;
    const reward = clearReward(objectiveCount, rounds, firstClear);
    account.coins += reward;
    account.cleared[missionId] = { bestRounds: previous ? Math.min(previous.bestRounds, rounds) : rounds, clears: (previous?.clears ?? 0) + 1, firstClearedAt: previous?.firstClearedAt ?? Date.now() };
    result = { reward, firstClear, newBest: Boolean(previous) && rounds < previous!.bestRounds };
  });
  return updated && result ? { account: publicView(updated), result } : null;
}

/** Buy a shop item. Price is looked up server-side in server mode. */
export async function purchase(itemId: string, price: number): Promise<AuthResult> {
  if (usingServer) {
    const result = await call<{ account: Account }>("/api/purchase", "POST", { itemId });
    return result.ok ? { ok: true, account: result.data.account } : result;
  }
  let enough = false;
  const updated = localUpdate((account) => {
    if (account.coins >= price) {
      account.coins -= price;
      enough = true;
    }
  });
  if (!updated) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };
  return enough ? { ok: true, account: publicView(updated) } : { ok: false, error: "เหรียญไม่พอ" };
}
