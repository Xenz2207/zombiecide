import type { GameState } from "./game";

export interface FxHint {
  attackZone?: string;
  weaponKind?: "melee" | "ranged" | "item";
  doorZone?: string;
}

interface Snapshot {
  rects: Map<string, DOMRect>;
  html: Map<string, string>;
  zoneRects: Map<string, DOMRect>;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

let layer: HTMLDivElement | null = null;
function fxLayer(): HTMLDivElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

/** Floating event messages near the bottom of the screen, so players don't have to scroll to the log card. */
export function toast(message: string, tone: "info" | "danger" | "good" = "info"): void {
  const host = fxLayer();
  let stack = host.querySelector<HTMLDivElement>(".fx-toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "fx-toasts";
    host.appendChild(stack);
  }
  while (stack.children.length >= 4) stack.firstElementChild?.remove();
  const el = document.createElement("div");
  el.className = `fx-toast ${tone}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }, 3600);
}

/** Bump an element's text (coins, counters). Safe to call right after a re-render. */
export function pop(selector: string): void {
  document.querySelectorAll(selector).forEach((el) => {
    el.classList.remove("fx-pop");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("fx-pop");
  });
}

/** Click ripple + press feedback. Lives in the fx layer so it survives innerHTML re-renders. */
export function attachPressFeedback(): void {
  document.addEventListener("pointerdown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button, .zone.can-move, .weapon, .survivor-tab");
    if (!target || (target as HTMLButtonElement).disabled || reducedMotion()) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const ripple = document.createElement("span");
    ripple.className = "fx-click-ripple";
    ripple.style.cssText = `left:${event.clientX}px;top:${event.clientY}px;width:${size}px;height:${size}px`;
    fxLayer().appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  }, { passive: true });
}

/** Keeps looping CSS animations in phase across full innerHTML re-renders. */
export function syncClock(): void {
  document.documentElement.style.setProperty("--clock", `-${Math.round(performance.now() % 12000)}ms`);
}

export function capture(root: HTMLElement): Snapshot {
  const rects = new Map<string, DOMRect>();
  const html = new Map<string, string>();
  root.querySelectorAll<HTMLElement>("[data-fx-key]").forEach((el) => {
    rects.set(el.dataset.fxKey!, el.getBoundingClientRect());
    html.set(el.dataset.fxKey!, el.outerHTML);
  });
  const zoneRects = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>("[data-zone]").forEach((el) => zoneRects.set(el.dataset.zone!, el.getBoundingClientRect()));
  return { rects, html, zoneRects };
}

export function play(root: HTMLElement, before: Snapshot, prev: GameState, next: GameState, hint: FxHint = {}): void {
  if (reducedMotion()) return;
  const keyed = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-fx-key]").forEach((el) => keyed.set(el.dataset.fxKey!, el));

  // 1. FLIP: tokens that changed position glide from their old spot.
  keyed.forEach((el, key) => {
    const old = before.rects.get(key);
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const zombie = key.startsWith("z:");
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, zIndex: 10 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - (zombie ? 6 : 18)}px) scale(1.08)`, zIndex: 10, offset: 0.5 },
        { transform: "none", zIndex: 10 },
      ],
      { duration: zombie ? 520 : 440, easing: "cubic-bezier(.3,.7,.2,1)", delay: zombie ? 120 + Math.random() * 160 : 0 },
    );
  });

  // 2. Zombies removed → death ghost at their old position.
  const nextZombieIds = new Set(next.zombies.map((z) => `z:${z.id}`));
  let killIndex = 0;
  prev.zombies.forEach((zombie) => {
    const key = `z:${zombie.id}`;
    if (nextZombieIds.has(key)) return;
    const rect = before.rects.get(key);
    const markup = before.html.get(key);
    if (!rect || !markup) return;
    const delay = killIndex++ * 90;
    const ghost = placeAt(rect, markup, "fx-ghost");
    ghost.animate(
      [
        { transform: "none", filter: "none", opacity: 1 },
        { transform: "translateX(-4px) scale(1.15) rotate(-6deg)", filter: "brightness(3) saturate(0)", opacity: 1, offset: 0.15 },
        { transform: "translateY(10px) scale(.6) rotate(24deg)", filter: "grayscale(1) blur(2px)", opacity: 0 },
      ],
      { duration: 620, delay, easing: "ease-in", fill: "both" },
    ).finished.then(() => ghost.remove());
    splatter(rect, delay);
    floatText(rect, "💀", "fx-float kill", delay + 80);
  });

  // 3. Zombies added → rise from the ground.
  const prevZombieIds = new Set(prev.zombies.map((z) => `z:${z.id}`));
  let spawnIndex = 0;
  next.zombies.forEach((zombie) => {
    const key = `z:${zombie.id}`;
    if (prevZombieIds.has(key)) return;
    const el = keyed.get(key);
    if (!el) return;
    el.animate(
      [
        { transform: "translateY(26px) scale(.3)", opacity: 0, filter: "brightness(0) drop-shadow(0 0 0 #f00)" },
        { transform: "translateY(-6px) scale(1.12)", opacity: 1, filter: "brightness(1.6) drop-shadow(0 0 12px #ff3b2f)", offset: 0.65 },
        { transform: "none", opacity: 1, filter: "none" },
      ],
      { duration: 650, delay: 250 + spawnIndex++ * 110, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" },
    );
  });

  // 4. Survivor stat changes.
  let hurt = false;
  next.survivors.forEach((survivor) => {
    const old = prev.survivors.find((s) => s.id === survivor.id);
    if (!old) return;
    const el = keyed.get(`s:${survivor.id}`);
    const rect = el?.getBoundingClientRect() ?? before.rects.get(`s:${survivor.id}`);
    const hpDelta = survivor.health - old.health;
    if (hpDelta < 0) {
      hurt = true;
      el?.animate(
        [
          { transform: "none", filter: "none" },
          { transform: "translateX(-7px) rotate(-4deg)", filter: "sepia(1) saturate(6) hue-rotate(-40deg) brightness(1.2)" },
          { transform: "translateX(6px) rotate(3deg)" },
          { transform: "translateX(-4px)" },
          { transform: "none", filter: "none" },
        ],
        { duration: 480, delay: 420, easing: "ease-out" },
      );
      if (rect) floatText(rect, `${hpDelta} HP`, "fx-float damage", 420);
      if (survivor.health === 0 && rect) floatText(rect, "☠ ล้ม!", "fx-float down", 700);
    } else if (hpDelta > 0 && rect) {
      floatText(rect, `+${hpDelta} HP`, "fx-float heal", 120);
      el?.animate([{ boxShadow: "0 0 0 0 #4dff8a" }, { boxShadow: "0 0 0 14px #4dff8a00" }], { duration: 700 });
    }
    const xp = survivor.adrenaline - old.adrenaline;
    if (xp > 0 && rect) floatText(rect, `+${xp} XP`, "fx-float xp", hpDelta > 0 ? 380 : 220);
  });
  if (hurt) {
    root.querySelector(".board")?.animate(
      [{ transform: "none" }, { transform: "translate(-6px, 3px)" }, { transform: "translate(5px, -4px)" }, { transform: "translate(-3px, 2px)" }, { transform: "none" }],
      { duration: 380, delay: 420 },
    );
    flashScreen("hurt", 420);
  }

  // 5. Attack visuals on the target zone.
  if (hint.attackZone) {
    const zoneEl = root.querySelector<HTMLElement>(`[data-zone="${hint.attackZone}"]`);
    if (zoneEl) {
      zoneEl.animate(
        [{ boxShadow: "inset 0 0 0 0 #ff5a3c00" }, { boxShadow: "inset 0 0 60px 10px #ff5a3caa" }, { boxShadow: "inset 0 0 0 0 #ff5a3c00" }],
        { duration: 450 },
      );
      const rect = zoneEl.getBoundingClientRect();
      const fx = document.createElement("div");
      fx.className = hint.weaponKind === "melee" ? "fx-slash" : "fx-muzzle";
      fx.style.left = `${rect.left + rect.width / 2}px`;
      fx.style.top = `${rect.top + rect.height / 2}px`;
      fxLayer().appendChild(fx);
      setTimeout(() => fx.remove(), 600);
      const before = prev.zombies.filter((z) => z.zoneId === hint.attackZone).length;
      const after = next.zombies.filter((z) => z.zoneId === hint.attackZone).length;
      if (after >= before && next.lastRoll.length) floatText(rect, "MISS", "fx-float miss", 200);
    }
  }

  // 6. Objectives collected.
  next.objectives.filter((id) => !prev.objectives.includes(id)).forEach((zoneId) => {
    const rect = before.zoneRects.get(zoneId);
    if (!rect) return;
    burst(rect, "#c9f31d", 14);
    floatText(rect, "✦ เก็บเสบียง!", "fx-float objective", 0);
  });

  // 7. Noise ripples.
  Object.entries(next.noise).forEach(([zoneId, value]) => {
    if (value <= (prev.noise[zoneId] ?? 0)) return;
    const zoneEl = root.querySelector<HTMLElement>(`[data-zone="${zoneId}"]`);
    if (!zoneEl) return;
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement("span");
      ring.className = "fx-ripple";
      ring.style.animationDelay = `${i * 180}ms`;
      zoneEl.appendChild(ring);
    }
  });

  // 8. Door opened.
  if (hint.doorZone && next.openedDoors.length > prev.openedDoors.length) {
    const rect = before.zoneRects.get(hint.doorZone);
    if (rect) {
      floatText(rect, "🚪 ปัง!", "fx-float door", 0);
      burst(rect, "#ffb35c", 8);
    }
  }

  // 9. New gear in the active inventory.
  const hero = next.survivors.find((s) => s.id === next.activeSurvivorId);
  const oldHero = prev.survivors.find((s) => s.id === next.activeSurvivorId);
  if (hero && oldHero) {
    const oldIds = new Set(oldHero.inventory.map((w) => w.id));
    hero.inventory.filter((w) => !oldIds.has(w.id)).forEach((weapon) => {
      root.querySelector(`[data-weapon="${weapon.id}"]`)?.closest(".weapon-row")?.classList.add("fx-new-item");
    });
    if (hero.actions !== oldHero.actions) root.querySelector(".action-points strong")?.classList.add("fx-pop");
    if (hero.health < oldHero.health) root.querySelector(".portrait")?.classList.add("fx-portrait-hit");
    const hearts = root.querySelectorAll(".survivor-info .heart");
    for (let i = Math.min(hero.health, oldHero.health); i < Math.max(hero.health, oldHero.health); i++) hearts[i]?.classList.add(hero.health < oldHero.health ? "heart-lose" : "heart-gain");
    if (hero.adrenaline !== oldHero.adrenaline) root.querySelector(".stats span:last-child b")?.classList.add("fx-pop");
  }
  if (next.objectives.length > prev.objectives.length) root.querySelectorAll(".mission-progress strong").forEach((el, i) => { if (i === 0) el.classList.add("fx-pop"); });
  if (next.zombies.length !== prev.zombies.length) root.querySelectorAll(".mission-progress strong").forEach((el, i) => { if (i === 1) el.classList.add("fx-pop"); });

  // 10. Round / phase transitions.
  if (next.round > prev.round && next.phase === "player") {
    phaseBanner("ZOMBIE PHASE", "ฝูงซอมบี้เคลื่อนไหว…", "zombie", 0);
    phaseBanner(`ROUND ${String(next.round).padStart(2, "0")}`, "ผู้รอดชีวิตเริ่มตาใหม่", "player", 1500);
  }
  if (next.phase !== prev.phase && (next.phase === "won" || next.phase === "lost")) {
    flashScreen(next.phase === "won" ? "win" : "lose", 0);
    if (next.phase === "won") confetti();
  }
}

function placeAt(rect: DOMRect, markup: string, className: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = className;
  wrap.innerHTML = markup;
  wrap.style.left = `${rect.left}px`;
  wrap.style.top = `${rect.top}px`;
  wrap.style.width = `${rect.width}px`;
  wrap.style.height = `${rect.height}px`;
  fxLayer().appendChild(wrap);
  return wrap;
}

function floatText(rect: DOMRect, text: string, className: string, delay: number): void {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 3}px`;
  el.style.animationDelay = `${delay}ms`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), delay + 1400);
}

function splatter(rect: DOMRect, delay: number): void {
  burst(rect, "#8f1d14", 10, delay);
}

function burst(rect: DOMRect, color: string, count: number, delay = 0): void {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "fx-particle";
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = color;
    fxLayer().appendChild(p);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 30 + Math.random() * 45;
    p.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 18}px)) scale(.2)`, opacity: 0 },
      ],
      { duration: 600 + Math.random() * 250, delay, easing: "cubic-bezier(.1,.8,.3,1)", fill: "both" },
    ).finished.then(() => p.remove());
  }
}

function flashScreen(kind: string, delay: number): void {
  const el = document.createElement("div");
  el.className = `fx-flash ${kind}`;
  el.style.animationDelay = `${delay}ms`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), delay + 1200);
}

function phaseBanner(title: string, subtitle: string, kind: string, delay: number): void {
  const el = document.createElement("div");
  el.className = `fx-banner ${kind}`;
  el.innerHTML = `<strong>${title}</strong><small>${subtitle}</small>`;
  el.style.animationDelay = `${delay}ms`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), delay + 1500);
}

function confetti(): void {
  const colors = ["#c9f31d", "#ff6b1a", "#ffffff", "#57bff3", "#ef496f"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("span");
    p.className = "fx-confetti";
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    fxLayer().appendChild(p);
    p.animate(
      [
        { transform: `translateY(-20px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 160}px, 105vh) rotate(${Math.random() * 900}deg)`, opacity: 0.8 },
      ],
      { duration: 1800 + Math.random() * 1600, delay: Math.random() * 600, easing: "cubic-bezier(.3,.1,.6,1)", fill: "both" },
    ).finished.then(() => p.remove());
  }
}
