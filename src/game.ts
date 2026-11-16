export type Phase = "player" | "zombie" | "won" | "lost";
export type ZombieKind = "walker" | "runner" | "brute" | "abomination" | "crawler" | "spitter" | "clown" | "mascot";
export type WeaponKind = "melee" | "ranged" | "item";
export type MapId = "city" | "harbor" | "amusement";
export type RideKind = "coaster" | "bumper";
export type MissionId = "supply-run" | "blackout" | "last-dose" | "crossfire" | "distress-call" | "broken-arsenal" | "dead-route" | "night-hunt" | "last-dawn" | "sealed-harbor" | "last-ride" | "acid-rain" | "plague-vault" | "ghost-ship" | "final-evac" | "park-after-dark" | "dead-parade" | "haunted-shift" | "bumper-massacre" | "blood-coaster" | "carnival-poison" | "mascot-hunt" | "blackout-ride" | "last-ticket" | "final-curtain";

export interface Ride {
  id: string;
  kind: RideKind;
  name: string;
  zoneId: string;
}

export interface Mission {
  id: MissionId;
  name: string;
  briefing: string;
  objectiveZoneIds: string[];
  spawnZoneIds: string[];
  extractionZoneId: string;
  initialZombies: Array<[ZombieKind, string]>;
  mapId?: MapId;
  vehicleStartZoneId?: string;
  rides?: Ride[];
}

export interface Zone {
  id: string;
  name: string;
  row: number;
  col: number;
  kind: "street" | "building";
  exits: string[];
  spawn?: boolean;
  extraction?: boolean;
  objective?: boolean;
}

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  dice: number;
  accuracy: number;
  damage: number;
  range: number;
  noisy: boolean;
  singleUse?: boolean;
  description: string;
  effect?: "heal" | "adrenaline";
}

export interface Survivor {
  id: string;
  name: string;
  zoneId: string;
  health: number;
  maxHealth: number;
  actions: number;
  adrenaline: number;
  searched: boolean;
  searches: number;
  moved: boolean;
  done: boolean;
  inventory: Weapon[];
  skill: string;
  portraitIndex: number;
}

export interface Zombie {
  id: number;
  kind: ZombieKind;
  zoneId: string;
}

export interface GameState {
  phase: Phase;
  round: number;
  zones: Zone[];
  survivors: Survivor[];
  zombies: Zombie[];
  activeSurvivorId: string;
  openedDoors: string[];
  objectives: string[];
  noise: Record<string, number>;
  nextZombieId: number;
  log: string[];
  seed: number;
  missionId: MissionId;
  lastRoll: number[];
  lastRollLabel: string;
  vehicleZoneId: string | null;
  rides: Ride[];
}

const weaponCatalog: Record<string, Weapon> = {
  bat: { id: "bat", name: "ไม้เบสบอล", kind: "melee", dice: 2, accuracy: 3, damage: 1, range: 0, noisy: false, description: "เงียบและแม่น เหมาะกับ Walker หรือ Runner ในโซนเดียวกัน" },
  pistol: { id: "pistol", name: "ปืนพก", kind: "ranged", dice: 1, accuracy: 4, damage: 1, range: 1, noisy: true, description: "อาวุธระยะใกล้คล่องตัว แต่เสียงยิงจะดึงดูดฝูง" },
  machete: { id: "machete", name: "มีดพร้า", kind: "melee", dice: 1, accuracy: 4, damage: 2, range: 0, noisy: false, description: "ฟันทะลุเกราะ Brute ได้โดยไม่สร้างเสียง" },
  shotgun: { id: "shotgun", name: "ลูกซอง", kind: "ranged", dice: 2, accuracy: 4, damage: 1, range: 1, noisy: true, description: "ทอยสองลูก เหมาะกับฝูงระยะประชิด" },
  axe: { id: "axe", name: "ขวานกู้ภัย", kind: "melee", dice: 2, accuracy: 4, damage: 2, range: 0, noisy: false, description: "อาวุธหนักเงียบ ทอยสองลูกและกำจัด Brute ได้" },
  crowbar: { id: "crowbar", name: "ชะแลง", kind: "melee", dice: 1, accuracy: 4, damage: 2, range: 0, noisy: false, description: "อาวุธประชิดเรียบง่ายที่สร้างความเสียหาย 2" },
  smg: { id: "smg", name: "ปืนกลมือ", kind: "ranged", dice: 3, accuracy: 5, damage: 1, range: 2, noisy: true, description: "ยิงสามนัดไกลสองโซน โอกาสพลาดโดนพวกเดียวกันสูง" },
  rifle: { id: "rifle", name: "ไรเฟิล", kind: "ranged", dice: 1, accuracy: 3, damage: 2, range: 3, noisy: true, description: "ยิงไกลและแรง เหมาะสำหรับจัดการ Brute จากแนวตรง" },
  molotov: { id: "molotov", name: "ระเบิดเพลิง", kind: "ranged", dice: 1, accuracy: 1, damage: 99, range: 1, noisy: true, singleUse: true, description: "ใช้ครั้งเดียว กำจัดศัตรูทุกระดับรวม Abomination" },
  medkit: { id: "medkit", name: "ชุดปฐมพยาบาล", kind: "item", dice: 1, accuracy: 4, damage: 0, range: 0, noisy: false, singleUse: true, effect: "heal", description: "ใช้ 1 action ทอย 1 ลูก: 4+ ฟื้นฟู 1 HP แล้วทิ้งการ์ด" },
  katana: { id: "katana", name: "ดาบคาตานะ", kind: "melee", dice: 3, accuracy: 4, damage: 2, range: 0, noisy: false, description: "คม เงียบ และรวดเร็ว ทอยสามลูกพร้อมเจาะเกราะ Brute" },
  crossbow: { id: "crossbow", name: "หน้าไม้ยุทธวิธี", kind: "ranged", dice: 2, accuracy: 4, damage: 2, range: 2, noisy: false, description: "ยิงเงียบได้ไกลสองโซนและสร้าง damage 2" },
  flamethrower: { id: "flamethrower", name: "เครื่องพ่นไฟ", kind: "ranged", dice: 3, accuracy: 4, damage: 3, range: 1, noisy: true, description: "อาวุธหนักระยะใกล้ที่จัดการ Abomination ได้ แต่สร้างเสียงดัง" },
  shockBaton: { id: "shock-baton", name: "กระบองไฟฟ้า", kind: "melee", dice: 2, accuracy: 3, damage: 2, range: 0, noisy: false, description: "อุปกรณ์ช่างประจำสวนสนุก แม่นยำและเจาะเกราะ Mascot ได้" },
  fireworks: { id: "fireworks", name: "พลุสัญญาณ", kind: "ranged", dice: 4, accuracy: 4, damage: 1, range: 2, noisy: true, singleUse: true, description: "ยิงพลุใส่ทั้งโซน ใช้ครั้งเดียวและสร้างเสียงดังมาก" },
  cottonCandy: { id: "cotton-candy", name: "สายไหมพลังงาน", kind: "item", dice: 1, accuracy: 3, damage: 0, range: 0, noisy: false, singleUse: true, effect: "adrenaline", description: "ใช้ 1 action ทอย 3+ เพื่อรับ 5 adrenaline แล้วทิ้งการ์ด" },
};

export const equipmentReference = Object.values(weaponCatalog);

export const missions: Mission[] = [
  { id: "supply-run", name: "01 — เส้นทางเสบียง", briefing: "เก็บเสบียงจากร้านขายยาและคลินิก แล้วพาทุกคนกลับจุดอพยพ", objectiveZoneIds: ["a", "g"], spawnZoneIds: ["d", "i"], extractionZoneId: "l", initialZombies: [["walker", "h"], ["walker", "e"], ["runner", "c"]] },
  { id: "blackout", name: "02 — เมืองดับไฟ", briefing: "เปิดเครื่องกำเนิดไฟที่ร้านฮาร์ดแวร์และสถานีดับเพลิง แล้วถอนกำลังทางร้านขายยา", objectiveZoneIds: ["f", "k"], spawnZoneIds: ["d", "l"], extractionZoneId: "a", initialZombies: [["walker", "b"], ["runner", "h"], ["brute", "j"]] },
  { id: "last-dose", name: "03 — ยาเข็มสุดท้าย", briefing: "ค้นวัคซีนสามจุด ก่อนกลับไปยังลานจอดรถ", objectiveZoneIds: ["a", "f", "g"], spawnZoneIds: ["d", "i", "l"], extractionZoneId: "h", initialZombies: [["walker", "e"], ["walker", "j"], ["runner", "c"], ["brute", "k"]] },
  { id: "crossfire", name: "04 — วงล้อม", briefing: "ยึดแฟลต คลินิก และสถานีดับเพลิง แล้วหลบหนีทางตรอกตะวันตก", objectiveZoneIds: ["b", "g", "k"], spawnZoneIds: ["c", "d", "i", "l"], extractionZoneId: "e", initialZombies: [["walker", "a"], ["runner", "h"], ["brute", "f"], ["abomination", "j"]] },
  { id: "distress-call", name: "05 — สัญญาณสุดท้าย", briefing: "รวบรวมเครื่องส่งสัญญาณจากร้านขายยา ร้านฮาร์ดแวร์ และสถานีดับเพลิง ก่อนฝ่าวงล้อมกลับจุดอพยพ", objectiveZoneIds: ["a", "f", "k"], spawnZoneIds: ["c", "d", "e", "i"], extractionZoneId: "l", initialZombies: [["walker", "b"], ["walker", "g"], ["runner", "h"], ["brute", "j"], ["abomination", "f"]] },
  { id: "broken-arsenal", name: "06 — คลังอาวุธแตก", briefing: "กู้ลังอาวุธสี่จุดจากแฟลต ร้านฮาร์ดแวร์ คลินิก และสถานีดับเพลิง แล้วถอนกำลังทางร้านขายยา", objectiveZoneIds: ["b", "f", "g", "k"], spawnZoneIds: ["d", "h", "i", "l"], extractionZoneId: "a", initialZombies: [["walker", "c"], ["walker", "e"], ["runner", "f"], ["runner", "j"], ["brute", "g"], ["abomination", "k"]] },
  { id: "dead-route", name: "07 — เส้นทางมรณะ", briefing: "ตามหาแผนที่หลบหนีจากอาคารสี่แห่ง ท่ามกลางฝูงซอมบี้ที่เข้ามาจากทุกทิศ แล้วรวมทีมที่ลานจอดรถ", objectiveZoneIds: ["a", "b", "f", "k"], spawnZoneIds: ["c", "d", "e", "i", "l"], extractionZoneId: "h", initialZombies: [["walker", "b"], ["walker", "g"], ["walker", "j"], ["runner", "c"], ["runner", "f"], ["brute", "k"], ["abomination", "a"]] },
  { id: "night-hunt", name: "08 — คืนล่าอสูร", briefing: "เก็บตัวอย่างเชื้อจากร้านขายยา แฟลต คลินิก และสถานีดับเพลิง ก่อนพาทีมหนีออกทางตรอกตะวันตก", objectiveZoneIds: ["a", "b", "g", "k"], spawnZoneIds: ["c", "d", "h", "i", "l"], extractionZoneId: "e", initialZombies: [["walker", "a"], ["walker", "f"], ["walker", "j"], ["runner", "b"], ["runner", "g"], ["brute", "k"], ["brute", "c"], ["abomination", "h"]] },
  { id: "last-dawn", name: "09 — รุ่งสางสุดท้าย", briefing: "เปิดจุดส่งสัญญาณทั้งห้าแห่งและพาผู้รอดชีวิตทุกคนกลับลานจอดรถ ก่อนเมืองจะถูกฝูงซอมบี้กลืนกิน", objectiveZoneIds: ["a", "b", "f", "g", "k"], spawnZoneIds: ["c", "d", "e", "i", "l"], extractionZoneId: "h", initialZombies: [["walker", "a"], ["walker", "b"], ["walker", "f"], ["runner", "c"], ["runner", "g"], ["runner", "j"], ["brute", "k"], ["brute", "e"], ["abomination", "d"]] },
  { id: "sealed-harbor", name: "10 — ท่าเรือปิดตาย", briefing: "ค้นรหัสประตูท่าเรือสามจุด ใช้รถกระบะฝ่าฝูงซอมบี้ และรวมทีมที่ท่าอพยพ", mapId: "harbor", vehicleStartZoneId: "q", objectiveZoneIds: ["n", "o", "w"], spawnZoneIds: ["m", "t", "u"], extractionZoneId: "x", initialZombies: [["walker", "r"], ["runner", "s"], ["crawler", "q"], ["spitter", "v"], ["brute", "n"]] },
  { id: "last-ride", name: "11 — รถเที่ยวสุดท้าย", briefing: "กู้เชื้อเพลิงและอะไหล่ให้รถ ก่อนขนทีมผ่านโกดังและไปขึ้นเรือเฟอร์รี่", mapId: "harbor", vehicleStartZoneId: "v", objectiveZoneIds: ["n", "o", "r", "v"], spawnZoneIds: ["m", "p", "t", "u"], extractionZoneId: "p", initialZombies: [["walker", "q"], ["crawler", "s"], ["crawler", "w"], ["spitter", "t"], ["runner", "n"], ["brute", "o"]] },
  { id: "acid-rain", name: "12 — ฝนกรด", briefing: "เก็บสารต้านพิษจากคลังสินค้า ศุลกากร และหน่วยยามฝั่ง ก่อนหนีออกจากท่าเรือ", mapId: "harbor", vehicleStartZoneId: "q", objectiveZoneIds: ["n", "r", "w"], spawnZoneIds: ["m", "p", "t", "u", "x"], extractionZoneId: "v", initialZombies: [["walker", "n"], ["runner", "s"], ["crawler", "q"], ["crawler", "t"], ["spitter", "o"], ["spitter", "w"], ["brute", "r"]] },
  { id: "plague-vault", name: "13 — คลังเชื้อมรณะ", briefing: "บุกคลังเชื้อสี่จุดและทำลายตัวอย่างกลายพันธุ์ ก่อนถอนกำลังทางท่าเรือตะวันออก", mapId: "harbor", vehicleStartZoneId: "v", objectiveZoneIds: ["n", "o", "r", "w"], spawnZoneIds: ["m", "p", "q", "u", "x"], extractionZoneId: "t", initialZombies: [["walker", "s"], ["runner", "q"], ["runner", "v"], ["crawler", "n"], ["crawler", "u"], ["spitter", "o"], ["brute", "w"], ["abomination", "r"]] },
  { id: "ghost-ship", name: "14 — เรือผี", briefing: "เปิดระบบเรือเฟอร์รี่และรวบรวมแบตเตอรี่สำรองจากทั่วท่าเรือ ก่อนขึ้นเรือพร้อมกัน", mapId: "harbor", vehicleStartZoneId: "q", objectiveZoneIds: ["m", "n", "o", "v", "w"], spawnZoneIds: ["p", "q", "t", "u", "x"], extractionZoneId: "p", initialZombies: [["walker", "r"], ["runner", "s"], ["crawler", "m"], ["crawler", "v"], ["spitter", "t"], ["spitter", "w"], ["brute", "n"], ["brute", "o"], ["abomination", "x"]] },
  { id: "final-evac", name: "15 — อพยพครั้งสุดท้าย", briefing: "เปิดเส้นทางอพยพทั้งหกจุด ใช้รถพาทุกคนฝ่าฝูงกลายพันธุ์ และยึดท่าเรือให้ได้ก่อนรุ่งสาง", mapId: "harbor", vehicleStartZoneId: "v", objectiveZoneIds: ["m", "n", "o", "r", "v", "w"], spawnZoneIds: ["p", "q", "s", "t", "u", "x"], extractionZoneId: "x", initialZombies: [["walker", "n"], ["walker", "r"], ["runner", "s"], ["runner", "w"], ["crawler", "m"], ["crawler", "q"], ["spitter", "o"], ["spitter", "t"], ["brute", "u"], ["brute", "v"], ["abomination", "p"]] },
  { id: "park-after-dark", name: "16 — สวนสนุกหลังเที่ยงคืน", briefing: "เปิดประตูบริการสามจุดและใช้เครื่องเล่นพาทีมไปยังทางออกฉุกเฉิน", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["ac", "af", "ak"], spawnZoneIds: ["aa", "ad", "ai"], extractionZoneId: "al", initialZombies: [["walker", "ae"], ["runner", "ag"], ["clown", "ab"], ["mascot", "aj"], ["crawler", "af"]] },
  { id: "dead-parade", name: "17 — ขบวนพาเหรดคนตาย", briefing: "ตามหากุญแจขบวนพาเหรดสี่จุด แล้วรวมทีมที่ประตูหลักก่อนฝูงตัวตลกปิดทาง", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "af" }], objectiveZoneIds: ["ab", "ac", "af", "ak"], spawnZoneIds: ["aa", "ad", "ah", "ai"], extractionZoneId: "aj", initialZombies: [["walker", "ae"], ["clown", "ab"], ["clown", "ag"], ["mascot", "ac"], ["runner", "ak"], ["spitter", "ah"]] },
  { id: "haunted-shift", name: "18 — กะดึกบ้านผีสิง", briefing: "กู้กล่องควบคุมจากบ้านผีสิง อาร์เคด และอู่ซ่อม ก่อนหนีทางประตูฉุกเฉิน", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "ae" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["ac", "ae", "ai"], spawnZoneIds: ["aa", "ad", "ag", "aj", "al"], extractionZoneId: "al", initialZombies: [["clown", "ab"], ["clown", "af"], ["mascot", "ac"], ["mascot", "ak"], ["runner", "ag"], ["crawler", "ai"], ["spitter", "ah"]] },
  { id: "bumper-massacre", name: "19 — รถบั๊มสังหาร", briefing: "รวบรวมแบตเตอรี่รถบั๊มและเปิดเส้นทางผ่านลานน้ำท่วมไปยังชิงช้าสวรรค์", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["ab", "ae", "ag", "ai"], spawnZoneIds: ["aa", "ac", "ad", "ah", "al"], extractionZoneId: "ad", initialZombies: [["walker", "af"], ["runner", "ag"], ["clown", "ab"], ["clown", "aj"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "ah"], ["brute", "ai"]] },
  { id: "blood-coaster", name: "20 — รถไฟเหาะสายเลือด", briefing: "ซ่อมระบบรางสี่ส่วนและใช้รถไฟเหาะขนทีมไปยังสถานีปลายทาง", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "af" }], objectiveZoneIds: ["aa", "ac", "af", "ak"], spawnZoneIds: ["ab", "ad", "ag", "ai", "al"], extractionZoneId: "ah", initialZombies: [["runner", "ae"], ["crawler", "ag"], ["clown", "ab"], ["clown", "aj"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "af"], ["abomination", "ai"]] },
  { id: "carnival-poison", name: "21 — พิษงานวัด", briefing: "เก็บยาต้านพิษจากร้านอาหาร อาร์เคด บ้านผีสิง และอู่ซ่อม ก่อนสารพิษกระจายทั่วสวน", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "ae" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["ac", "ae", "af", "ai"], spawnZoneIds: ["aa", "ad", "ag", "ah", "al"], extractionZoneId: "aj", initialZombies: [["clown", "ab"], ["clown", "af"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "ag"], ["spitter", "ah"], ["runner", "ai"], ["brute", "ae"], ["abomination", "ad"]] },
  { id: "mascot-hunt", name: "22 — คืนล่ามาสคอต", briefing: "ทำลายรังมาสคอตห้าจุดและเปิดประตูหลักให้ทีมอพยพ", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "af" }], objectiveZoneIds: ["ab", "ac", "ae", "ai", "ak"], spawnZoneIds: ["aa", "ad", "ag", "ah", "al"], extractionZoneId: "aj", initialZombies: [["clown", "ab"], ["clown", "ag"], ["mascot", "ac"], ["mascot", "af"], ["mascot", "ak"], ["runner", "ae"], ["spitter", "ah"], ["brute", "ai"], ["abomination", "ad"]] },
  { id: "blackout-ride", name: "23 — เครื่องเล่นดับไฟ", briefing: "เปิดเครื่องกำเนิดไฟห้าจุดท่ามกลางความมืดและขนทุกคนไปยังทางออกฉุกเฉิน", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "ae" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["aa", "ac", "ae", "ai", "ak"], spawnZoneIds: ["ab", "ad", "ag", "ah", "aj", "al"], extractionZoneId: "al", initialZombies: [["runner", "af"], ["crawler", "ag"], ["clown", "ab"], ["clown", "aj"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "ah"], ["brute", "ai"], ["abomination", "ad"], ["abomination", "ae"]] },
  { id: "last-ticket", name: "24 — ตั๋วใบสุดท้าย", briefing: "รวบรวมตั๋วผ่านทางหกจุด ใช้เครื่องเล่นตัดเส้นทางฝูง และกลับประตูหลักพร้อมกัน", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "af" }], objectiveZoneIds: ["aa", "ab", "ac", "ae", "ai", "ak"], spawnZoneIds: ["ad", "af", "ag", "ah", "aj", "al"], extractionZoneId: "aj", initialZombies: [["runner", "ae"], ["runner", "ag"], ["clown", "ab"], ["clown", "af"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "ah"], ["brute", "ai"], ["abomination", "ad"], ["abomination", "al"]] },
  { id: "final-curtain", name: "25 — ม่านสุดท้าย", briefing: "ยึดสวนสนุกทั้งเจ็ดจุด เปิดรถไฟเหาะเที่ยวสุดท้าย และพาทุกคนฝ่าฝูงราชามาสคอตออกไป", mapId: "amusement", rides: [{ id: "coaster", kind: "coaster", name: "รถไฟเหาะ", zoneId: "aa" }, { id: "bumper", kind: "bumper", name: "รถบั๊ม", zoneId: "ab" }], objectiveZoneIds: ["aa", "ab", "ac", "ae", "af", "ai", "ak"], spawnZoneIds: ["ad", "ag", "ah", "aj", "al"], extractionZoneId: "al", initialZombies: [["walker", "ae"], ["runner", "ag"], ["crawler", "ai"], ["clown", "ab"], ["clown", "af"], ["mascot", "ac"], ["mascot", "ak"], ["spitter", "ah"], ["brute", "aj"], ["abomination", "ad"], ["abomination", "al"]] },
];

export const zombieDescriptions: Record<ZombieKind, string> = {
  walker: "เดินหรือโจมตี 1 ครั้ง ต้องการ damage 1 และให้ 1 adrenaline",
  runner: "ทำ 2 actions ต่อ Zombie phase ต้องการ damage 1",
  brute: "เกราะหนา ต้องใช้อาวุธ damage 2 และให้ 2 adrenaline",
  abomination: "ร่างกลายพันธุ์ ต้องใช้ damage 3 หรือ Molotov และให้ 5 adrenaline",
  crawler: "คลานเร็ว ทำ 2 actions ต่อ Zombie phase ต้องการ damage 1",
  spitter: "พ่นพิษโจมตีผู้รอดชีวิตในโซนข้างเคียง ต้องการ damage 1 และให้ 2 adrenaline",
  clown: "ตัวตลกคลั่งเคลื่อนที่ 2 actions ต่อ Zombie phase ต้องการ damage 1",
  mascot: "ชุดมาสคอตเสริมเกราะ ต้องการ damage 2 และโจมตีแรง 2 HP",
};

export const mapThemes: Record<MapId, { name: string; description: string; items: string; zombies: string; vehicles: string }> = {
  city: { name: "เขตเมือง", description: "อาคารแคบ ประตูปิด และถนนยิงเป็นแนวตรง", items: "อาวุธมาตรฐาน ชุดปฐมพยาบาล และระเบิดเพลิง", zombies: "Walker, Runner, Brute และ Abomination", vehicles: "ไม่มีพาหนะประจำแผนที่" },
  harbor: { name: "ท่าเรืออุตสาหกรรม", description: "โกดังและท่าเรือน้ำท่วม มีเส้นทางเปิดยาวและจุดเกิดหลายด้าน", items: "ดาบคาตานะ หน้าไม้ยุทธวิธี และเครื่องพ่นไฟ", zombies: "Crawler เคลื่อนที่เร็ว และ Spitter พ่นพิษข้ามหนึ่งโซน", vehicles: "รถกระบะขนผู้รอดชีวิตทุกคนในโซนและสร้างเสียง 2" },
  amusement: { name: "สวนสนุกร้าง", description: "เครื่องเล่นพัง ทางเดินคดเคี้ยว และแสงไฟลวงตารอบสวนสนุก", items: "กระบองไฟฟ้า พลุสัญญาณ และสายไหมพลังงาน", zombies: "Clown เคลื่อนที่เร็ว และ Mascot มีเกราะพร้อมโจมตี 2 HP", vehicles: "รถไฟเหาะขนทุกคนในโซน ส่วนรถบั๊มขนเฉพาะคนขับ" },
};

export const adrenalineTiers = [
  { value: 0, label: "ความสามารถประจำตัว" },
  { value: 7, label: "+1 Action ทุกต้นรอบ" },
  { value: 19, label: "+1 ลูกเต๋าเมื่อโจมตี" },
  { value: 43, label: "ลดค่าเป้าหมายอาวุธ 1" },
];

const doorEdges = [edgeKey("b", "f"), edgeKey("g", "h"), edgeKey("n", "r"), edgeKey("r", "s"), edgeKey("ac", "ag"), edgeKey("ae", "af")];

export function createGame(seed = Date.now(), missionId: MissionId = "supply-run"): GameState {
  const mission = missions.find((item) => item.id === missionId) ?? missions[0];
  const zones = mission.mapId === "harbor" ? harborZones() : mission.mapId === "amusement" ? amusementZones() : cityZones();
  for (const zone of zones) {
    zone.objective = mission.objectiveZoneIds.includes(zone.id);
    zone.spawn = mission.spawnZoneIds.includes(zone.id);
    zone.extraction = mission.extractionZoneId === zone.id;
  }

  return {
    phase: "player",
    round: 1,
    zones,
    survivors: [
      survivor("mika", "มิกะ", mission.extractionZoneId, weaponCatalog.bat, "แพทย์สนาม: เริ่มรอบด้วย HP +1 หากบาดเจ็บ", 0),
      survivor("jin", "จิน", mission.extractionZoneId, weaponCatalog.pistol, "ช่างเครื่อง: เปิดประตูโดยไม่สร้างเสียง", 1),
      survivor("mali", "มะลิ", mission.extractionZoneId, weaponCatalog.crowbar, "นักสืบ: ค้นของได้ 2 ครั้งต่อ activation", 2),
      survivor("nont", "นนท์", mission.extractionZoneId, weaponCatalog.bat, "นักส่งของ: Move แรกของรอบไม่เสีย action เพิ่มจาก zombie", 3),
      survivor("dao", "ดาว", mission.extractionZoneId, weaponCatalog.axe, "นักดับเพลิง: +1 die เมื่อใช้อาวุธประชิด", 4),
      survivor("krit", "กฤต", mission.extractionZoneId, weaponCatalog.pistol, "แพทย์: เพื่อนร่วมโซนรับความเสียหายแทนกันได้", 5),
    ],
    zombies: mission.initialZombies.map(([kind, zoneId], index) => ({ id: index + 1, kind, zoneId })),
    activeSurvivorId: "mika",
    openedDoors: [],
    objectives: [],
    noise: {},
    nextZombieId: mission.initialZombies.length + 1,
    log: [`ภารกิจเริ่มแล้ว — ${mission.briefing}`],
    seed,
    missionId: mission.id,
    lastRoll: [],
    lastRollLabel: "",
    vehicleZoneId: mission.vehicleStartZoneId ?? null,
    rides: structuredClone(mission.rides ?? []),
  };
}

function cityZones(): Zone[] {
  return [
    zone("a", "ร้านขายยา", 0, 0, "building", ["b", "e"]),
    zone("b", "แฟลต 12", 0, 1, "building", ["a", "c", "f"]),
    zone("c", "ถนนเหนือ", 0, 2, "street", ["b", "d", "g"]),
    zone("d", "จุดเกิดเหนือ", 0, 3, "street", ["c", "h"]),
    zone("e", "ตรอกตะวันตก", 1, 0, "street", ["a", "f", "i"]),
    zone("f", "ร้านฮาร์ดแวร์", 1, 1, "building", ["b", "e", "g", "j"]),
    zone("g", "คลินิก", 1, 2, "building", ["c", "f", "h", "k"]),
    zone("h", "ลานจอดรถ", 1, 3, "street", ["d", "g", "l"]),
    zone("i", "จุดเกิดใต้", 2, 0, "street", ["e", "j"]),
    zone("j", "ถนนใต้", 2, 1, "street", ["f", "i", "k"]),
    zone("k", "สถานีดับเพลิง", 2, 2, "building", ["g", "j", "l"]),
    zone("l", "จุดอพยพ", 2, 3, "street", ["h", "k"]),
  ];
}

function harborZones(): Zone[] {
  return [
    zone("m", "ลานตู้สินค้า", 0, 0, "street", ["n", "q"]),
    zone("n", "โกดังหมายเลข 7", 0, 1, "building", ["m", "o", "r"]),
    zone("o", "คลังเชื้อเพลิง", 0, 2, "building", ["n", "p", "s"]),
    zone("p", "อาคารเรือเฟอร์รี่", 0, 3, "building", ["o", "t"]),
    zone("q", "ถนนน้ำท่วม", 1, 0, "street", ["m", "r", "u"]),
    zone("r", "ด่านศุลกากร", 1, 1, "building", ["n", "q", "s", "v"]),
    zone("s", "เขาวงกตตู้สินค้า", 1, 2, "street", ["o", "r", "t", "w"]),
    zone("t", "ท่าเรือตะวันออก", 1, 3, "street", ["p", "s", "x"]),
    zone("u", "ลานรถไฟ", 2, 0, "street", ["q", "v"]),
    zone("v", "อู่ซ่อมรถ", 2, 1, "building", ["r", "u", "w"]),
    zone("w", "หน่วยยามฝั่ง", 2, 2, "building", ["s", "v", "x"]),
    zone("x", "ท่าอพยพ", 2, 3, "street", ["t", "w"]),
  ];
}

function amusementZones(): Zone[] {
  return [
    zone("aa", "รถไฟเหาะสนิม", 0, 0, "street", ["ab", "ae"]),
    zone("ab", "ลานรถบั๊ม", 0, 1, "building", ["aa", "ac", "af"]),
    zone("ac", "บ้านผีสิง", 0, 2, "building", ["ab", "ad", "ag"]),
    zone("ad", "ชิงช้าสวรรค์", 0, 3, "street", ["ac", "ah"]),
    zone("ae", "อาร์เคดร้าง", 1, 0, "building", ["aa", "af", "ai"]),
    zone("af", "ศูนย์อาหาร", 1, 1, "building", ["ab", "ae", "ag", "aj"]),
    zone("ag", "ทางเดินน้ำท่วม", 1, 2, "street", ["ac", "af", "ah", "ak"]),
    zone("ah", "ม้าหมุนแตก", 1, 3, "street", ["ad", "ag", "al"]),
    zone("ai", "อู่เครื่องเล่น", 2, 0, "building", ["ae", "aj"]),
    zone("aj", "ประตูสวนสนุก", 2, 1, "street", ["af", "ai", "ak"]),
    zone("ak", "ลานขบวนพาเหรด", 2, 2, "street", ["ag", "aj", "al"]),
    zone("al", "ทางออกฉุกเฉิน", 2, 3, "street", ["ah", "ak"]),
  ];
}

function zone(id: string, name: string, row: number, col: number, kind: Zone["kind"], exits: string[], flags: Partial<Zone> = {}): Zone {
  return { id, name, row, col, kind, exits, ...flags };
}

function survivor(id: string, name: string, zoneId: string, weapon: Weapon, skill: string, portraitIndex: number): Survivor {
  return { id, name, zoneId, health: 3, maxHealth: 3, actions: 3, adrenaline: 0, searched: false, searches: 0, moved: false, done: false, inventory: [{ ...weapon }], skill, portraitIndex };
}

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function active(state: GameState): Survivor {
  return state.survivors.find((item) => item.id === state.activeSurvivorId)!;
}

function addLog(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}

function random(state: GameState): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function rollD6(state: GameState): number {
  return Math.floor(random(state) * 6) + 1;
}

export function isDoorClosed(state: GameState, from: string, to: string): boolean {
  const edge = edgeKey(from, to);
  return doorEdges.includes(edge) && !state.openedDoors.includes(edge);
}

/** Every door on the current map with its open/closed state (used to draw doors on the board). */
export function doorConnections(state: GameState): { a: string; b: string; open: boolean }[] {
  return doorEdges
    .map((edge) => {
      const [a, b] = edge.split(":");
      return { a, b, open: state.openedDoors.includes(edge) };
    })
    .filter((door) => state.zones.some((zone) => zone.id === door.a) && state.zones.some((zone) => zone.id === door.b));
}

export function closedDoorExits(state: GameState, zoneId: string): string[] {
  const zone = state.zones.find((item) => item.id === zoneId);
  return zone?.exits.filter((exit) => isDoorClosed(state, zoneId, exit)) ?? [];
}

export function moveSurvivor(source: GameState, destination: string): GameState {
  const state = clone(source);
  if (state.phase !== "player") return state;
  const hero = active(state);
  const current = state.zones.find((z) => z.id === hero.zoneId)!;
  const zombiesHere = state.zombies.filter((z) => z.zoneId === hero.zoneId).length;
  const cost = hero.id === "nont" && !hero.moved ? 1 : 1 + zombiesHere;
  if (!current.exits.includes(destination) || isDoorClosed(state, current.id, destination) || hero.actions < cost) return state;
  hero.actions -= cost;
  hero.zoneId = destination;
  hero.moved = true;
  addLog(state, `${hero.name} เคลื่อนที่ไป ${zoneName(state, destination)} (${cost} action)`);
  return checkOutcome(state);
}

export function driveVehicle(source: GameState, destination: string): GameState {
  const state = clone(source);
  const hero = active(state);
  if (state.phase !== "player" || state.vehicleZoneId !== hero.zoneId || hero.actions < 1) return state;
  const current = state.zones.find((zone) => zone.id === hero.zoneId)!;
  if (!current.exits.includes(destination) || isDoorClosed(state, current.id, destination)) return state;
  const passengers = state.survivors.filter((survivor) => survivor.health > 0 && survivor.zoneId === current.id);
  for (const passenger of passengers) passenger.zoneId = destination;
  state.vehicleZoneId = destination;
  hero.actions -= 1;
  hero.moved = true;
  state.noise[destination] = (state.noise[destination] ?? 0) + 2;
  addLog(state, `${hero.name} ขับรถพาทีมไป ${zoneName(state, destination)} (${passengers.length} คน)`);
  return checkOutcome(state);
}

export function driveRide(source: GameState, rideId: string, destination: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const ride = state.rides.find((item) => item.id === rideId);
  if (state.phase !== "player" || !ride || ride.zoneId !== hero.zoneId || hero.actions < 1) return state;
  const current = state.zones.find((zone) => zone.id === hero.zoneId)!;
  if (!current.exits.includes(destination) || isDoorClosed(state, current.id, destination)) return state;
  const passengers = ride.kind === "coaster"
    ? state.survivors.filter((survivor) => survivor.health > 0 && survivor.zoneId === current.id)
    : [hero];
  for (const passenger of passengers) passenger.zoneId = destination;
  ride.zoneId = destination;
  hero.actions -= 1;
  hero.moved = true;
  state.noise[destination] = (state.noise[destination] ?? 0) + (ride.kind === "coaster" ? 3 : 1);
  addLog(state, `${hero.name} ใช้${ride.name}ไป ${zoneName(state, destination)} (${passengers.length} คน)`);
  return checkOutcome(state);
}

export function openDoor(source: GameState, destination: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const current = state.zones.find((z) => z.id === hero.zoneId)!;
  const edge = edgeKey(current.id, destination);
  if (state.phase !== "player" || hero.actions < 1 || !current.exits.includes(destination) || !doorEdges.includes(edge) || state.openedDoors.includes(edge)) return state;
  hero.actions -= 1;
  state.openedDoors.push(edge);
  if (hero.id !== "jin") state.noise[hero.zoneId] = (state.noise[hero.zoneId] ?? 0) + 1;
  addLog(state, `${hero.name} เปิดประตูไปยัง ${zoneName(state, destination)}${hero.id === "jin" ? "อย่างเงียบเชียบ" : " — เสียงดัง!"}`);
  return state;
}

export function searchZone(source: GameState): GameState {
  const state = clone(source);
  const hero = active(state);
  const zone = state.zones.find((z) => z.id === hero.zoneId)!;
  const blocked = state.zombies.some((z) => z.zoneId === zone.id);
  const searchLimit = hero.id === "mali" ? 2 : 1;
  if (state.phase !== "player" || hero.actions < 1 || hero.searches >= searchLimit || zone.kind !== "building" || blocked || hero.inventory.length >= 5) return state;
  const mission = missions.find((item) => item.id === state.missionId) ?? missions[0];
  const lootPool = mission.mapId === "amusement"
    ? [weaponCatalog.machete, weaponCatalog.shotgun, weaponCatalog.medkit, weaponCatalog.shockBaton, weaponCatalog.fireworks, weaponCatalog.cottonCandy]
    : [weaponCatalog.machete, weaponCatalog.shotgun, weaponCatalog.axe, weaponCatalog.smg, weaponCatalog.rifle, weaponCatalog.molotov, weaponCatalog.medkit, weaponCatalog.katana, weaponCatalog.crossbow, weaponCatalog.flamethrower];
  const loot = lootPool[Math.floor(random(state) * lootPool.length)];
  hero.actions -= 1;
  hero.searches += 1;
  hero.searched = hero.searches >= searchLimit;
  hero.inventory.push({ ...loot });
  addLog(state, `${hero.name} ค้นพบ ${loot.name}`);
  return state;
}

export function takeObjective(source: GameState): GameState {
  const state = clone(source);
  const hero = active(state);
  const zone = state.zones.find((z) => z.id === hero.zoneId)!;
  if (state.phase !== "player" || hero.actions < 1 || !zone.objective || state.objectives.includes(zone.id)) return state;
  hero.actions -= 1;
  hero.adrenaline += 5;
  state.objectives.push(zone.id);
  addLog(state, `${hero.name} เก็บเสบียงที่ ${zone.name} (+5 adrenaline)`);
  return checkOutcome(state);
}

export function attack(source: GameState, weaponId: string, targetZoneId: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const weapon = hero.inventory.find((item) => item.id === weaponId);
  if (state.phase !== "player" || hero.actions < 1 || !weapon || weapon.kind === "item") return state;
  const distance = lineOfSightDistance(state, hero.zoneId, targetZoneId);
  if (distance > weapon.range || (weapon.kind === "melee" && distance !== 0)) return state;
  const eligible = state.zombies.filter((z) => z.zoneId === targetZoneId && zombieArmor(z.kind) <= weapon.damage);
  if (eligible.length === 0) return state;
  hero.actions -= 1;
  if (weapon.noisy) state.noise[hero.zoneId] = (state.noise[hero.zoneId] ?? 0) + 1;
  const dice = weapon.dice + (hero.id === "dao" && weapon.kind === "melee" ? 1 : 0) + (hero.adrenaline >= 19 ? 1 : 0);
  const rolls = Array.from({ length: dice }, () => rollD6(state));
  state.lastRoll = rolls;
  state.lastRollLabel = `${hero.name} · ${weapon.name}`;
  const target = Math.max(2, weapon.accuracy - (hero.adrenaline >= 43 ? 1 : 0));
  const hits = rolls.filter((roll) => roll >= target).length;
  const targetPriority: Record<ZombieKind, number> = { abomination: 0, mascot: 1, brute: 2, spitter: 3, crawler: 4, clown: 5, walker: 6, runner: 7 };
  const killed = weapon.singleUse && hits > 0
    ? eligible
    : eligible.sort((a, b) => targetPriority[a.kind] - targetPriority[b.kind]).slice(0, hits);
  const killedIds = new Set(killed.map((z) => z.id));
  state.zombies = state.zombies.filter((z) => !killedIds.has(z.id));
  hero.adrenaline += killed.reduce((sum, z) => sum + (z.kind === "abomination" ? 5 : z.kind === "brute" || z.kind === "spitter" || z.kind === "mascot" ? 2 : 1), 0);
  if (weapon.kind === "ranged") {
    const misses = rolls.length - hits;
    const allies = state.survivors.filter((survivor) => survivor.health > 0 && survivor.id !== hero.id && survivor.zoneId === targetZoneId);
    for (let index = 0; index < misses && allies.length > 0; index += 1) allies[index % allies.length].health -= 1;
    if (misses > 0 && allies.length > 0) addLog(state, `ยิงพลาดโดนพวกเดียวกัน ${Math.min(misses, allies.length)} แผล!`);
  }
  if (weapon.singleUse) hero.inventory = hero.inventory.filter((item) => item !== weapon);
  addLog(state, `${hero.name} ใช้${weapon.name} ทอย [${rolls.join(", ")}] — กำจัด ${killed.length} ตัว`);
  return checkOutcome(state);
}

export function makeNoise(source: GameState): GameState {
  const state = clone(source);
  const hero = active(state);
  if (state.phase !== "player" || hero.actions < 1) return state;
  hero.actions -= 1;
  state.noise[hero.zoneId] = (state.noise[hero.zoneId] ?? 0) + 1;
  addLog(state, `${hero.name} ส่งเสียงล่อฝูงซอมบี้`);
  return state;
}

export function tradeWeapon(source: GameState, weaponId: string, targetSurvivorId: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const target = state.survivors.find((survivor) => survivor.id === targetSurvivorId);
  const weaponIndex = hero.inventory.findIndex((weapon) => weapon.id === weaponId);
  if (state.phase !== "player" || hero.actions < 1 || weaponIndex < 0 || !target || target.health <= 0 || target.zoneId !== hero.zoneId || target.inventory.length >= 5) return state;
  const [weapon] = hero.inventory.splice(weaponIndex, 1);
  target.inventory.push(weapon);
  hero.actions -= 1;
  addLog(state, `${hero.name} ส่ง ${weapon.name} ให้ ${target.name}`);
  return state;
}

export function discardWeapon(source: GameState, weaponId: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const weaponIndex = hero.inventory.findIndex((weapon) => weapon.id === weaponId);
  if (state.phase !== "player" || weaponIndex < 0) return state;
  const [weapon] = hero.inventory.splice(weaponIndex, 1);
  addLog(state, `${hero.name} ทิ้ง ${weapon.name}`);
  return state;
}

/** Shop purchase: gives the active survivor a catalog item for free (no action cost). */
export function grantWeapon(source: GameState, weaponId: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const weapon = equipmentReference.find((item) => item.id === weaponId);
  if (state.phase !== "player" || hero.done || !weapon || hero.inventory.length >= 5) return state;
  hero.inventory.push(structuredClone(weapon));
  addLog(state, `${hero.name} ซื้อ${weapon.name} จากร้านค้า`);
  return state;
}

export function useItem(source: GameState, itemId: string): GameState {
  const state = clone(source);
  const hero = active(state);
  const item = hero.inventory.find((equipment) => equipment.id === itemId && equipment.kind === "item");
  if (state.phase !== "player" || hero.actions < 1 || !item) return state;
  if (item.effect === "heal" && hero.health >= hero.maxHealth) return state;
  hero.actions -= 1;
  const rolls = Array.from({ length: item.dice }, () => rollD6(state));
  const successes = rolls.filter((roll) => roll >= item.accuracy).length;
  state.lastRoll = rolls;
  state.lastRollLabel = `${hero.name} · ${item.name} · ต้องการ ${item.accuracy}+`;
  if (item.effect === "heal" && successes > 0) hero.health = Math.min(hero.maxHealth, hero.health + successes);
  if (item.effect === "adrenaline" && successes > 0) hero.adrenaline += 5;
  if (item.singleUse) hero.inventory = hero.inventory.filter((equipment) => equipment !== item);
  addLog(state, `${hero.name} ใช้${item.name} ทอย [${rolls.join(", ")}] — ${successes > 0 ? "สำเร็จ" : "ไม่สำเร็จ"}`);
  return state;
}

export function endActivation(source: GameState): GameState {
  const state = clone(source);
  if (state.phase !== "player") return state;
  active(state).actions = 0;
  active(state).done = true;
  const next = state.survivors.find((s) => s.health > 0 && !s.done);
  if (next) {
    state.activeSurvivorId = next.id;
    addLog(state, `ถึงตาของ ${next.name}`);
    return state;
  }
  return runZombiePhase(state);
}

export function selectSurvivor(source: GameState, survivorId: string): GameState {
  const state = clone(source);
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (state.phase !== "player" || !survivor || survivor.done || survivor.health <= 0) return state;
  state.activeSurvivorId = survivorId;
  return state;
}

export function runZombiePhase(source: GameState): GameState {
  const state = clone(source);
  if (state.phase !== "player") return state;
  state.phase = "zombie";
  addLog(state, "— Zombie phase —");

  const zombieOrder = [...state.zombies];
  for (const zombie of zombieOrder) {
    const actions = zombie.kind === "runner" || zombie.kind === "crawler" || zombie.kind === "clown" ? 2 : 1;
    for (let action = 0; action < actions; action += 1) {
      const currentZombie = state.zombies.find((z) => z.id === zombie.id);
      if (!currentZombie) break;
      const victimsHere = state.survivors.filter((survivor) => survivor.health > 0 && survivor.zoneId === currentZombie.zoneId);
      const spitTargets = currentZombie.kind === "spitter"
        ? state.survivors.filter((survivor) => survivor.health > 0 && shortestDistance(state, currentZombie.zoneId, survivor.zoneId) <= 1)
        : [];
      const victims = victimsHere.length > 0 ? victimsHere : spitTargets;
      if (victims.length > 0) {
        const victim = victims.sort((a, b) => a.health - b.health)[0];
        const damage = currentZombie.kind === "mascot" ? 2 : 1;
        victim.health -= damage;
        addLog(state, `${zombieLabel(currentZombie.kind)}${currentZombie.kind === "spitter" && victim.zoneId !== currentZombie.zoneId ? "พ่นพิษใส่" : "กัด"}${victim.name} (-${damage} HP)`);
        if (victim.health <= 0) {
          state.phase = "lost";
          addLog(state, `${victim.name} ถูกกำจัด — ภารกิจล้มเหลว`);
          return state;
        }
      } else {
        currentZombie.zoneId = nextZombieStep(state, currentZombie.zoneId);
      }
    }
  }

  for (const spawnZone of state.zones.filter((z) => z.spawn)) spawnZombies(state, spawnZone.id);
  state.noise = {};
  state.round += 1;
  state.phase = "player";
  for (const hero of state.survivors) {
    hero.actions = hero.adrenaline >= 7 ? 4 : 3;
    if (hero.id === "mika" && hero.health > 0 && hero.health < hero.maxHealth) hero.health += 1;
    hero.searched = false;
    hero.searches = 0;
    hero.moved = false;
    hero.done = false;
  }
  state.activeSurvivorId = state.survivors.find((s) => s.health > 0)!.id;
  addLog(state, `— รอบ ${state.round}: Player phase —`);
  return checkOutcome(state);
}

function spawnZombies(state: GameState, zoneId: string): void {
  const danger = Math.max(...state.survivors.map((s) => s.adrenaline));
  const mission = missions.find((item) => item.id === state.missionId) ?? missions[0];
  const maxCount = danger >= 19 ? 3 : danger >= 7 ? 2 : 1;
  const count = 1 + Math.floor(random(state) * maxCount);
  for (let index = 0; index < count; index += 1) {
    const roll = random(state);
    const kind: ZombieKind = mission.mapId === "amusement"
      ? danger >= 19 && roll > 0.95 ? "abomination" : roll > 0.83 ? "mascot" : roll > 0.57 ? "clown" : danger >= 7 && roll > 0.35 ? "runner" : "walker"
      : mission.mapId === "harbor"
        ? danger >= 19 && roll > 0.95 ? "abomination" : roll > 0.86 ? "brute" : roll > 0.68 ? "spitter" : roll > 0.46 ? "crawler" : danger >= 7 && roll > 0.28 ? "runner" : "walker"
        : danger >= 19 && roll > 0.94 ? "abomination" : danger >= 7 && roll > 0.72 ? "runner" : roll > 0.88 ? "brute" : "walker";
    state.zombies.push({ id: state.nextZombieId++, kind, zoneId });
  }
  addLog(state, `${zoneName(state, zoneId)}: ซอมบี้เกิด ${count} ตัว`);
}

function nextZombieStep(state: GameState, from: string): string {
  const living = state.survivors.filter((s) => s.health > 0);
  const targets = living.map((s) => ({ zoneId: s.zoneId, weight: (state.noise[s.zoneId] ?? 0) + 1 }));
  for (const [zoneId, value] of Object.entries(state.noise)) targets.push({ zoneId, weight: value });
  targets.sort((a, b) => b.weight - a.weight || shortestDistance(state, from, a.zoneId) - shortestDistance(state, from, b.zoneId));
  const target = targets[0]?.zoneId ?? living[0].zoneId;
  const current = state.zones.find((z) => z.id === from)!;
  const options = current.exits.filter((id) => !isDoorClosed(state, from, id));
  return options.sort((a, b) => shortestDistance(state, a, target) - shortestDistance(state, b, target))[0] ?? from;
}

function shortestDistance(state: GameState, start: string, target: string): number {
  if (start === target) return 0;
  const queue: Array<[string, number]> = [[start, 0]];
  const seen = new Set([start]);
  while (queue.length) {
    const [id, distance] = queue.shift()!;
    const zone = state.zones.find((z) => z.id === id)!;
    for (const exit of zone.exits) {
      if (seen.has(exit) || isDoorClosed(state, id, exit)) continue;
      if (exit === target) return distance + 1;
      seen.add(exit);
      queue.push([exit, distance + 1]);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function lineOfSightDistance(state: GameState, start: string, target: string): number {
  if (start === target) return 0;
  const origin = state.zones.find((zone) => zone.id === start)!;
  const destination = state.zones.find((zone) => zone.id === target)!;
  if (origin.row !== destination.row && origin.col !== destination.col) return Number.POSITIVE_INFINITY;
  const distance = Math.abs(origin.row - destination.row) + Math.abs(origin.col - destination.col);
  const rowStep = Math.sign(destination.row - origin.row);
  const colStep = Math.sign(destination.col - origin.col);
  let current = origin;
  for (let step = 0; step < distance; step += 1) {
    const next = state.zones.find((zone) => zone.row === current.row + rowStep && zone.col === current.col + colStep);
    if (!next || !current.exits.includes(next.id) || isDoorClosed(state, current.id, next.id)) return Number.POSITIVE_INFINITY;
    current = next;
  }
  return distance;
}

function checkOutcome(state: GameState): GameState {
  if (state.survivors.some((s) => s.health <= 0)) state.phase = "lost";
  const allHome = state.survivors.every((s) => state.zones.find((z) => z.id === s.zoneId)?.extraction);
  const mission = missions.find((item) => item.id === state.missionId) ?? missions[0];
  if (state.objectives.length === mission.objectiveZoneIds.length && allHome) {
    state.phase = "won";
    addLog(state, `ภารกิจสำเร็จใน ${state.round} รอบ!`);
  }
  return state;
}

function zoneName(state: GameState, id: string): string {
  return state.zones.find((z) => z.id === id)?.name ?? id;
}

function zombieArmor(kind: ZombieKind): number {
  if (kind === "abomination") return 3;
  return kind === "brute" || kind === "mascot" ? 2 : 1;
}

export function zombieLabel(kind: ZombieKind): string {
  if (kind === "walker") return "Walker";
  if (kind === "runner") return "Runner";
  if (kind === "brute") return "Brute";
  if (kind === "crawler") return "Crawler";
  if (kind === "spitter") return "Spitter";
  if (kind === "clown") return "Clown";
  if (kind === "mascot") return "Mascot";
  return "Abomination";
}

export function availableAttackZones(state: GameState, weapon: Weapon): string[] {
  if (weapon.kind === "item") return [];
  const hero = active(state);
  return state.zones
    .filter((zone) => lineOfSightDistance(state, hero.zoneId, zone.id) <= weapon.range)
    .filter((zone) => state.zombies.some((z) => z.zoneId === zone.id && zombieArmor(z.kind) <= weapon.damage))
    .map((zone) => zone.id);
}

export function getActiveSurvivor(state: GameState): Survivor {
  return active(state);
}
