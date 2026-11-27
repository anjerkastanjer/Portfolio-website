// Opt-in sound, made live with the Web Audio API: no audio files are downloaded.
// A low hum while the page is open, a whoosh when the swarm changes shape, a thump when you
// scatter it, and soft ticks while the assistant talks.

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastTick = 0;
  on = false;

  /** Must be called from a click: browsers only allow audio to start after a user gesture. */
  async toggle(): Promise<boolean> {
    if (!this.ctx) this.start();
    const ctx = this.ctx!;
    this.on = !this.on;
    if (this.on && ctx.state === 'suspended') await ctx.resume();
    this.master!.gain.setTargetAtTime(this.on ? 0.55 : 0, ctx.currentTime, 0.25);
    return this.on;
  }

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // One second of white noise, reused by every whoosh and thump.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // The hum: two detuned low sines through a slow filter, barely there.
    const hum = ctx.createGain();
    hum.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    for (const f of [55, 55.4, 82.5]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(hum).connect(this.master);
  }

  private burst(duration: number, from: number, to: number, volume: number, q = 0.8) {
    if (!this.on || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t, Math.random() * 0.5, duration);
  }

  /** The swarm takes a new shape. */
  whoosh() {
    this.burst(1.1, 300, 2400, 0.35);
  }

  /** The swarm is scattered by a click. */
  thump() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.5);
    this.burst(0.4, 2000, 200, 0.25);
  }

  /** A piece of the assistant's answer arrives. Rate-limited so fast streams stay pleasant. */
  tick() {
    if (!this.on || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastTick < 70) return;
    this.lastTick = now;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 900 + Math.random() * 500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}
