// EMBERLINE — audio.js
// All sound is synthesised with WebAudio at play time: no audio files, no
// network, nothing borrowed. Short filtered-noise / oscillator blips for
// shots, hits, the plant beeper and round stingers. Created lazily on the
// first user gesture so browsers never block it.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }
  tone(freq, dur, type = 'square', vol = 0.5, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  noise(dur, vol = 0.5, freq = 1800, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq;
    const gain = this.ctx.createGain(); gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }
  shot(kind) {
    if (kind === 'longbow') { this.noise(0.22, 0.9, 900); this.tone(120, 0.18, 'sawtooth', 0.4, 40); }
    else if (kind === 'smg') { this.noise(0.07, 0.5, 2600); this.tone(220, 0.05, 'square', 0.2, 90); }
    else { this.noise(0.11, 0.65, 1800); this.tone(160, 0.08, 'square', 0.25, 70); }
  }
  botShot() { this.noise(0.08, 0.22, 1400); }
  hit() { this.tone(880, 0.05, 'sine', 0.35); }
  headshot() { this.tone(1320, 0.07, 'sine', 0.45); this.tone(1760, 0.06, 'sine', 0.3, null, 0.04); }
  kill() { this.tone(520, 0.12, 'triangle', 0.5, 180); }
  hurt() { this.tone(140, 0.12, 'sawtooth', 0.4, 80); this.noise(0.08, 0.25, 500); }
  reload() { this.tone(300, 0.05, 'square', 0.25); this.tone(210, 0.05, 'square', 0.25, null, 0.12); }
  dry() { this.tone(1200, 0.03, 'square', 0.18); }
  buy() { this.tone(660, 0.07, 'sine', 0.35); this.tone(990, 0.09, 'sine', 0.35, null, 0.07); }
  denied() { this.tone(180, 0.12, 'square', 0.3); }
  beep(final = false) { this.tone(final ? 1560 : 1040, final ? 0.16 : 0.06, 'sine', 0.4); }
  plantDone() { this.tone(740, 0.08, 'sine', 0.4); this.tone(1108, 0.12, 'sine', 0.4, null, 0.09); }
  explosion() { this.noise(0.7, 1.0, 300); this.tone(70, 0.6, 'sine', 0.8, 30); }
  defused() { this.tone(880, 0.1, 'sine', 0.4); this.tone(587, 0.16, 'sine', 0.4, null, 0.1); }
  roundWin() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.4, null, i * 0.1)); }
  roundLose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.4, null, i * 0.11)); }
  throwWhoosh() { this.noise(0.18, 0.2, 3200); }
}
