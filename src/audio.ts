export type AudioTheme = "city" | "harbor" | "amusement";
export type ZombieVoice = "walker" | "runner" | "brute" | "abomination" | "crawler" | "spitter" | "clown" | "mascot";

export type SoundEffect =
  | "ui"
  | "move"
  | "door"
  | "search"
  | "objective"
  | "noise"
  | "spawn"
  | "hurt"
  | "trade"
  | "discard"
  | "heal"
  | "powerup"
  | "vehicle"
  | "coaster"
  | "bumper"
  | "win"
  | "lose"
  | "kill"
  | "miss"
  | "down"
  | "zombiePhase"
  | "round"
  | "coin"
  | "buy"
  | "error";

const AUDIO_KEY = "dead-zone-protocol-audio-v1";
const MUSIC_GAIN = 0.24 * 7;
const EFFECTS_GAIN = 0.8 * 3;

interface Scale {
  root: number;
  notes: number[]; // semitone offsets
}

const SCALES: Record<AudioTheme, Scale> = {
  city: { root: 130.8, notes: [0, 3, 5, 7, 8, 12, 15] }, // C minor-ish, bleak
  harbor: { root: 98, notes: [0, 2, 3, 7, 10, 12] }, // G dorian, cold
  amusement: { root: 261.6, notes: [0, 1, 4, 5, 7, 8, 11, 12] }, // harmonic-minor music box, creepy
};

export class GameAudio {
  enabled = true;
  volume = 0.65;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private theme: AudioTheme = "city";
  private ambientNodes: AudioNode[] = [];
  private timers: number[] = [];
  private tension = 0;
  private tensionNodes: { filter: BiquadFilterNode | null; dissonance: GainNode | null } = { filter: null, dissonance: null };
  private lastGroan = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "null") as { enabled?: boolean; volume?: number } | null;
      if (saved) {
        this.enabled = saved.enabled ?? true;
        this.volume = Math.min(1, Math.max(0, saved.volume ?? 0.65));
      }
    } catch {
      // Audio settings are optional; private browsing can block storage.
    }
  }

  start(theme: AudioTheme): void {
    this.theme = theme;
    const context = this.ensureContext();
    if (!context) return;
    void context.resume();
    this.applyVolume();
    this.startAmbience();
  }

  setTheme(theme: AudioTheme): void {
    if (this.theme === theme) return;
    this.theme = theme;
    if (this.context) this.startAmbience();
  }

  toggle(theme: AudioTheme): void {
    this.enabled = !this.enabled;
    this.persist();
    if (this.enabled) this.start(theme);
    else this.applyVolume();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.persist();
    this.applyVolume();
  }

  /** 0 = calm, 1 = surrounded. Drives heartbeat speed, pad brightness and the dissonant drone. */
  setTension(value: number): void {
    this.tension = Math.min(1, Math.max(0, value));
    if (!this.context) return;
    const now = this.context.currentTime;
    this.tensionNodes.filter?.frequency.setTargetAtTime(420 + this.tension * 1500, now, 0.8);
    this.tensionNodes.dissonance?.gain.setTargetAtTime(this.tension > 0.45 ? (this.tension - 0.45) * 0.05 : 0, now, 0.6);
  }

  // ------------------------------------------------------------------ sound effects

  play(effect: SoundEffect): void {
    if (!this.ready()) return;
    switch (effect) {
      case "ui": this.bandNoise(0.03, 0.07, 3200, 1.5); this.tone(640, 0.06, "sine", 0.1, 0, 880); break;
      case "move": this.step(0); this.step(0.17); break;
      case "door":
        this.growlless(190, 0.55, 95, 0.1); // creak
        this.bandNoise(0.5, 0.07, 700, 4, 0, 1500);
        this.noise(0.2, 0.2, 420, 0.5); this.tone(70, 0.28, "square", 0.16, 0.5, 38); // slam
        break;
      case "search": [0, 0.13, 0.27].forEach((d) => this.bandNoise(0.1, 0.09, 2400 + d * 3000, 1.2, d)); this.tone(700, 0.09, "sine", 0.07, 0.38, 920); break;
      case "objective": this.chime([523, 659, 784, 1047], 0.09, 0.13); this.bandNoise(0.7, 0.04, 6000, 2, 0.2); break;
      case "noise": this.tone(300, 0.5, "sawtooth", 0.09, 0, 640); this.tone(320, 0.5, "sawtooth", 0.07, 0.5, 680); break;
      case "spawn": this.tone(92, 0.7, "sawtooth", 0.16, 0, 38); this.noise(0.55, 0.08, 430); break;
      case "hurt":
        this.noise(0.12, 0.2, 700); this.tone(120, 0.2, "sine", 0.22, 0, 45);
        this.growl({ base: 190, end: 130, dur: 0.35, vol: 0.14, f1: 700, f2: 1200, rough: 0.2, delay: 0.04 });
        break;
      case "trade": this.chime([500, 720], 0.1, 0.09); break;
      case "discard": this.tone(300, 0.12, "triangle", 0.09, 0, 110); this.bandNoise(0.1, 0.05, 900, 1); break;
      case "heal": this.chime([523, 659, 784, 1047], 0.12, 0.1); this.bandNoise(0.9, 0.025, 7000, 3, 0.1); break;
      case "powerup": this.chime([392, 523, 659, 988], 0.1, 0.12); this.tone(196, 0.5, "triangle", 0.1, 0, 392); break;
      case "vehicle": this.tone(70, 0.8, "sawtooth", 0.13, 0, 115); this.noise(0.45, 0.07, 380); this.bandNoise(0.6, 0.05, 900, 2, 0.2, 400); break;
      case "coaster": this.tone(180, 1.05, "triangle", 0.14, 0, 720); this.noise(0.9, 0.05, 1400); this.bandNoise(1.2, 0.05, 1800, 3, 0, 5000); break;
      case "bumper": this.tone(95, 0.35, "square", 0.12, 0, 150); this.tone(420, 0.12, "sine", 0.1, 0.18, 220); this.tone(1200, 0.06, "square", 0.06, 0.04, 700); break;
      case "win": this.chime([392, 523, 659, 784, 1047], 0.2, 0.15); this.tone(98, 1.6, "triangle", 0.14, 0, 98); break;
      case "lose": this.chime([220, 185, 147, 110], 0.25, 0.13); this.tone(55, 2.2, "sawtooth", 0.14, 0.3, 30); this.growl({ base: 45, end: 30, dur: 1.8, vol: 0.2, f1: 300, f2: 700, rough: 0.7, delay: 0.4 }); break;
      case "kill": this.noise(0.14, 0.2, 800); this.tone(150, 0.18, "sine", 0.22, 0, 40); this.bandNoise(0.18, 0.1, 400, 3, 0.05); break;
      case "miss": this.bandNoise(0.22, 0.09, 700, 1.4, 0, 2600); break;
      case "down": this.tone(220, 0.9, "sawtooth", 0.14, 0, 70); this.chime([196, 165, 131], 0.3, 0.1); break;
      case "zombiePhase":
        this.tone(48, 0.6, "sine", 0.3, 0, 30); this.noise(0.25, 0.25, 250);
        this.bandNoise(1.3, 0.09, 300, 2, 0.1, 2400);
        this.growl({ base: 70, end: 48, dur: 1.2, vol: 0.15, f1: 450, f2: 900, rough: 0.6, delay: 0.25 });
        break;
      case "round": this.chime([660, 495], 0.22, 0.11); this.tone(110, 0.5, "triangle", 0.1, 0, 110); break;
      case "coin": this.tone(1319, 0.09, "square", 0.07, 0, 1319); this.tone(1760, 0.32, "square", 0.07, 0.08, 1760); this.bandNoise(0.4, 0.03, 8000, 3, 0.08); break;
      case "buy": this.play("coin"); this.bandNoise(0.05, 0.1, 1800, 2, 0.3); this.tone(240, 0.12, "square", 0.08, 0.34, 120); break;
      case "error": this.tone(150, 0.14, "square", 0.12, 0, 130); this.tone(150, 0.2, "square", 0.12, 0.17, 110); break;
    }
  }

  /** Per-species zombie voice. mode: spawn (full), groan (idle, quieter), death (falling pitch). */
  playZombie(kind: ZombieVoice, mode: "spawn" | "groan" | "death" = "spawn", delay = 0): void {
    if (!this.ready()) return;
    if (mode === "groan") {
      const now = performance.now();
      if (now - this.lastGroan < 140) return; // avoid a wall of overlapping groans
      this.lastGroan = now;
    }
    const gain = mode === "groan" ? 0.55 : mode === "death" ? 0.8 : 1;
    const j = 0.9 + Math.random() * 0.2; // pitch jitter so a horde doesn't sound cloned
    const v = (o: Parameters<GameAudio["growl"]>[0]) => {
      const dur = mode === "death" ? o.dur * 0.6 : o.dur;
      const end = mode === "death" ? o.base * 0.35 : o.end;
      const base = mode === "death" ? o.base * 1.15 : o.base;
      this.growl({ ...o, base: base * j, end: end === undefined ? undefined : end * j, dur, vol: o.vol * gain, delay: (o.delay ?? 0) + delay });
    };
    switch (kind) {
      case "walker": v({ base: 105, end: 70, dur: 0.95, vol: 0.2, f1: 520, f2: 1050, rough: 0.5, breath: 0.05 }); break;
      case "runner": v({ base: 150, end: 250, dur: 0.55, vol: 0.2, f1: 720, f2: 1500, rough: 0.85, breath: 0.07 }); break;
      case "brute": v({ base: 58, end: 42, dur: 1.15, vol: 0.3, f1: 380, f2: 800, rough: 0.6, breath: 0.06 }); if (mode !== "groan") this.tone(48, 0.25, "sine", 0.22 * gain, delay, 32); break;
      case "abomination":
        v({ base: 40, end: 28, dur: 1.7, vol: 0.34, f1: 300, f2: 650, rough: 0.9, breath: 0.1 });
        v({ base: 78, end: 52, dur: 1.4, vol: 0.18, f1: 500, f2: 1100, rough: 1, delay: 0.1 });
        break;
      case "crawler": v({ base: 125, end: 85, dur: 0.75, vol: 0.18, f1: 900, f2: 2000, rough: 1, breath: 0.12 }); this.bandNoise(0.5, 0.05 * gain, 3000, 2, delay + 0.05); break;
      case "spitter":
        this.bandNoise(0.55, 0.1 * gain, 5200, 2.5, delay);
        v({ base: 95, end: 130, dur: 0.6, vol: 0.18, f1: 600, f2: 900, rough: 1, breath: 0.02, delay: 0.1 });
        break;
      case "clown":
        this.tone(330, 0.16, "square", 0.1 * gain, delay, 300); this.tone(440, 0.22, "square", 0.1 * gain, delay + 0.18, 400); // honk honk
        if (mode !== "death") [0.5, 0.64, 0.78, 0.92].forEach((d, i) => v({ base: 270 - i * 12, end: 220, dur: 0.1, vol: 0.14, f1: 800, f2: 1700, rough: 0.2, delay: d }));
        break;
      case "mascot":
        v({ base: 112, end: 80, dur: 0.9, vol: 0.24, f1: 300, f2: 620, rough: 0.5, breath: 0.04 });
        if (mode !== "groan") { this.tone(950, 0.1, "triangle", 0.09 * gain, delay + 0.35, 620); this.tone(760, 0.12, "triangle", 0.09 * gain, delay + 0.47, 520); } // squeaky toy
        break;
    }
  }

  playWeapon(weaponId: string): void {
    if (!this.ready()) return;
    if (["bat", "crowbar", "machete", "axe", "katana"].includes(weaponId)) {
      const sharp = weaponId === "katana" || weaponId === "machete";
      this.bandNoise(0.16, 0.14, sharp ? 3500 : 1200, 1, 0, sharp ? 6500 : 700); // swing whoosh
      this.noise(0.1, 0.18, 900, 0.1);
      this.tone(weaponId === "axe" ? 82 : sharp ? 200 : 115, 0.18, "triangle", 0.17, 0.1, 55); // impact
      if (sharp) this.tone(2400, 0.25, "sine", 0.04, 0.02, 3200); // blade ring
      return;
    }
    if (weaponId === "shock-baton") {
      this.bandNoise(0.3, 0.12, 3800, 2);
      this.chime([170, 880, 220, 990], 0.05, 0.1);
      return;
    }
    if (weaponId === "crossbow") {
      this.tone(210, 0.09, "triangle", 0.16, 0, 90); // string twang
      this.bandNoise(0.12, 0.08, 2600, 2, 0.03, 900);
      this.tone(150, 0.14, "sine", 0.1, 0.14, 60); // bolt hit
      return;
    }
    if (weaponId === "molotov") {
      this.tone(1800, 0.14, "sine", 0.06, 0, 2800); // glass
      this.tone(72, 0.8, "sawtooth", 0.22, 0.12, 34);
      this.noise(1.15, 0.2, 720, 0.12);
      this.bandNoise(1.2, 0.08, 2000, 1, 0.15, 500);
      return;
    }
    if (weaponId === "flamethrower") {
      this.noise(1.05, 0.2, 950);
      this.bandNoise(1.1, 0.1, 1800, 1, 0, 600);
      this.tone(64, 0.8, "sawtooth", 0.1, 0, 48);
      return;
    }
    if (weaponId === "fireworks") {
      this.tone(350, 0.42, "sine", 0.12, 0, 1300);
      this.bandNoise(0.4, 0.05, 3000, 2, 0, 6000);
      [0.36, 0.43, 0.5].forEach((delay) => { this.noise(0.2, 0.16, 2600, delay); this.bandNoise(0.5, 0.05, 6000, 4, delay + 0.05); });
      return;
    }

    const shots = weaponId === "smg" ? 3 : 1;
    const heavy = weaponId === "shotgun";
    const base = weaponId === "rifle" ? 105 : heavy ? 75 : 135;
    for (let index = 0; index < shots; index += 1) {
      const delay = index * 0.085;
      this.bandNoise(0.04, 0.22, 5000, 0.8, delay); // muzzle crack
      this.tone(base, heavy ? 0.32 : 0.16, "square", heavy ? 0.2 : 0.14, delay, 48);
      this.noise(heavy ? 0.34 : 0.13, heavy ? 0.22 : 0.15, 1800, delay);
    }
    this.noise(0.7, 0.07, 700, 0.06 + (shots - 1) * 0.085); // room tail
    if (weaponId === "shotgun") this.bandNoise(0.12, 0.1, 1500, 2, 0.45, 600); // pump
  }

  // ------------------------------------------------------------------ engine

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    const context = (this.context = new AudioContextClass());
    this.master = context.createGain();
    this.music = context.createGain();
    this.effects = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.music.gain.value = MUSIC_GAIN;
    this.effects.gain.value = EFFECTS_GAIN;

    // Shared reverb: gives every effect and the music a sense of space.
    const convolver = context.createConvolver();
    convolver.buffer = this.impulse(2.2);
    this.reverbIn = context.createGain();
    this.reverbIn.gain.value = 1;
    const effectsSend = context.createGain();
    effectsSend.gain.value = 0.22;
    const musicSend = context.createGain();
    musicSend.gain.value = 0.3;
    const wet = context.createGain();
    wet.gain.value = 0.7;
    this.effects.connect(effectsSend).connect(this.reverbIn);
    this.music.connect(musicSend).connect(this.reverbIn);
    this.reverbIn.connect(convolver).connect(wet).connect(this.master);

    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(limiter).connect(context.destination);
    return context;
  }

  private impulse(seconds: number): AudioBuffer {
    const context = this.context!;
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.6);
    }
    return buffer;
  }

  private ready(): boolean {
    return this.enabled && Boolean(this.context && this.effects && this.context.state !== "closed");
  }

  private applyVolume(): void {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.03);
  }

  // ------------------------------------------------------------------ music / ambience

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private startAmbience(): void {
    if (!this.context || !this.music) return;
    this.stopAmbience();
    const context = this.context;
    const scale = SCALES[this.theme];

    // Evolving pad: three detuned saws through a filter whose brightness follows tension.
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420 + this.tension * 1500;
    filter.Q.value = 2;
    const padGain = context.createGain();
    padGain.gain.value = this.theme === "amusement" ? 0.018 : 0.026;
    filter.connect(padGain).connect(this.music);
    this.ambientNodes.push(filter, padGain);
    [scale.root / 2, scale.root / 2 * 1.5, scale.root / 2 * 1.007].forEach((freq) => {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    });
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.ambientNodes.push(lfo, lfoGain);
    this.tensionNodes.filter = filter;

    // Dissonant tritone drone that fades in when the survivors are in danger.
    const dissonance = context.createGain();
    dissonance.gain.value = 0;
    dissonance.connect(this.music);
    this.ambientNodes.push(dissonance);
    [scale.root, scale.root * Math.SQRT2].forEach((freq) => {
      const osc = context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq / 2;
      osc.connect(dissonance);
      osc.start();
      this.ambientNodes.push(osc);
    });
    this.tensionNodes.dissonance = dissonance;
    this.setTension(this.tension);

    // Theme texture.
    if (this.theme === "city") {
      this.ambientNoise(0.03, 500, 0.07); // wind
      this.scheduleRandom(14000, 28000, () => this.growl({ base: 80, end: 55, dur: 1.4, vol: 0.05, f1: 400, f2: 800, rough: 0.6 })); // distant groan
    } else if (this.theme === "harbor") {
      this.ambientNoise(0.07, 380, 0.12); // waves
      this.scheduleRandom(22000, 40000, () => { // foghorn
        this.musicTone(110, 2.6, "sawtooth", 0.05, 0, 104);
        this.musicTone(82.4, 2.6, "sine", 0.06, 0, 80);
      });
      this.scheduleRandom(9000, 18000, () => this.bandNoise(0.7, 0.03, 600, 6, 0, 300)); // hull creak
    } else {
      this.scheduleRandom(16000, 30000, () => [0, 0.16, 0.32, 0.48].forEach((d) => this.growl({ base: 300 - d * 90, end: 240, dur: 0.12, vol: 0.05, f1: 800, f2: 1700, rough: 0.2, delay: d }))); // far-off laughter
      this.scheduleRandom(18000, 34000, () => this.bandNoise(0.9, 0.025, 1200, 8, 0, 700)); // rusty ride
    }

    this.scheduleHeartbeat();
    this.scheduleMelody();
    this.music.gain.cancelScheduledValues(context.currentTime);
    this.music.gain.setTargetAtTime(MUSIC_GAIN, context.currentTime, 0.25);
  }

  /** Sparse, randomised melody (a random walk on the theme scale) so the background never loops audibly. */
  private scheduleMelody(): void {
    const scale = SCALES[this.theme];
    let step = 2;
    const note = () => {
      if (!this.context) return;
      step = Math.min(scale.notes.length - 1, Math.max(0, step + Math.floor(Math.random() * 3) - 1));
      const octave = Math.random() < 0.25 ? 2 : 1;
      const freq = scale.root * octave * Math.pow(2, scale.notes[step] / 12);
      if (this.theme === "amusement") {
        // music-box: bright sine with a second partial and a drunken pitch wobble
        this.musicTone(freq * 2, 1.4, "sine", 0.03, 0, freq * 1.97);
        this.musicTone(freq * 4, 0.5, "sine", 0.012, 0, freq * 3.9);
      } else {
        this.musicTone(freq, 2.2, "triangle", this.theme === "harbor" ? 0.034 : 0.03, 0, freq * 0.995);
      }
      const rest = Math.random() < 0.35 ? 1.6 : 1;
      const base = this.theme === "amusement" ? 480 : this.theme === "harbor" ? 1100 : 900;
      this.later(note, base * rest * (1 - this.tension * 0.3) + Math.random() * 500);
    };
    this.later(note, 600);
  }

  /** Low heartbeat whose tempo and weight rise with tension. */
  private scheduleHeartbeat(): void {
    const beat = () => {
      if (!this.context) return;
      const power = 0.05 + this.tension * 0.12;
      this.musicTone(58, 0.22, "sine", power, 0, 38);
      this.musicTone(52, 0.2, "sine", power * 0.7, 0.17, 36);
      this.later(beat, 60000 / (48 + this.tension * 62));
    };
    this.later(beat, 1200);
  }

  private scheduleRandom(minMs: number, maxMs: number, fn: () => void): void {
    const run = () => {
      if (!this.context) return;
      if (this.ready()) fn();
      this.later(run, minMs + Math.random() * (maxMs - minMs));
    };
    this.later(run, minMs * 0.5 + Math.random() * minMs);
  }

  private stopAmbience(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    for (const node of this.ambientNodes) {
      try { (node as OscillatorNode).stop?.(); } catch { /* Already stopped. */ }
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    this.ambientNodes = [];
    this.tensionNodes = { filter: null, dissonance: null };
  }

  private ambientNoise(volume: number, cutoff: number, swellHz: number): void {
    if (!this.context || !this.music) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const swell = this.context.createOscillator();
    const swellGain = this.context.createGain();
    source.buffer = this.noiseBuffer(3);
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    swell.frequency.value = swellHz;
    swellGain.gain.value = volume * 0.7;
    swell.connect(swellGain).connect(gain.gain);
    source.connect(filter).connect(gain).connect(this.music);
    source.start();
    swell.start();
    this.ambientNodes.push(source, filter, gain, swell, swellGain);
  }

  // ------------------------------------------------------------------ synthesis primitives

  /** Throat-like voice: sawtooth + vibrato + amplitude roughness through two formant filters + breath noise. */
  private growl(o: { base: number; end?: number; dur: number; vol: number; f1: number; f2: number; rough?: number; delay?: number; breath?: number }): void {
    const context = this.context;
    if (!context || !this.effects) return;
    const start = context.currentTime + (o.delay ?? 0);
    const end = start + o.dur;
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(Math.max(1, o.base), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.end ?? o.base * 0.8), end);

    const vibrato = context.createOscillator();
    const vibratoGain = context.createGain();
    vibrato.frequency.value = 5 + Math.random() * 2;
    vibratoGain.gain.value = o.base * 0.03;
    vibrato.connect(vibratoGain).connect(osc.frequency);

    const roughness = o.rough ?? 0.5;
    const am = context.createGain();
    am.gain.value = 1 - roughness * 0.5;
    const amLfo = context.createOscillator();
    const amDepth = context.createGain();
    amLfo.frequency.value = 22 + Math.random() * 14;
    amDepth.gain.value = roughness * 0.5;
    amLfo.connect(amDepth).connect(am.gain);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.vol), start + Math.min(0.12, o.dur * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(am);
    [o.f1, o.f2].forEach((frequency, index) => {
      const formant = context.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = frequency;
      formant.Q.value = 5;
      const mix = context.createGain();
      mix.gain.value = index === 0 ? 1 : 0.6;
      am.connect(formant).connect(mix).connect(envelope);
    });
    envelope.connect(this.effects);

    const stopAt = end + 0.05;
    [osc, vibrato, amLfo].forEach((node) => { node.start(start); node.stop(stopAt); });

    if (o.breath) {
      const breath = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      breath.buffer = this.noiseBuffer(Math.max(0.5, o.dur));
      filter.type = "bandpass";
      filter.frequency.value = o.f2;
      filter.Q.value = 1.2;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(o.breath, start + o.dur * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      breath.connect(filter).connect(gain).connect(this.effects);
      breath.start(start);
      breath.stop(stopAt);
    }
  }

  /** Rough "creak" tone with wobble (used for doors). */
  private growlless(frequency: number, duration: number, endFrequency: number, volume: number): void {
    this.growl({ base: frequency, end: endFrequency, dur: duration, vol: volume, f1: 900, f2: 1800, rough: 1 });
  }

  private step(delay: number): void {
    this.noise(0.07, 0.11, 600 + Math.random() * 250, delay);
    this.tone(85 + Math.random() * 15, 0.09, "triangle", 0.1, delay, 55);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0, endFrequency = frequency): void {
    this.emitTone(this.effects, frequency, duration, type, volume, delay, endFrequency);
  }

  private musicTone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0, endFrequency = frequency): void {
    this.emitTone(this.music, frequency, duration, type, volume, delay, endFrequency);
  }

  private emitTone(bus: AudioNode | null, frequency: number, duration: number, type: OscillatorType, volume: number, delay: number, endFrequency: number): void {
    if (!this.context || !bus) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number, delay = 0): void {
    if (!this.context || !this.effects) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer(Math.max(0.5, duration));
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** Band-passed noise, optionally sweeping its centre frequency (whooshes, rustles, creaks, risers). */
  private bandNoise(duration: number, volume: number, frequency: number, q: number, delay = 0, sweepTo?: number): void {
    if (!this.context || !this.effects) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer(Math.max(0.5, duration));
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, start);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + Math.min(0.03, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const context = this.context!;
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private chime(notes: number[], spacing: number, volume: number): void {
    notes.forEach((note, index) => this.tone(note, spacing * 1.8, "sine", volume, index * spacing, note * 1.01));
  }

  private persist(): void {
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      // The game still works if settings cannot be persisted.
    }
  }
}
