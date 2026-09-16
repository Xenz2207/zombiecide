export type AudioTheme = "city" | "harbor" | "amusement";

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
  | "lose";

const AUDIO_KEY = "dead-zone-protocol-audio-v1";
const MUSIC_GAIN = 0.24 * 7;
const EFFECTS_GAIN = 0.8 * 3;

export class GameAudio {
  enabled = true;
  volume = 0.65;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private theme: AudioTheme = "city";
  private ambientNodes: AudioNode[] = [];
  private ambientTimer: number | null = null;

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

  play(effect: SoundEffect): void {
    if (!this.ready()) return;
    switch (effect) {
      case "ui": this.tone(520, 0.07, "sine", 0.12, 0, 690); break;
      case "move": this.noise(0.09, 0.12, 650); this.tone(90, 0.1, "triangle", 0.1, 0, 60); break;
      case "door": this.noise(0.18, 0.18, 900); this.tone(125, 0.22, "square", 0.14, 0, 55); break;
      case "search": this.noise(0.22, 0.08, 1700); this.tone(620, 0.1, "sine", 0.08, 0.12, 800); break;
      case "objective": this.chime([440, 660, 880], 0.11, 0.13); break;
      case "noise": this.chime([310, 310, 420], 0.13, 0.15); break;
      case "spawn": this.tone(92, 0.7, "sawtooth", 0.16, 0, 38); this.noise(0.55, 0.08, 430); break;
      case "hurt": this.tone(150, 0.25, "sawtooth", 0.16, 0, 72); this.noise(0.15, 0.12, 1100); break;
      case "trade": this.chime([500, 720], 0.1, 0.09); break;
      case "discard": this.tone(300, 0.12, "triangle", 0.09, 0, 110); break;
      case "heal": this.chime([523, 659, 784], 0.16, 0.12); break;
      case "powerup": this.chime([392, 523, 659, 988], 0.1, 0.12); break;
      case "vehicle": this.tone(70, 0.8, "sawtooth", 0.13, 0, 115); this.noise(0.45, 0.07, 380); break;
      case "coaster": this.tone(180, 1.05, "triangle", 0.14, 0, 720); this.noise(0.9, 0.05, 1400); break;
      case "bumper": this.tone(95, 0.35, "square", 0.12, 0, 150); this.tone(420, 0.12, "sine", 0.1, 0.18, 220); break;
      case "win": this.chime([392, 523, 659, 784], 0.24, 0.15); break;
      case "lose": this.chime([220, 185, 147, 110], 0.25, 0.13); break;
    }
  }

  playWeapon(weaponId: string): void {
    if (!this.ready()) return;
    if (["bat", "crowbar", "machete", "axe", "katana"].includes(weaponId)) {
      this.noise(0.12, 0.13, 1200);
      this.tone(weaponId === "axe" ? 82 : 115, 0.18, "triangle", 0.15, 0.04, 55);
      return;
    }
    if (weaponId === "shock-baton") {
      this.noise(0.25, 0.11, 3600);
      this.chime([170, 880, 220], 0.055, 0.1);
      return;
    }
    if (weaponId === "crossbow") {
      this.noise(0.08, 0.07, 2400);
      this.tone(180, 0.18, "triangle", 0.11, 0.03, 75);
      return;
    }
    if (weaponId === "molotov") {
      this.tone(72, 0.8, "sawtooth", 0.22, 0, 34);
      this.noise(1.15, 0.2, 720);
      return;
    }
    if (weaponId === "flamethrower") {
      this.noise(1.05, 0.2, 950);
      this.tone(64, 0.8, "sawtooth", 0.1, 0, 48);
      return;
    }
    if (weaponId === "fireworks") {
      this.tone(350, 0.42, "sine", 0.12, 0, 1300);
      [0.36, 0.43, 0.5].forEach((delay) => this.noise(0.2, 0.16, 2600, delay));
      return;
    }

    const shots = weaponId === "smg" ? 3 : 1;
    const base = weaponId === "rifle" ? 105 : weaponId === "shotgun" ? 75 : 135;
    for (let index = 0; index < shots; index += 1) {
      const delay = index * 0.085;
      this.tone(base, weaponId === "shotgun" ? 0.32 : 0.16, "square", weaponId === "shotgun" ? 0.2 : 0.14, delay, 48);
      this.noise(weaponId === "shotgun" ? 0.34 : 0.13, weaponId === "shotgun" ? 0.22 : 0.15, 1800, delay);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.music = this.context.createGain();
    this.effects = this.context.createGain();
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.music.gain.value = MUSIC_GAIN;
    this.effects.gain.value = EFFECTS_GAIN;
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(limiter).connect(this.context.destination);
    return this.context;
  }

  private ready(): boolean {
    return this.enabled && Boolean(this.context && this.effects && this.context.state !== "closed");
  }

  private applyVolume(): void {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.03);
  }

  private startAmbience(): void {
    if (!this.context || !this.music) return;
    this.stopAmbience();
    const context = this.context;

    if (this.theme === "city") {
      this.drone(65.4, "sine", 0.02);
      this.drone(92.5, "triangle", 0.009);
      const notes = [262, 311, 277, 233, 247, 208];
      const spacing = 0.68;
      const melody = () => this.musicChime(notes, spacing, 0.026);
      melody();
      this.ambientTimer = window.setInterval(melody, notes.length * spacing * 1000);
    } else if (this.theme === "harbor") {
      this.ambientNoise(0.045, 520);
      this.drone(55, "sine", 0.035);
      this.drone(77.8, "triangle", 0.012);
      const notes = [110, 131, 117, 98, 104, 87];
      const spacing = 0.9;
      const melody = () => this.musicChime(notes, spacing, 0.03);
      melody();
      this.ambientTimer = window.setInterval(melody, notes.length * spacing * 1000);
    } else {
      this.drone(49, "triangle", 0.025);
      this.drone(69.3, "sine", 0.012);
      const notes = [392, 466, 370, 311, 349, 294, 277, 233];
      const spacing = 0.36;
      const calliope = () => this.musicChime(notes, spacing, 0.038);
      calliope();
      this.ambientTimer = window.setInterval(calliope, notes.length * spacing * 1000);
    }

    this.music.gain.cancelScheduledValues(context.currentTime);
    this.music.gain.setTargetAtTime(MUSIC_GAIN, context.currentTime, 0.25);
  }

  private stopAmbience(): void {
    if (this.ambientTimer !== null) window.clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    for (const node of this.ambientNodes) {
      try { (node as OscillatorNode).stop?.(); } catch { /* Already stopped. */ }
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    this.ambientNodes = [];
  }

  private drone(frequency: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.music) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    oscillator.connect(gain).connect(this.music);
    oscillator.start();
    this.ambientNodes.push(oscillator, gain);
  }

  private ambientNoise(volume: number, cutoff: number): void {
    if (!this.context || !this.music) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer(3);
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.music);
    source.start();
    this.ambientNodes.push(source, filter, gain);
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

  private musicChime(notes: number[], spacing: number, volume: number): void {
    notes.forEach((note, index) => this.musicTone(note, spacing * 1.7, "triangle", volume, index * spacing, note * 0.99));
  }

  private persist(): void {
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      // The game still works if settings cannot be persisted.
    }
  }
}
