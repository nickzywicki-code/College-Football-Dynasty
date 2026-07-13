// Audio engine: fully synthesized SFX, a layered chiptune-orchestral score,
// crowd ambience, and a convolver reverb — no external audio files (the build
// sandbox blocks external hosts, and this keeps the game license-clean).
//
// Signal graph:
//   sources → sfx/music/crowd busses → master → destination
//                         ↘ reverb send (ConvolverNode) → master
// Music is a step sequencer (16th notes) driving drums, sub bass, a detuned
// square lead, and a soft triangle arpeggio over an Am–F–C–G progression, with
// a mellow "menu" intensity and a driving "in-game" intensity.

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
  | 'block'
  | 'crowd';

const LS_SOUND = 'gl-sound';
const LS_MUSIC = 'gl-music';

// Am – F – C – G anthem: one chord per bar (16 sixteenths), 4-bar loop.
// Each entry is [root, third, fifth] in Hz for a warm mid-register voicing.
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [261.63, 329.63, 392.0], // C
  [196.0, 246.94, 293.66], // G
];

// 64-step (4-bar) singable melody in Hz; 0 = rest. An original sports anthem.
const LEAD: number[] = [
  // Am
  0, 440, 0, 523, 659, 0, 587, 0, 523, 0, 440, 0, 494, 0, 0, 0,
  // F
  0, 349, 0, 440, 523, 0, 440, 0, 349, 0, 262, 0, 294, 0, 0, 0,
  // C
  0, 392, 0, 523, 659, 0, 784, 0, 659, 0, 523, 0, 587, 0, 0, 0,
  // G  (resolve up)
  0, 392, 0, 494, 587, 0, 494, 0, 392, 0, 294, 0, 330, 0, 330, 0,
];

// Bass root per step with a walking octave lift into each new bar.
const BASS: number[] = [
  110, 0, 110, 0, 165, 0, 110, 0, 110, 0, 110, 0, 165, 0, 220, 0,
  87, 0, 87, 0, 131, 0, 87, 0, 87, 0, 87, 0, 131, 0, 174, 0,
  131, 0, 131, 0, 196, 0, 131, 0, 131, 0, 131, 0, 196, 0, 262, 0,
  98, 0, 98, 0, 147, 0, 98, 0, 98, 0, 98, 0, 147, 0, 196, 0,
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private intense = false; // driving in-game arrangement vs. mellow menu

  // crowd bed
  private crowdSrc: AudioBufferSourceNode | null = null;

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
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);

      // Reverb send shared by SFX + music for a sense of stadium space.
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.buildImpulse(1.7, 2.6);
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.9;
      this.reverb.connect(this.reverbGain).connect(this.master);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);

      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.value = 0.0;
      this.crowdGain.connect(this.master);
      this.startCrowdBed();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Decaying stereo-ish noise impulse response for the convolver. */
  private buildImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
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

  // ------------------------------------------------------------- SFX core
  /**
   * ADSR-shaped tone with optional pitch slide, filter, detuned unison layer
   * and reverb send. The building block for every sound effect.
   */
  private tone(o: {
    freq: number;
    dur: number;
    type?: OscillatorType;
    when?: number;
    vol?: number;
    slideTo?: number;
    attack?: number;
    detune?: number; // cents for a second unison osc
    lowpass?: number;
    verb?: number; // 0..1 reverb send
    bus?: GainNode | null;
  }): void {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfxGain;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const dur = o.dur;
    const vol = (o.vol ?? 1) * 0.6;
    const attack = o.attack ?? 0.004;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    let node: AudioNode = g;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      g.connect(f);
      node = f;
    }
    node.connect(bus);
    if (o.verb && this.reverb) g.connect(this.reverb);

    const mk = (detune: number) => {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'square';
      osc.frequency.setValueAtTime(o.freq, t);
      if (detune) osc.detune.value = detune;
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.slideTo), t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    };
    mk(0);
    if (o.detune) mk(o.detune);
  }

  private noise(o: {
    dur: number;
    when?: number;
    vol?: number;
    lowpass?: number;
    highpass?: number;
    attack?: number;
    verb?: number;
    bus?: GainNode | null;
  }): void {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfxGain;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const dur = o.dur;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    let node: AudioNode = src;
    if (o.highpass) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.highpass;
      node.connect(hp);
      node = hp;
    }
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      node.connect(lp);
      node = lp;
    }
    const g = ctx.createGain();
    const vol = (o.vol ?? 1) * 0.5;
    const attack = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g).connect(bus);
    if (o.verb && this.reverb) g.connect(this.reverb);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  play(name: SfxName): void {
    if (!this.soundOn) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'click':
        this.tone({ freq: 680, dur: 0.05, type: 'square', vol: 0.4 });
        this.tone({ freq: 1020, dur: 0.05, type: 'square', when: 0.028, vol: 0.28 });
        break;
      case 'snap':
        // barked cadence + hand-off thud
        this.tone({ freq: 240, dur: 0.09, type: 'square', vol: 0.55, slideTo: 170 });
        this.noise({ dur: 0.06, vol: 0.45, lowpass: 1600, highpass: 300 });
        break;
      case 'whistle':
        // two shrill trilled tones with a touch of verb — a real ref whistle
        this.tone({ freq: 2380, dur: 0.34, type: 'sine', vol: 0.4, slideTo: 2250, verb: 0.25 });
        this.tone({ freq: 3160, dur: 0.34, type: 'sine', when: 0.01, vol: 0.22, slideTo: 3020 });
        this.noise({ dur: 0.34, vol: 0.05, highpass: 5000 });
        break;
      case 'catch':
        // leather pop
        this.noise({ dur: 0.05, vol: 0.5, lowpass: 2600, highpass: 700 });
        this.tone({ freq: 560, dur: 0.06, type: 'square', vol: 0.4 });
        this.tone({ freq: 840, dur: 0.08, type: 'triangle', when: 0.05, vol: 0.4 });
        break;
      case 'tackle':
        // pad-crunch: low body thud + mid smack + reverb tail
        this.noise({ dur: 0.22, vol: 0.9, lowpass: 900, verb: 0.3 });
        this.noise({ dur: 0.07, vol: 0.6, lowpass: 3500, highpass: 1200 });
        this.tone({ freq: 96, dur: 0.2, type: 'triangle', vol: 0.95, slideTo: 42 });
        break;
      case 'touchdown':
        // rising fanfare, octave stab, crowd roar
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.18, type: 'square', when: i * 0.11, vol: 0.5, detune: 8, verb: 0.2 }),
        );
        this.tone({ freq: 1046.5, dur: 0.5, type: 'square', when: 0.46, vol: 0.55, detune: -10, verb: 0.35 });
        this.tone({ freq: 523.25, dur: 0.5, type: 'triangle', when: 0.46, vol: 0.4 });
        this.crowdSwell(0.85, 1.8);
        break;
      case 'fieldgoal':
        [659.25, 830.61, 987.77].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.15, type: 'square', when: i * 0.1, vol: 0.5, verb: 0.2 }),
        );
        this.crowdSwell(0.55, 1.2);
        break;
      case 'turnover':
        // descending "aww" with a low sting
        [494, 415, 349, 262].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.16, type: 'square', when: i * 0.1, vol: 0.5, detune: -12 }),
        );
        this.tone({ freq: 130, dur: 0.5, type: 'triangle', when: 0.4, vol: 0.4, slideTo: 90 });
        break;
      case 'firstdown':
        this.tone({ freq: 784, dur: 0.07, type: 'square', vol: 0.42 });
        this.tone({ freq: 988, dur: 0.1, type: 'square', when: 0.08, vol: 0.42, verb: 0.15 });
        break;
      case 'kick':
        // thump + air whoosh
        this.tone({ freq: 190, dur: 0.11, type: 'triangle', vol: 0.8, slideTo: 55 });
        this.noise({ dur: 0.12, vol: 0.4, lowpass: 2600, highpass: 400, attack: 0.03 });
        break;
      case 'block':
        // pad-pop: short low thud + mid click, lighter than a tackle
        this.noise({ dur: 0.08, vol: 0.5, lowpass: 1500, highpass: 250 });
        this.tone({ freq: 130, dur: 0.09, type: 'triangle', vol: 0.55, slideTo: 70 });
        break;
      case 'crowd':
        this.crowdSwell(0.5, 1.4);
        break;
    }
  }

  // -------------------------------------------------------- crowd ambience
  /** A looping filtered-noise murmur that lives quietly under everything. */
  private startCrowdBed(): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain || this.crowdSrc) return;
    const secs = 4;
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // pink-ish noise so it reads as a distant murmur, not hiss
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.7;
    const level = ctx.createGain();
    level.gain.value = 1;
    src.connect(bp).connect(level).connect(this.crowdGain);
    src.start();
    this.crowdSrc = src;
    // gentle baseline murmur
    this.crowdGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
  }

  /** Momentarily swell the crowd for a big moment, then settle back. */
  private crowdSwell(peak: number, hold: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain) return;
    const t = ctx.currentTime;
    const base = this.intense ? 0.09 : 0.05;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + 0.15);
    g.linearRampToValueAtTime(base, t + hold);
  }

  // ------------------------------------------------------- music sequencer
  private scheduleMusicStep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.musicOn) return;
    const bpm = this.intense ? 128 : 96;
    const stepDur = 60 / bpm / 4; // 16th notes
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      const i = this.musicStep % 64;
      const t = this.nextNoteTime;
      const chord = CHORDS[Math.floor(i / 16) % 4];
      const beat = i % 4 === 0;

      // --- lead (detuned square, reverb) ---
      const lead = LEAD[i];
      if (lead) {
        this.tone({
          freq: lead,
          dur: stepDur * (this.intense ? 1.6 : 2.4),
          type: 'square',
          when: t - ctx.currentTime,
          vol: this.intense ? 0.16 : 0.13,
          detune: 7,
          lowpass: 3200,
          verb: 0.25,
          bus: this.musicGain,
        });
      }

      // --- bass (sub sine + triangle body) ---
      const bass = BASS[i];
      if (bass) {
        this.tone({
          freq: bass,
          dur: stepDur * 1.6,
          type: 'triangle',
          when: t - ctx.currentTime,
          vol: 0.26,
          bus: this.musicGain,
        });
        this.tone({
          freq: bass / 2,
          dur: stepDur * 1.6,
          type: 'sine',
          when: t - ctx.currentTime,
          vol: 0.22,
          bus: this.musicGain,
        });
      }

      // --- soft arpeggio pad over chord tones (mellow menu shimmer) ---
      if (!this.intense && i % 2 === 0) {
        const note = chord[(i / 2) % chord.length];
        this.tone({
          freq: note * 2,
          dur: stepDur * 1.8,
          type: 'triangle',
          when: t - ctx.currentTime,
          vol: 0.05,
          verb: 0.4,
          bus: this.musicGain,
        });
      }

      // --- drums ---
      // kick on every beat (and a syncopated "and" push when intense)
      if (beat || (this.intense && i % 16 === 6)) {
        this.tone({
          freq: 150,
          dur: 0.14,
          type: 'sine',
          when: t - ctx.currentTime,
          vol: this.intense ? 0.5 : 0.32,
          slideTo: 48,
          bus: this.musicGain,
        });
      }
      // snare/backbeat on beats 2 & 4 of every bar
      if (i % 8 === 4) {
        this.noise({
          dur: 0.16,
          when: t - ctx.currentTime,
          vol: this.intense ? 0.3 : 0.18,
          lowpass: 5000,
          highpass: 900,
          verb: 0.18,
          bus: this.musicGain,
        });
        this.tone({
          freq: 220,
          dur: 0.09,
          type: 'triangle',
          when: t - ctx.currentTime,
          vol: this.intense ? 0.14 : 0.09,
          bus: this.musicGain,
        });
      }
      // hats on off-beats, accented
      if (i % 2 === 0) {
        this.noise({
          dur: 0.03,
          when: t - ctx.currentTime,
          vol: i % 4 === 0 ? 0.09 : 0.05,
          highpass: 7000,
          bus: this.musicGain,
        });
      }

      this.nextNoteTime += stepDur;
      this.musicStep++;
    }
  }

  startMusic(): void {
    if (!this.musicOn) return;
    const ctx = this.ensure();
    if (!ctx || this.musicTimer != null) return;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusicStep(), 60);
  }

  stopMusic(): void {
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /**
   * Switch between the mellow menu score and the driving in-game score, and
   * raise the crowd murmur on the field. Called when entering/leaving a game.
   */
  duckMusic(inGame: boolean): void {
    this.intense = inGame;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(inGame ? 0.12 : 0.18, this.ctx.currentTime + 0.5);
    }
    if (this.crowdGain && this.ctx) {
      this.crowdGain.gain.linearRampToValueAtTime(inGame ? 0.09 : 0.045, this.ctx.currentTime + 0.8);
    }
  }
}

export const audio = new AudioEngine();
