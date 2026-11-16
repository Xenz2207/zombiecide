import "./style.css";
import "./fx.css";
import "./account.css";
import "./doors.css";
import "./ui.css";
import * as fx from "./fx";
import { claimClear, login, logout, purchase, register, restoreSession, usingServer, type Account, type ClearResult } from "./accounts";
import { shopPrices } from "./shop";
import { GameAudio, type SoundEffect } from "./audio";
import {
  attack,
  adrenalineTiers,
  availableAttackZones,
  closedDoorExits,
  createGame,
  discardWeapon,
  doorConnections,
  driveRide,
  driveVehicle,
  endActivation,
  equipmentReference,
  getActiveSurvivor,
  grantWeapon,
  isDoorClosed,
  makeNoise,
  mapThemes,
  missions,
  moveSurvivor,
  openDoor,
  searchZone,
  selectSurvivor,
  takeObjective,
  tradeWeapon,
  useItem,
  zombieLabel,
  zombieDescriptions,
  type GameState,
  type MissionId,
  type Weapon,
} from "./game";

const STORAGE_KEY = "dead-zone-protocol-save-v5";
let game = loadGame() ?? createGame();
let selectedWeaponId = "bat";
let history: GameState[] = [];
let showTutorial = true;
let showThemeIntro = false;
const audio = new GameAudio();
let account: Account | null = null;
let busy = false;
let modal: "auth" | "stages" | "shop" | null = null;
let authMode: "login" | "register" = "login";
let authError = "";
let authUsername = "";
let lastReward: ClearResult | null = null;
let shopNotice = "";

const app = document.querySelector<HTMLDivElement>("#app")!;

function dispatch(update: (state: GameState) => GameState, recordHistory = true, sound?: SoundEffect | (() => void), hint: fx.FxHint = {}): void {
  const previous = structuredClone(game);
  const snapshot = fx.capture(app);
  const next = update(game);
  const changed = JSON.stringify(next) !== JSON.stringify(game);
  if (recordHistory && changed) history.push(previous);
  game = next;
  if (changed) {
    if (typeof sound === "function") sound();
    else if (sound) audio.play(sound);
    playGameSounds(previous, game, hint);
    if (game.phase === "won" && previous.phase !== "won" && account) {
      // Claim once on the winning transition; clearing history blocks undo-and-rewin coin farming.
      const cleared = missions.find((item) => item.id === game.missionId);
      history = [];
      lastReward = null;
      void claimClear(game.missionId, cleared?.objectiveZoneIds.length ?? 0, game.round).then((claimed) => {
        if (!claimed) return;
        account = claimed.account;
        lastReward = claimed.result;
        audio.play("coin");
        render();
      });
    }
  }
  saveGame();
  const active = getActiveSurvivor(game);
  if (!active.inventory.some((weapon) => weapon.id === selectedWeaponId)) selectedWeaponId = active.inventory[0]?.id ?? "";
  render();
  if (changed) {
    fx.play(app, snapshot, previous, game, hint);
    announce(previous, game);
  }
}

/** Show newly logged events as toasts (the log card sits far below the board). */
function announce(previous: GameState, next: GameState): void {
  const seen = previous.log[0] === undefined ? -1 : next.log.indexOf(previous.log[0]);
  const fresh = (seen === -1 ? next.log.slice(0, 3) : next.log.slice(0, seen)).slice(0, 3).reverse();
  fresh.forEach((message, index) => {
    const tone = /ถูก|พลาดโดน|ซอมบี้เกิด|Zombie phase/.test(message) ? "danger" : /เก็บ|สำเร็จ|ซื้อ|ค้นพบ|กำจัด [1-9]/.test(message) ? "good" : "info";
    window.setTimeout(() => fx.toast(message, tone), index * 350);
  });
}

const after = (ms: number, fn: () => void): void => { window.setTimeout(fn, ms); };

/** Translate a state change into layered sound: zombie voices, kills, misses, damage, phase stingers. */
function playGameSounds(previous: GameState, next: GameState, hint: fx.FxHint): void {
  const phaseAdvanced = next.round > previous.round && next.phase === "player";
  const previousIds = new Set(previous.zombies.map((zombie) => zombie.id));
  const nextIds = new Set(next.zombies.map((zombie) => zombie.id));
  const spawned = next.zombies.filter((zombie) => !previousIds.has(zombie.id));
  const killed = previous.zombies.filter((zombie) => !nextIds.has(zombie.id));

  if (phaseAdvanced) {
    audio.play("zombiePhase");
    const kinds = [...new Set(next.zombies.map((zombie) => zombie.kind))].slice(0, 3);
    kinds.forEach((kind, index) => audio.playZombie(kind, "groan", 0.5 + index * 0.35));
    after(1500, () => audio.play("round"));
  }
  if (killed.length) {
    audio.play("kill");
    killed.slice(0, 3).forEach((zombie, index) => audio.playZombie(zombie.kind, "death", 0.08 + index * 0.14));
  } else if (hint.attackZone && next.lastRoll.length) {
    after(120, () => audio.play("miss"));
  }
  if (spawned.length) {
    audio.play("spawn");
    spawned.slice(0, 4).forEach((zombie, index) => audio.playZombie(zombie.kind, "spawn", (phaseAdvanced ? 0.7 : 0.15) + index * 0.2));
  }
  if (totalHealth(next) < totalHealth(previous)) {
    after(phaseAdvanced ? 420 : 0, () => audio.play("hurt"));
    if (next.survivors.some((survivor, index) => survivor.health === 0 && previous.survivors[index]?.health > 0)) after(phaseAdvanced ? 900 : 300, () => audio.play("down"));
  }
  if (next.phase !== previous.phase && next.phase === "won") after(500, () => audio.play("win"));
  if (next.phase !== previous.phase && next.phase === "lost") after(500, () => audio.play("lose"));
}

/** 0..1 danger level for the music: zombies near the active survivor, low health, overall horde size. */
function dangerLevel(state: GameState): number {
  const hero = getActiveSurvivor(state);
  const zone = state.zones.find((item) => item.id === hero.zoneId);
  const here = state.zombies.filter((zombie) => zombie.zoneId === hero.zoneId).length;
  const near = state.zombies.filter((zombie) => zone?.exits.includes(zombie.zoneId)).length;
  const living = state.survivors.filter((survivor) => survivor.health > 0);
  const lowHealth = living.length ? 1 - living.reduce((sum, survivor) => sum + survivor.health, 0) / living.reduce((sum, survivor) => sum + survivor.maxHealth, 0) : 1;
  return Math.min(1, here * 0.3 + near * 0.08 + lowHealth * 0.4 + Math.min(1, state.zombies.length / 25) * 0.2);
}

function render(): void {
  fx.syncClock();
  audio.setTension(dangerLevel(game));
  const hero = getActiveSurvivor(game);
  const mission = missions.find((item) => item.id === game.missionId) ?? missions[0];
  const theme = mapThemes[mission.mapId ?? "city"];
  const nextMission = missions[missions.findIndex((item) => item.id === mission.id) + 1];
  const currentZone = game.zones.find((zone) => zone.id === hero.zoneId)!;
  const selectedWeapon = hero.inventory.find((weapon) => weapon.id === selectedWeaponId) ?? hero.inventory[0];
  const attackZones = selectedWeapon ? availableAttackZones(game, selectedWeapon) : [];
  const tradeTargets = game.survivors.filter((survivor) => survivor.id !== hero.id && survivor.health > 0 && survivor.zoneId === hero.zoneId && survivor.inventory.length < 5);
  const canAct = game.phase === "player" && !hero.done && hero.actions > 0;
  const doors = doorConnections(game);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img class="brand-logo" src="/logo.svg" alt="Dead Zone Protocol" width="56" height="56" />
        <div><p>OPERATION</p><h1>DEAD ZONE <span>PROTOCOL</span></h1></div>
      </div>
      <div class="mission-strip">
        <select class="mission-select" data-mission aria-label="เลือกภารกิจ">
          ${missions.map((item) => `<option value="${item.id}" ${item.id === mission.id ? "selected" : ""}>${account?.cleared[item.id] ? "✓ " : ""}${item.name}</option>`).join("")}
        </select>
        <strong>เป้าหมาย ${game.objectives.length}/${mission.objectiveZoneIds.length}</strong>
        <i></i>
        <strong>กลับจุดอพยพ</strong>
      </div>
      <div class="top-actions">
        <button class="nav-button" data-open-modal="stages" title="ด่านทั้งหมด / ด่านที่ผ่านแล้ว">🗺 <span>ด่าน</span></button>
        <button class="nav-button" data-open-modal="shop" title="ร้านค้า">🛒 <span>ร้านค้า</span></button>
        ${account
          ? `<button class="account-chip" data-open-modal="auth" title="บัญชีของคุณ"><span class="avatar">${account.username.charAt(0).toUpperCase()}</span><span class="account-name">${account.username}</span><b class="coin">🪙 ${account.coins}</b></button>`
          : `<button class="nav-button login-button" data-open-modal="auth">🔐 <span>เข้าสู่ระบบ</span></button>`}
        <div class="audio-controls">
          <button class="icon-button audio-toggle ${audio.enabled ? "active" : ""}" data-audio-toggle aria-pressed="${audio.enabled}" title="${audio.enabled ? "ปิดเสียง" : "เปิดเสียง"}">${audio.enabled ? "🔊" : "🔇"}</button>
          <label title="ระดับเสียง"><span>เสียง</span><input data-audio-volume type="range" min="0" max="1" step="0.05" value="${audio.volume}" aria-label="ระดับเสียง"></label>
        </div>
        <button class="undo-button" data-action="undo" ${history.length === 0 ? "disabled" : ""} title="ย้อน action ล่าสุด (Ctrl+Z)"><span>↶</span> UNDO <b>${history.length}</b></button>
        <button class="icon-button" data-action="new" title="เริ่มเกมใหม่">↻</button>
      </div>
    </header>

    <main class="game-layout">
      <section class="board-panel">
        <div class="phase-ribbon ${game.phase}">
          <span>รอบ ${String(game.round).padStart(2, "0")}</span>
          <strong>${phaseLabel(game.phase)}</strong>
          <div class="phase-tools"><span>${game.zombies.length} hostiles</span>${game.lastRoll.map((roll, index) => `<i class="mini-die" style="--delay:${index * 55}ms">${roll}</i>`).join("")}</div>
        </div>
        <div class="mission-banner">
          <div><small>ภารกิจปัจจุบัน</small><h2>${mission.name}</h2><p>${mission.briefing}</p><div class="theme-brief"><b>${theme.name}</b><span>${theme.description}</span></div></div>
          <div class="mission-progress"><strong>${game.objectives.length}<span>/${mission.objectiveZoneIds.length}</span></strong><small>เป้าหมายสำเร็จ</small></div>
          <div class="mission-progress"><strong>${game.zombies.length}</strong><small>ศัตรูบนแผนที่</small></div>
        </div>
        <div class="board map-${mission.mapId ?? "city"}" aria-label="แผนที่ภารกิจ">
          ${game.zones.map((zone) => {
            const survivors = game.survivors.filter((survivor) => survivor.zoneId === zone.id && survivor.health > 0);
            const zombies = game.zombies.filter((zombie) => zombie.zoneId === zone.id);
            const canMove = canAct && currentZone.exits.includes(zone.id) && !isDoorClosed(game, currentZone.id, zone.id);
            const visibleClosedDoors = closedDoorExits(game, zone.id);
            const canOpenDoor = canAct && currentZone.exits.includes(zone.id) && isDoorClosed(game, currentZone.id, zone.id);
            const canAttack = canAct && attackZones.includes(zone.id);
            const canDrive = canAct && game.vehicleZoneId === hero.zoneId && currentZone.exits.includes(zone.id) && !isDoorClosed(game, currentZone.id, zone.id);
            const rideHere = game.rides.find((ride) => ride.zoneId === hero.zoneId);
            const canRide = canAct && Boolean(rideHere) && currentZone.exits.includes(zone.id) && !isDoorClosed(game, currentZone.id, zone.id);
            const rides = game.rides.filter((ride) => ride.zoneId === zone.id);
            const classes = ["zone", zone.kind, zone.spawn ? "spawn" : "", zone.extraction ? "extraction" : "", zone.id === hero.zoneId ? "active-zone" : "", canMove ? "can-move" : "", canAttack ? "can-attack" : ""].filter(Boolean).join(" ");
            return `
              <article class="${classes}" style="--row:${zone.row + 1};--col:${zone.col + 1}" data-zone="${zone.id}">
                <div class="zone-head">
                  <span>${zone.id.toUpperCase()}-${zone.row + 1}${zone.col + 1}</span>
                  ${zone.spawn ? '<b class="spawn-label">SPAWN</b>' : ""}
                  ${zone.extraction ? '<b class="exit-label">EXIT</b>' : ""}
                </div>
                <h2>${zone.name}</h2>
                ${visibleClosedDoors.length ? `<div class="door-indicators">${visibleClosedDoors.map((exit) => {
                  const other = game.zones.find((item) => item.id === exit)!;
                  return `<span class="door-indicator" style="--door:${doorColor(doors, zone.id, exit)}" title="ประตูปิดกั้นระหว่าง ${zone.name} กับ ${other.name}">🔒 ${directionArrow(zone, other)} ${other.name}</span>`;
                }).join("")}</div>` : ""}
                <div class="tokens">
                  ${zone.objective && !game.objectives.includes(zone.id) ? '<span class="objective" title="เสบียง">✦</span>' : ""}
                  ${survivors.map((survivor) => `<span data-fx-key="s:${survivor.id}" class="survivor-token ${survivor.id === hero.id ? "selected" : ""}" style="--portrait-x:${(survivor.portraitIndex % 3) * 50}%;--portrait-y:${Math.floor(survivor.portraitIndex / 3) * 100}%" title="${survivor.name}"><small>${survivor.health}</small></span>`).join("")}
                  ${zombies.map((zombie) => `<span data-fx-key="z:${zombie.id}" class="zombie-token ${zombie.kind}" style="--zombie-x:${zombieSpritePosition(zombie.kind)}%" title="${zombieLabel(zombie.kind)}"></span>`).join("")}
                  ${game.vehicleZoneId === zone.id ? '<span class="vehicle-token" title="รถกระบะ: ขับ 1 action และพาทุกคนในโซนไปด้วย">🚙</span>' : ""}
                  ${rides.map((ride) => `<span class="vehicle-token ${ride.kind}" title="${ride.name}">${ride.kind === "coaster" ? "🎢" : "🏎️"}</span>`).join("")}
                  ${(game.noise[zone.id] ?? 0) > 0 ? `<span class="noise-token">◖ ${game.noise[zone.id]}</span>` : ""}
                </div>
                ${canMove ? '<span class="zone-hint">เดินมาที่นี่</span>' : ""}
                ${canOpenDoor ? '<button class="door-button" data-open-door="' + zone.id + '">เปิดประตู</button>' : ""}
                ${canAttack ? '<button class="attack-button" data-attack-zone="' + zone.id + '">โจมตี</button>' : ""}
                ${canDrive ? '<button class="vehicle-button" data-drive-zone="' + zone.id + '">ขับรถมาที่นี่</button>' : ""}
                ${canRide && rideHere ? `<button class="vehicle-button ride-button" data-ride-zone="${zone.id}" data-ride-id="${rideHere.id}">ใช้${rideHere.name}</button>` : ""}
              </article>`;
          }).join("")}
          ${doors.map((door, index) => doorMarker(door, index, hero.zoneId, canAct)).join("")}
        </div>
        <div class="legend">
          ${doors.length ? '<span><i class="dot door-closed"></i> 🔒 ประตูปิดกั้น (สีเดียวกัน = ประตูบานเดียวกัน)</span><span><i class="dot door-open"></i> 🔓 ประตูเปิดแล้ว</span>' : ""}
          <span><i class="dot survivor"></i> ผู้รอดชีวิต</span>
          <span><i class="dot walker"></i> Walker</span>
          <span><i class="dot runner"></i> Runner ×2 actions</span>
          <span><i class="dot brute"></i> Brute: damage 2+</span>
          <span><i class="dot abomination"></i> Abomination: damage 3+</span>
          <span><i class="dot crawler"></i> Crawler ×2 actions</span>
          <span><i class="dot spitter"></i> Spitter: โจมตีข้ามโซน</span>
          <span><i class="dot clown"></i> Clown ×2 actions</span>
          <span><i class="dot mascot"></i> Mascot: damage 2 / โจมตี 2 HP</span>
          ${game.vehicleZoneId ? '<span><i class="dot vehicle"></i> รถกระบะ: พาทีมเคลื่อนที่</span>' : ""}
          ${game.rides.length ? '<span><i class="dot ride"></i> เครื่องเล่น: เคลื่อนที่ 1 action</span>' : ""}
        </div>
      </section>

      <aside class="control-panel">
        <section class="survivor-card">
          <div class="survivor-switcher">
            ${game.survivors.map((survivor) => `<button data-survivor="${survivor.id}" class="survivor-tab ${survivor.id === hero.id ? "active" : ""} ${survivor.done ? "done" : ""}" ${survivor.done || game.phase !== "player" ? "disabled" : ""}>${survivor.name}<small>${survivor.done ? "จบตา" : `${survivor.actions} AP`}</small></button>`).join("")}
          </div>
          <div class="portrait" style="--portrait-x:${(hero.portraitIndex % 3) * 50}%;--portrait-y:${Math.floor(hero.portraitIndex / 3) * 100}%"></div>
          <div class="survivor-info">
            <p>ACTIVE SURVIVOR</p>
            <h2>${hero.name}</h2>
            <div class="stats">
              <span>HP <b>${healthPips(hero.health, hero.maxHealth)}</b></span>
              <span>ADRENALINE <b>${hero.adrenaline}</b></span>
            </div>
            <p class="skill-text">${hero.skill}</p>
            <div class="adrenaline-tiers">
              ${adrenalineTiers.map((tier) => `<div class="${hero.adrenaline >= tier.value ? "unlocked" : ""}"><b>${tier.value}</b><span>${tier.label}</span></div>`).join("")}
            </div>
          </div>
          <div class="action-points">
            <small>ACTIONS</small>
            <strong>${hero.actions}</strong>
          </div>
        </section>

        <section class="action-card">
          <div class="section-title"><span>คำสั่ง</span><small>${currentZone.name}</small></div>
          <div class="primary-actions">
            <button data-action="search" ${!canSearch(game) ? "disabled" : ""}><i>⌕</i><span>ค้นของ<small>${hero.id === "mali" ? `${hero.searches}/2 ครั้ง` : "อาคาร / 1 ครั้งต่อตา"}</small></span><b>1</b></button>
            <button data-action="objective" ${!canObjective(game) ? "disabled" : ""}><i>✦</i><span>เก็บเสบียง<small>เป้าหมายภารกิจ</small></span><b>1</b></button>
            <button data-action="noise" ${!canAct ? "disabled" : ""}><i>◖</i><span>ส่งเสียง<small>ล่อซอมบี้มาที่นี่</small></span><b>1</b></button>
          </div>

          <div class="section-title inventory-title"><span>อาวุธ</span><small>${hero.inventory.length}/5</small></div>
          <div class="inventory">
            ${hero.inventory.map((weapon) => weaponCard(weapon, selectedWeapon?.id === weapon.id, canAct, hero.health < hero.maxHealth)).join("")}
          </div>
          <p class="combat-help">เลือกอาวุธ แล้วกดโซนสีแดงเพื่อโจมตี</p>
          ${selectedWeapon && tradeTargets.length > 0 ? `<div class="trade-row"><span>ส่งอาวุธ ${selectedWeapon.name} ให้</span>${tradeTargets.map((survivor) => `<button data-trade="${survivor.id}" ${!canAct ? "disabled" : ""}>${survivor.name}</button>`).join("")}</div>` : ""}
          <button class="end-turn" data-action="end" ${game.phase !== "player" || hero.done ? "disabled" : ""}>จบตา ${hero.name} <span>→</span></button>
        </section>

        <section class="log-card">
          <div class="section-title"><span>บันทึกภารกิจ</span><small>ล่าสุด</small></div>
          <ol>${game.log.map((entry, index) => `<li class="${index === 0 ? "latest" : ""}"><time>${String(Math.max(1, game.round - Math.floor(index / 4))).padStart(2, "0")}</time><span>${entry}</span></li>`).join("")}</ol>
        </section>

        <section class="dice-card">
          <div class="section-title"><span>ลูกเต๋า</span><small>${game.lastRollLabel || "รอการใช้อุปกรณ์"}</small></div>
          <div class="dice-tray">
            ${game.lastRoll.length ? game.lastRoll.map((roll, index) => `<span class="die" style="--delay:${index * 70}ms">${roll}</span>`).join("") : '<p class="dice-empty">ลูกเต๋าจะทอยอัตโนมัติเมื่อโจมตีหรือใช้ไอเท็ม ตามจำนวนลูกและค่าเป้าหมายของการ์ดนั้น</p>'}
          </div>
        </section>

        <details class="codex-card">
          <summary>คู่มืออาวุธและศัตรู <span>＋</span></summary>
          <div class="codex-content">
            <h3>อาวุธและไอเท็ม</h3>
            ${equipmentReference.map((weapon) => `<article><b>${weapon.name}</b><small>${weapon.dice}D · ${weapon.accuracy}+ · DMG ${weapon.damage === 99 ? "∞" : weapon.damage} · ระยะ ${weapon.range}</small><p>${weapon.description}</p></article>`).join("")}
            <h3>ยานพาหนะ</h3>
            <article><b>รถกระบะ</b><p>ผู้รอดชีวิตที่อยู่โซนเดียวกับรถสามารถขับไปโซนติดกันด้วย 1 action รถจะพาทุกคนในโซนไปพร้อมกันและสร้างเสียง 2</p></article>
            <article><b>รถไฟเหาะ</b><p>ขนผู้รอดชีวิตทุกคนในโซนไปด้วย 1 action และสร้างเสียง 3</p></article>
            <article><b>รถบั๊ม</b><p>ขนเฉพาะคนขับไปโซนติดกันด้วย 1 action และสร้างเสียง 1</p></article>
            <h3>ข้อมูลธีม — ${theme.name}</h3>
            <article class="theme-guide"><b>สภาพแผนที่</b><p>${theme.description}</p></article>
            <article class="theme-guide"><b>ไอเท็มประจำธีม</b><p>${theme.items}</p></article>
            <article class="theme-guide"><b>ซอมบี้ประจำธีม</b><p>${theme.zombies}</p></article>
            <article class="theme-guide"><b>ยานพาหนะ</b><p>${theme.vehicles}</p></article>
            <h3>ซอมบี้</h3>
            ${Object.entries(zombieDescriptions).map(([kind, description]) => `<article class="enemy-entry"><i class="zombie-token ${kind}" style="--zombie-x:${zombieSpritePosition(kind)}%"></i><div><b>${zombieLabel(kind as Parameters<typeof zombieLabel>[0])}</b><p>${description}</p></div></article>`).join("")}
          </div>
        </details>
      </aside>
    </main>

    ${game.phase === "won" || game.phase === "lost" ? `
      <div class="modal-backdrop">
        <div class="result-modal ${game.phase}">
          <small>MISSION STATUS</small>
          <h2>${game.phase === "won" ? "อพยพสำเร็จ" : "ภารกิจล้มเหลว"}</h2>
          <p>${game.phase === "won" ? `ทีมกลับถึงจุดอพยพพร้อมเสบียงครบใน ${game.round} รอบ` : "ผู้รอดชีวิตถูกกำจัด ฝูงซอมบี้ครองพื้นที่แล้ว"}</p>
          ${game.phase === "won" ? (lastReward
            ? `<div class="reward-box"><b>🪙 +${lastReward.reward}</b><span>${lastReward.firstClear ? "โบนัสผ่านด่านครั้งแรก!" : "เหรียญจากการเล่นซ้ำ"}${lastReward.newBest ? " · ทำสถิติรอบใหม่!" : ""}</span></div>`
            : `<div class="reward-box guest"><span>ล็อกอินเพื่อเก็บเหรียญและบันทึกด่านที่ผ่าน</span><button data-open-modal="auth">เข้าสู่ระบบ</button></div>`) : ""}
          <div class="result-actions">
            ${game.phase === "won" && nextMission ? `<button data-action="next" data-next-mission="${nextMission.id}">ด่านถัดไป — ${nextMission.name}</button>` : ""}
            <button data-action="new">เล่นด่านนี้อีกครั้ง</button>
          </div>
        </div>
      </div>` : ""}

    ${showTutorial ? `
      <div class="tutorial-backdrop">
        <section class="tutorial-modal">
          <small>RULE TUTORIAL</small>
          <h2>วิธีเอาตัวรอด</h2>
          <div class="tutorial-grid">
            <article><b>1 · ใช้ Action</b><p>เลือกผู้รอดชีวิต เดิน ค้นของ เก็บเป้าหมาย หรือโจมตี เมื่อทุกคนจบตาจะเข้าสู่ Zombie phase</p></article>
            <article><b>2 · ชนะภารกิจ</b><p>เก็บเป้าหมายให้ครบ แล้วพาผู้รอดชีวิตทุกคนกลับไปยังโซน EXIT</p></article>
            <article><b>3 · ต่อสู้</b><p>เลือกอาวุธแล้วกดโซนสีแดง จำนวนลูกเต๋า ค่าเป้าหมาย Damage และระยะอยู่บนการ์ดอาวุธ</p></article>
            <article><b>4 · Adrenaline</b><p>กำจัดซอมบี้และเก็บเป้าหมายเพื่อปลดล็อกความสามารถที่ 7, 19 และ 43 adrenaline</p></article>
            <article><b>5 · เสียงและซอมบี้</b><p>เสียงดึงฝูงซอมบี้ ชนิดพิเศษมีกติกาต่างกัน ตรวจได้จากคู่มือประจำธีม</p></article>
            <article><b>6 · ยานพาหนะ</b><p>ยืนโซนเดียวกับรถหรือเครื่องเล่น แล้วกดปุ่มบนโซนปลายทางเพื่อเคลื่อนที่ด้วย 1 action</p></article>
          </div>
          <button data-action="tutorial-close">เริ่มภารกิจ</button>
        </section>
      </div>` : ""}

    ${showThemeIntro ? `
      <div class="tutorial-backdrop theme-intro-backdrop">
        <section class="tutorial-modal theme-intro-modal">
          <small>NEW MAP THEME</small>
          <h2>${theme.name}</h2>
          <p class="theme-intro-description">${theme.description}</p>
          <div class="theme-intro-grid">
            <article><b>ไอเท็มใหม่</b><p>${theme.items}</p></article>
            <article><b>ซอมบี้ใหม่</b><p>${theme.zombies}</p></article>
            <article><b>ยานพาหนะ</b><p>${theme.vehicles}</p></article>
          </div>
          <button data-action="theme-close">เข้าสู่แผนที่ใหม่</button>
        </section>
      </div>` : ""}
    ${renderModal()}
  `;

  bindEvents();
}

function modalShell(title: string, subtitle: string, body: string, wide = false): string {
  return `<div class="tutorial-backdrop account-backdrop" data-modal-backdrop>
    <section class="tutorial-modal account-modal ${wide ? "wide" : ""}">
      <button class="modal-x" data-modal-close aria-label="ปิด">×</button>
      <small>${subtitle}</small><h2>${title}</h2>${body}
    </section></div>`;
}

function renderModal(): string {
  if (!modal) return "";
  if (modal === "auth") {
    if (account) {
      const clearedCount = Object.keys(account.cleared).length;
      return modalShell("บัญชีของคุณ", "ACCOUNT", `
        <div class="account-summary"><span class="avatar big">${account.username.charAt(0).toUpperCase()}</span><div><b>${account.username}</b><p>ผ่านด่านแล้ว ${clearedCount}/${missions.length} ด่าน</p></div><strong class="coin big">🪙 ${account.coins}</strong></div>
        <p class="auth-note">${usingServer ? "ข้อมูลเก็บบนเซิร์ฟเวอร์ — เข้าสู่ระบบจากเครื่องไหนก็เล่นต่อได้" : "โหมดออฟไลน์: ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น"}</p>
        <button class="primary-wide" data-logout>ออกจากระบบ</button>`);
    }
    return modalShell(authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก", "ACCOUNT", `
      <div class="auth-tabs"><button class="${authMode === "login" ? "active" : ""}" data-auth-mode="login">เข้าสู่ระบบ</button><button class="${authMode === "register" ? "active" : ""}" data-auth-mode="register">สมัครสมาชิก</button></div>
      <form class="auth-form" data-auth-form>
        <label>ชื่อผู้ใช้<input name="username" autocomplete="username" maxlength="16" required value="${esc(authUsername)}"></label>
        <label>รหัสผ่าน<input name="password" type="password" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" maxlength="100" required></label>
        ${authError ? `<p class="auth-error" role="alert">${esc(authError)}</p>` : ""}
        <button class="primary-wide" type="submit" ${busy ? "disabled" : ""}>${busy ? "กำลังดำเนินการ…" : authMode === "login" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}</button>
      </form>
      <p class="auth-note">ไม่ล็อกอินก็เล่นได้ตามปกติ — ล็อกอินเพื่อเก็บเหรียญ ดูด่านที่ผ่านแล้ว และใช้ร้านค้า</p>`);
  }
  if (modal === "stages") {
    const cleared = account?.cleared ?? {};
    const total = Object.keys(cleared).length;
    const groups = (Object.keys(mapThemes) as (keyof typeof mapThemes)[]).map((mapId) => {
      const items = missions.filter((item) => (item.mapId ?? "city") === mapId);
      return `<h3>${mapThemes[mapId].name}</h3><div class="stage-grid">${items.map((item) => {
        const record = cleared[item.id];
        return `<article class="stage-card ${record ? "cleared" : ""} ${item.id === game.missionId ? "current" : ""}">
          <b>${item.name}</b>
          <small>${record ? `✓ ผ่านแล้ว · ดีที่สุด ${record.bestRounds} รอบ · เล่นผ่าน ${record.clears} ครั้ง` : account ? "ยังไม่ผ่าน" : "—"}</small>
          <button data-play-mission="${item.id}">${record ? "เล่นซ้ำ" : item.id === game.missionId ? "กำลังเล่น" : "เล่นด่านนี้"}</button>
        </article>`;
      }).join("")}</div>`;
    }).join("");
    return modalShell("เลือกด่าน", "MISSIONS", `
      ${account ? `<div class="stage-progress"><span>ความคืบหน้า</span><div class="bar"><i style="width:${(total / missions.length) * 100}%"></i></div><b>${total}/${missions.length}</b></div>` : `<p class="auth-note guest-note">ล็อกอินเพื่อบันทึกด่านที่ผ่านแล้ว <button data-open-modal="auth">เข้าสู่ระบบ</button></p>`}
      ${groups}<p class="auth-note">การเปลี่ยนด่านจะเริ่มด่านนั้นใหม่</p>`, true);
  }
  const hero = getActiveSurvivor(game);
  const canBuyNow = game.phase === "player" && !hero.done && hero.inventory.length < 5;
  const rows = equipmentReference.filter((item) => shopPrices[item.id] !== undefined).sort((a, b) => shopPrices[a.id] - shopPrices[b.id]).map((item) => {
    const price = shopPrices[item.id];
    const affordable = (account?.coins ?? 0) >= price;
    return `<article class="shop-item"><div><b>${item.name}</b><small>${item.kind === "item" ? "ไอเท็มใช้แล้วทิ้ง" : `${item.dice}D · ${item.accuracy}+ · DMG ${item.damage === 99 ? "∞" : item.damage} · ระยะ ${item.range}`}</small><p>${item.description}</p></div>
      <button data-buy="${item.id}" ${!account || !affordable || !canBuyNow || busy ? "disabled" : ""}>🪙 ${price}</button></article>`;
  }).join("");
  const hint = !account ? "ล็อกอินเพื่อใช้ร้านค้า" : !canBuyNow ? (hero.inventory.length >= 5 ? "กระเป๋าเต็ม (5/5) — ทิ้งอาวุธก่อน" : "ซื้อได้เฉพาะช่วง Player Phase ของผู้รอดชีวิตที่ยังไม่จบตา") : `ซื้อให้ ${hero.name} · กระเป๋า ${hero.inventory.length}/5`;
  return modalShell("ร้านค้า", "SHOP", `
    <div class="shop-head"><span>${hint}</span><strong class="coin">🪙 ${account?.coins ?? 0}</strong></div>
    ${shopNotice ? `<p class="auth-error" role="alert">${esc(shopNotice)}</p>` : ""}
    ${!account ? `<p class="auth-note guest-note"><button data-open-modal="auth">เข้าสู่ระบบ</button> เพื่อซื้อไอเท็มด้วยเหรียญ</p>` : ""}
    <div class="shop-list">${rows}</div>
    <p class="auth-note">ไอเท็มที่ซื้อเข้ากระเป๋าทันทีโดยไม่เสีย action · หลังซื้อจะย้อน (Undo) ไปก่อนหน้าไม่ได้</p>`, true);
}

const doorPalette = ["#ffb347", "#4fd1ff", "#ff6fa8", "#b58cff", "#6ee7a0", "#ffe066"];

function doorColor(doors: ReturnType<typeof doorConnections>, a: string, b: string): string {
  const index = doors.findIndex((door) => (door.a === a && door.b === b) || (door.a === b && door.b === a));
  return doorPalette[Math.max(0, index) % doorPalette.length];
}

function directionArrow(from: GameState["zones"][number], to: GameState["zones"][number]): string {
  if (to.row === from.row) return to.col > from.col ? "→" : "←";
  return to.row > from.row ? "↓" : "↑";
}

/** A door drawn on the shared border of its two rooms (grid cell of the left/top room, pinned to its right/bottom edge). */
function doorMarker(door: ReturnType<typeof doorConnections>[number], index: number, heroZoneId: string, canAct: boolean): string {
  const za = game.zones.find((zone) => zone.id === door.a)!;
  const zb = game.zones.find((zone) => zone.id === door.b)!;
  const horizontal = za.row === zb.row; // rooms side by side → vertical door bar
  const [first, second] = horizontal ? (za.col < zb.col ? [za, zb] : [zb, za]) : za.row < zb.row ? [za, zb] : [zb, za];
  const target = heroZoneId === door.a ? door.b : heroZoneId === door.b ? door.a : null;
  const clickable = !door.open && canAct && target !== null;
  const label = `${door.open ? "ประตูเปิดแล้ว" : "ประตูปิด"}: ${first.name} ↔ ${second.name}${clickable ? " (กดเพื่อเปิด)" : ""}`;
  const tag = clickable ? "button" : "div";
  return `<${tag} class="door-marker ${horizontal ? "v" : "h"} ${door.open ? "open" : "closed"} ${clickable ? "ready" : ""}" style="--row:${first.row + 1};--col:${first.col + 1};--door:${doorPalette[index % doorPalette.length]}" title="${label}" aria-label="${label}" ${clickable ? `data-open-door="${target}"` : ""}>
    <span class="door-icon">${door.open ? "🔓" : "🔒"}</span>
  </${tag}>`;
}

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function openModal(next: typeof modal): void {
  modal = next;
  authError = "";
  shopNotice = "";
  audio.play("ui");
  render();
}

function bindAccountEvents(): void {
  app.querySelectorAll<HTMLElement>("[data-open-modal]").forEach((el) => el.addEventListener("click", () => openModal(el.dataset.openModal as typeof modal)));
  app.querySelectorAll<HTMLElement>("[data-modal-close]").forEach((el) => el.addEventListener("click", () => openModal(null)));
  app.querySelector<HTMLElement>("[data-modal-backdrop]")?.addEventListener("mousedown", (event) => {
    if (event.target === event.currentTarget) openModal(null);
  });
  app.querySelectorAll<HTMLElement>("[data-auth-mode]").forEach((el) => el.addEventListener("click", () => { authMode = el.dataset.authMode as typeof authMode; authError = ""; render(); }));
  app.querySelector<HTMLElement>("[data-logout]")?.addEventListener("click", async () => {
    await logout();
    account = null;
    lastReward = null;
    modal = null;
    render();
  });
  app.querySelector<HTMLFormElement>("[data-auth-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    authUsername = String(form.get("username") ?? "");
    busy = true;
    authError = "";
    render();
    const result = await (authMode === "login" ? login : register)(authUsername, String(form.get("password") ?? ""));
    busy = false;
    if (result.ok) {
      account = result.account;
      audio.play("powerup");
      modal = null;
      authUsername = "";
    } else {
      authError = result.error;
      audio.play("error");
    }
    render();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-play-mission]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.playMission as MissionId;
    modal = null;
    if (id === game.missionId && game.phase === "player") { render(); return; }
    startMission(id, true);
  }));
  app.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((button) => button.addEventListener("click", async () => {
    const itemId = button.dataset.buy!;
    const hero = getActiveSurvivor(game);
    if (busy || game.phase !== "player" || hero.done || hero.inventory.length >= 5) return;
    busy = true;
    shopNotice = "";
    const result = await purchase(itemId, shopPrices[itemId]);
    busy = false;
    if (!result.ok) {
      shopNotice = result.error;
      audio.play("error");
      render();
      return;
    }
    account = result.account;
    history = []; // coins are spent: block undo from silently discarding the purchase
    dispatch((state) => grantWeapon(state, itemId), false, "buy");
  }));
}

function bindEvents(): void {
  bindAccountEvents();
  app.querySelectorAll<HTMLElement>("[data-zone]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const zoneId = element.dataset.zone!;
      dispatch((state) => moveSurvivor(state, zoneId), true, "move");
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-open-door]").forEach((button) => button.addEventListener("click", () => dispatch((state) => openDoor(state, button.dataset.openDoor!), true, "door", { doorZone: button.dataset.openDoor! })));
  app.querySelectorAll<HTMLButtonElement>("[data-attack-zone]").forEach((button) => button.addEventListener("click", () => dispatch((state) => attack(state, selectedWeaponId, button.dataset.attackZone!), true, () => audio.playWeapon(selectedWeaponId), { attackZone: button.dataset.attackZone!, weaponKind: getActiveSurvivor(game).inventory.find((w) => w.id === selectedWeaponId)?.kind })));
  app.querySelectorAll<HTMLButtonElement>("[data-drive-zone]").forEach((button) => button.addEventListener("click", () => dispatch((state) => driveVehicle(state, button.dataset.driveZone!), true, "vehicle")));
  app.querySelectorAll<HTMLButtonElement>("[data-ride-zone]").forEach((button) => button.addEventListener("click", () => dispatch((state) => driveRide(state, button.dataset.rideId!, button.dataset.rideZone!), true, button.dataset.rideId === "coaster" ? "coaster" : "bumper")));
  app.querySelectorAll<HTMLButtonElement>("[data-weapon]").forEach((button) => button.addEventListener("click", () => { selectedWeaponId = button.dataset.weapon!; audio.play("ui"); render(); }));
  app.querySelectorAll<HTMLButtonElement>("[data-survivor]").forEach((button) => button.addEventListener("click", () => dispatch((state) => selectSurvivor(state, button.dataset.survivor!), false, "ui")));
  app.querySelectorAll<HTMLButtonElement>("[data-trade]").forEach((button) => button.addEventListener("click", () => dispatch((state) => tradeWeapon(state, selectedWeaponId, button.dataset.trade!), true, "trade")));
  app.querySelectorAll<HTMLButtonElement>("[data-discard]").forEach((button) => button.addEventListener("click", () => dispatch((state) => discardWeapon(state, button.dataset.discard!), true, "discard")));
  app.querySelectorAll<HTMLButtonElement>("[data-use-item]").forEach((button) => button.addEventListener("click", () => dispatch((state) => useItem(state, button.dataset.useItem!), true, button.dataset.useItem === "medkit" ? "heal" : "powerup")));
  app.querySelector<HTMLButtonElement>("[data-audio-toggle]")?.addEventListener("click", () => {
    const mapId = missions.find((mission) => mission.id === game.missionId)?.mapId ?? "city";
    audio.toggle(mapId);
    audio.play("ui");
    render();
  });
  app.querySelector<HTMLInputElement>("[data-audio-volume]")?.addEventListener("input", (event) => {
    audio.setVolume(Number((event.target as HTMLInputElement).value));
  });
  app.querySelector<HTMLSelectElement>("[data-mission]")?.addEventListener("change", (event) => {
    startMission((event.target as HTMLSelectElement).value as MissionId, true);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "new") { game = createGame(Date.now(), game.missionId); history = []; lastReward = null; selectedWeaponId = "bat"; audio.play("ui"); saveGame(); render(); }
    if (action === "next") startMission(button.dataset.nextMission as MissionId, true);
    if (action === "tutorial-close") {
      showTutorial = false;
      const mapId = missions.find((mission) => mission.id === game.missionId)?.mapId ?? "city";
      audio.start(mapId);
      audio.play("ui");
      render();
    }
    if (action === "theme-close") { showThemeIntro = false; audio.play("ui"); render(); }
    if (action === "undo" && history.length > 0) {
      game = history.pop()!;
      saveGame();
      const hero = getActiveSurvivor(game);
      selectedWeaponId = hero.inventory[0]?.id ?? "";
      audio.play("ui");
      render();
    }
    if (action === "search") dispatch(searchZone, true, "search");
    if (action === "objective") dispatch(takeObjective, true, "objective");
    if (action === "noise") dispatch(makeNoise, true, "noise");
    if (action === "end") dispatch(endActivation, true, "ui");
  }));
}

function startMission(missionId: MissionId, announceTheme: boolean): void {
  const currentMap = missions.find((mission) => mission.id === game.missionId)?.mapId ?? "city";
  const nextMap = missions.find((mission) => mission.id === missionId)?.mapId ?? "city";
  game = createGame(Date.now(), missionId);
  history = [];
  lastReward = null;
  selectedWeaponId = "bat";
  showThemeIntro = announceTheme && currentMap !== nextMap;
  audio.setTheme(nextMap);
  audio.play("ui");
  saveGame();
  render();
}

function saveGame(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
}

function loadGame(): GameState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as GameState : null;
  } catch {
    return null;
  }
}

function phaseLabel(phase: GameState["phase"]): string {
  if (phase === "player") return "PLAYER PHASE";
  if (phase === "zombie") return "ZOMBIE PHASE";
  return phase === "won" ? "MISSION COMPLETE" : "MISSION FAILED";
}

function healthPips(current: number, max: number): string {
  return Array.from({ length: max }, (_, index) => `<i class="heart ${index < current ? "full" : ""}">♥</i>`).join("");
}

function totalHealth(state: GameState): number {
  return state.survivors.reduce((total, survivor) => total + survivor.health, 0);
}

function canSearch(state: GameState): boolean {
  const hero = getActiveSurvivor(state);
  const zone = state.zones.find((item) => item.id === hero.zoneId)!;
  const limit = hero.id === "mali" ? 2 : 1;
  return state.phase === "player" && hero.actions > 0 && hero.searches < limit && hero.inventory.length < 5 && zone.kind === "building" && !state.zombies.some((zombie) => zombie.zoneId === zone.id);
}

function canObjective(state: GameState): boolean {
  const hero = getActiveSurvivor(state);
  const zone = state.zones.find((item) => item.id === hero.zoneId)!;
  return state.phase === "player" && hero.actions > 0 && Boolean(zone.objective) && !state.objectives.includes(zone.id);
}

function weaponCard(weapon: Weapon, selected: boolean, enabled: boolean, wounded: boolean): string {
  return `<div class="weapon-row"><button class="weapon ${selected ? "selected" : ""}" data-weapon="${weapon.id}" ${!enabled ? "disabled" : ""} title="${weapon.description}">
      <span class="weapon-icon">${weapon.kind === "melee" ? "⟋" : weapon.kind === "ranged" ? "⌐" : "✚"}</span>
      <span><strong>${weapon.name}</strong><small>${weapon.kind === "melee" ? "ประชิด" : weapon.kind === "ranged" ? `ระยะ ${weapon.range}` : "ไอเท็มใช้แล้วทิ้ง"} · ${weapon.dice} ลูกเต๋า · ${weapon.accuracy}+<em>${weapon.description}</em></small></span>
      <b>DMG<br>${weapon.damage === 99 ? "∞" : weapon.damage}</b>
    </button>${weapon.kind === "item" ? `<button class="use-item-button" data-use-item="${weapon.id}" ${!enabled || (weapon.effect === "heal" && !wounded) ? "disabled" : ""}>ใช้</button>` : ""}<button class="discard-button" data-discard="${weapon.id}" title="ทิ้ง ${weapon.name}">×</button></div>`;
}

function zombieSpritePosition(kind: string): number {
  return ({ walker: 0, runner: 33.333, brute: 66.667, abomination: 100, crawler: 0, spitter: 100, clown: 0, mascot: 100 } as Record<string, number>)[kind] ?? 0;
}

render();
fx.attachPressFeedback();
void restoreSession().then((restored) => {
  if (restored) { account = restored; render(); }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal) { openModal(null); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && history.length > 0) {
    event.preventDefault();
    game = history.pop()!;
    saveGame();
    selectedWeaponId = getActiveSurvivor(game).inventory[0]?.id ?? "";
    audio.play("ui");
    render();
  }
});
