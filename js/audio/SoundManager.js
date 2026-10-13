/**
 * SoundManager.js
 * Pure Web Audio API procedural sound synthesis for medieval combat:
 * - Sword swings, steel clangs, shield blocks/parries, couched lance impacts
 * - Rhythmic warhorse hoofbeats, horse whinny / mount toggle
 * - Bowstring twang & arrow flight
 * - 4 distinct medieval War Horn tactical calls (Follow, Charge, Shield Wall, Hunt Archers)
 * - Objective fanfare & Victory/Defeat brass chords
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this._noiseBuffer = null;
    this._hoofStepToggle = false;
    this._lastSwingTime = 0;
    this._lastHitTime = 0;
    this._bindUnlockListeners();
  }

  _bindUnlockListeners() {
    const unlock = () => {
      this._ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  _ensureContext() {
    if (this.isMuted) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.42;
        this.masterGain.connect(this.ctx.destination);
        this._createNoiseBuffer();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.ctx.state !== 'running') return null;
      return this.ctx;
    } catch {
      return null;
    }
  }

  _createNoiseBuffer() {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this._noiseBuffer = buffer;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.42, this.ctx.currentTime, 0.02);
    }
    return this.isMuted;
  }

  /**
   * Broadsword or lance air-slice whoosh.
   */
  playSwordSwing(comboIndex = 0) {
    const ctx = this._ensureContext();
    if (!ctx || !this._noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this._lastSwingTime < 0.08) return;
    this._lastSwingTime = now;

    try {
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const baseFreq = 520 + comboIndex * 110;
      filter.frequency.setValueAtTime(baseFreq, now);
      filter.frequency.exponentialRampToValueAtTime(baseFreq * 2.1, now + 0.09);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.22);
      filter.Q.value = 2.8;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(now);
      noise.stop(now + 0.24);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Visceral sword-on-armor impact: metallic ring + low meaty thud.
   */
  playSwordHit(isHeavy = false) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this._lastHitTime < 0.04) return;
    this._lastHitTime = now;

    try {
      // 1. Low meaty thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(isHeavy ? 125 : 105, now);
      thudOsc.frequency.exponentialRampToValueAtTime(32, now + 0.16);
      thudGain.gain.setValueAtTime(isHeavy ? 0.55 : 0.36, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      thudOsc.connect(thudGain);
      thudGain.connect(this.masterGain);
      thudOsc.start(now);
      thudOsc.stop(now + 0.18);

      // 2. Metallic steel partials
      const partials = isHeavy ? [1180, 1890, 2740] : [1340, 2120];
      for (let i = 0; i < partials.length; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'square';
        const f = partials[i] * (0.95 + Math.random() * 0.1);
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.92, now + 0.22);
        g.gain.setValueAtTime(0.09 / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.23);
      }
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Resonant heater-shield block or parry spark clang.
   */
  playShieldBlock(isParry = false) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const freqs = isParry ? [880, 1420, 2680, 3520] : [480, 920, 1680];
      for (let i = 0; i < freqs.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freqs[i], now);
        osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.96, now + 0.28);
        gain.gain.setValueAtTime(0.18 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Thunderous couched-lance impact on charge!
   */
  playLanceImpact() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      // Sub-bass shockwave
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(26, now + 0.32);
      subGain.gain.setValueAtTime(0.65, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      sub.connect(lp);
      lp.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(now);
      sub.stop(now + 0.35);

      // Timber crunch noise burst
      if (this._noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(950, now);
        bp.Q.value = 1.6;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.45, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.26);
      }

      this.playSwordHit(true);
    } catch {
      // Ignore
    }
  }

  /**
   * Rhythmic warhorse hoofbeat ("clip-clop" earth thud).
   */
  playHoofbeat(speedRatio = 0.6) {
    const ctx = this._ensureContext();
    if (!ctx || !this._noiseBuffer) return;
    const now = ctx.currentTime;
    this._hoofStepToggle = !this._hoofStepToggle;

    try {
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = this._hoofStepToggle ? 240 : 310;
      filter.Q.value = 3.5;

      const gain = ctx.createGain();
      const vol = Math.min(0.22, 0.06 + speedRatio * 0.14);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.08);
    } catch {
      // Ignore
    }
  }

  /**
   * Saddle leather & chainmail clink on Mount / Dismount, plus optional whistle when calling horse.
   */
  playMountToggle(isMounting = true, isWhistle = false) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      if (isWhistle) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1450, now);
        osc.frequency.linearRampToValueAtTime(2150, now + 0.14);
        osc.frequency.linearRampToValueAtTime(1750, now + 0.28);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.18, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.32);
      }

      // Armor/stirrup clink
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isMounting ? 320 : 440, now);
      osc.frequency.exponentialRampToValueAtTime(isMounting ? 520 : 240, now + 0.14);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore
    }
  }

  /**
   * Bowstring twang & arrow launch.
   */
  playBowTwang() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore
    }
  }

  /**
   * Resonant medieval War Horn call for Companion Tactical Redirections!
   * @param {'follow'|'charge'|'hold'|'archers'} order
   */
  playHorn(order = 'charge') {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Distinct brass horn interval patterns per tactical order
    let notes = [146.83, 220.0]; // D3 -> A3 (Charge fifth)
    if (order === 'follow') {
      notes = [164.81, 196.0, 246.94]; // E3 -> G3 -> B3
    } else if (order === 'hold') {
      notes = [130.81, 130.81]; // Deep C3 double blast
    } else if (order === 'archers') {
      notes = [196.0, 246.94, 293.66]; // G3 -> B3 -> D4 hunting horn
    }

    try {
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.18;
        const dur = idx === notes.length - 1 ? 0.55 : 0.17;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(freq * 0.98, start);
        osc1.frequency.linearRampToValueAtTime(freq, start + 0.05);
        osc2.frequency.setValueAtTime(freq * 2, start);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, start);
        filter.frequency.linearRampToValueAtTime(980, start + dur * 0.5);
        filter.frequency.linearRampToValueAtTime(520, start + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.28, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + dur + 0.02);
        osc2.stop(start + dur + 0.02);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Heroic brass fanfare for Objective Completed or Battle Victory.
   */
  playVictoryFanfare(isVictory = true) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = isVictory ? [261.63, 329.63, 392.0, 523.25] : [220.0, 261.63, 329.63, 196.0];

    try {
      chord.forEach((freq, i) => {
        const start = now + i * 0.12;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);
        filter.type = 'lowpass';
        filter.frequency.value = 1100;

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + 0.68);
      });
    } catch {
      // Ignore
    }
  }
}
