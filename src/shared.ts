/** Pure helpers shared by the browser client and the Cloudflare Worker (no DOM / no storage). */

export function validateCredentials(username: string, password: string): string | null {
  if (!/^[A-Za-z0-9_฀-๿]{3,16}$/.test(username.trim())) return "ชื่อผู้ใช้ต้องยาว 3-16 ตัว (ตัวอักษร ตัวเลข หรือ _)";
  if (password.length < 6 || password.length > 100) return "รหัสผ่านต้องยาว 6-100 ตัวอักษร";
  return null;
}

/** Coins for clearing a mission. First clear pays much more than replays. */
export function clearReward(objectiveCount: number, rounds: number, firstClear: boolean): number {
  const speedBonus = Math.max(0, 8 - rounds) * 3;
  return firstClear ? 40 + objectiveCount * 15 + speedBonus : 12 + objectiveCount * 3 + Math.floor(speedBonus / 2);
}
