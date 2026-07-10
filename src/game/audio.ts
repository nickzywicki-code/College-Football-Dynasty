// 8-bit audio engine: synthesized SFX + an original chiptune music loop.
// Everything is generated with WebAudio oscillators/noise — no audio files.

type SfxName =
  | 'click'
  | 'snap'
  | 'whistle'
  | 'catch'
  | 'tackle'
  | 'touchdown'
  | 'fieldgoal'
  | 'turnover'
  | 'firstdown'
  | 'kick'
  | 'crowd';

const LS_SOUND = 'gl-sound';
const LS_MUSIC = 'gl-music';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  soundOn = true;
  musicOn = true;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.soundOn = localStorage.getItem(LS_SOUND) !== 'off';
      this.musicOn = localStorage.getItem(LS_MUSIC) !== 'off';
    }
  }

  /** Must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    localStorage.setItem(LS_SOUND, on ? 'on' : 'off');
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    localStorage.setItem(LS_MUSIC, on ? 'on' : 'off');
    if (on) this.startMusic();
    else this.stopMusic();
  }

  // ------------------------------------------------------------- SFX
  private beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    when = 0,
    vol = 1,
    slideTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, when = 0, vol = 1, lowpass = 800): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  play(name: SfxName): void {
    if (!this.soundOn) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'click':
        this.beep(660, 0.06, 'square', 0, 0.5);
        this.beep(990, 0.05, 'square', 0.03, 0.35);
        break;
      case 'snap':
        this.beep(220, 0.07, 'square', 0, 0.6);
        this.noise(0.08, 0, 0.5, 1200);
        break;
      case 'whistle':
        this.beep(2200, 0.3, 'sine', 0, 0.5, 2050);
        this.beep(2210, 0.3, 'sine', 0.02, 0.3, 2060);
        break;
      case 'catch':
        this.beep(520, 0.05, 'square', 0, 0.5);
        this.beep(780, 0.08, 'square', 0.05, 0.5);
        break;
      case 'tackle':
        this.noise(0.18, 0, 0.9, 500);
        this.beep(90, 0.16, 'triangle', 0, 0.9, 45);
        break;
      case 'touchdown':
        // rising original fanfare
        [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.16, 'square', i * 0.11, 0.55));
        this.beep(1047, 0.4, 'square', 0.45, 0.6);
        this.noise(1.4, 0.1, 0.35, 900); // crowd roar
        break;
      case 'fieldgoal':
        [659, 831, 988].forEach((f, i) => this.beep(f, 0.14, 'square', i * 0.1, 0.5));
        this.noise(0.9, 0.1, 0.28, 900);
        break;
      case 'turnover':
        [494, 415, 349, 262].forEach((f, i) => this.beep(f, 0.15, 'square', i * 0.1, 0.55));
        break;
      case 'firstdown':
        this.beep(784, 0.07, 'square', 0, 0.45);
        this.beep(988, 0.09, 'square', 0.08, 0.45);
        break;
      case 'kick':
        this.beep(180, 0.1, 'triangle', 0, 0.8, 60);
        this.noise(0.06, 0, 0.5, 2000);
        break;
      case 'crowd':
        this.noise(1.0, 0, 0.25, 800);
        break;
    }
  }

  // ------------------------------------------------------- music loop
  // Original 16-step chiptune progression (Am–F–C–G feel), square lead +
  // triangle bass + noise hats, composed for this game.
  private static LEAD: (number | 0)[] = [
    440, 0, 523, 440, 659, 0, 523, 659, 698, 659, 523, 0, 587, 523, 494, 523,
    440, 0, 440, 523, 659, 784, 659, 523, 587, 0, 494, 587, 523, 0, 440, 0,
  ];
  private static BASS: number[] = [
    110, 110, 165, 110, 87, 87, 131, 87, 131, 131, 196, 131, 98, 98, 147, 98,
    110, 110, 165, 110, 87, 87, 131, 87, 147, 147, 220, 147, 98, 98, 147, 98,
  ];

  private scheduleMusicStep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.musicOn) return;
    const stepDur = 60 / 118 / 2; // 118 bpm, 8th notes
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const i = this.musicStep % AudioEngine.LEAD.length;
      const t = this.nextNoteTime;
      const lead = AudioEngine.LEAD[i];
      if (lead) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = lead;
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
        osc.connect(g).connect(this.musicGain);
        osc.start(t);
        osc.stop(t + stepDur);
      }
      const bass = AudioEngine.BASS[i];
      const bosc = ctx.createOscillator();
      const bg = ctx.createGain();
      bosc.type = 'triangle';
      bosc.frequency.value = bass;
      bg.gain.setValueAtTime(0.22, t);
      bg.gain.exponentialRampToValueAtTime(0.003, t + stepDur * 0.95);
      bosc.connect(bg).connect(this.musicGain);
      bosc.start(t);
      bosc.stop(t + stepDur);
      // hat on even steps
      if (i % 2 === 0) {
        const len = Math.floor(ctx.sampleRate * 0.03);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let s = 0; s < len; s++) d[s] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(i % 8 === 0 ? 0.12 : 0.06, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        src.connect(hp).connect(hg).connect(this.musicGain);
        src.start(t);
      }
      this.nextNoteTime += stepDur;
      this.musicStep++;
    }
  }

  startMusic(): void {
    if (!this.musicOn) return;
    const ctx = this.ensure();
    if (!ctx || this.musicTimer != null) return;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusicStep(), 120);
  }

  stopMusic(): void {
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Duck music volume during live plays, restore in menus. */
  duckMusic(ducked: boolean): void {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(ducked ? 0.07 : 0.16, this.ctx.currentTime + 0.4);
    }
  }
}

export const audio = new AudioEngine();
