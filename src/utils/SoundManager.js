export class SoundManager {
  constructor() {
    this.audioContext = null;
    this.initialized = false;
    this.waveforms = ["sine", "triangle", "square", "sawtooth"];
  }

  init() {
    if (this.initialized) return;
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    this.initialized = true;
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  randomWaveform() {
    return this.waveforms[Math.floor(Math.random() * this.waveforms.length)];
  }

  randomFreq(base, variance = 50) {
    return base + (Math.random() - 0.5) * variance * 2;
  }

  playBubble(frequency = 800, duration = 0.08, volume = 0.5) {
    this.ensureContext();
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const adjustedVolume = volume * 0.8;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = this.randomWaveform();
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 1.5,
      now + duration * 0.3,
    );
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(adjustedVolume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCall() {
    this.playBubble(this.randomFreq(440, 30), 0.15, 0.32);
    setTimeout(
      () => this.playBubble(this.randomFreq(550, 30), 0.15, 0.32),
      100,
    );
    setTimeout(
      () => this.playBubble(this.randomFreq(660, 30), 0.15, 0.32),
      200,
    );
  }

  playConnecting() {
    this.playBubble(this.randomFreq(700, 50), 0.1, 0.28);
    setTimeout(() => this.playBubble(this.randomFreq(850, 50), 0.1, 0.28), 80);
  }

  playConnect() {
    this.playBubble(this.randomFreq(660, 40), 0.1, 0.4);
    setTimeout(() => this.playBubble(this.randomFreq(880, 40), 0.15, 0.44), 80);
  }

  playDisconnect() {
    this.playBubble(this.randomFreq(440, 30), 0.1, 0.32);
    setTimeout(() => this.playBubble(this.randomFreq(330, 30), 0.15, 0.28), 80);
  }

  playCancel() {
    this.playBubble(this.randomFreq(300, 20), 0.08, 0.28);
    setTimeout(() => this.playBubble(this.randomFreq(250, 20), 0.12, 0.24), 80);
  }

  playIdChange() {
    this.playBubble(this.randomFreq(300, 20), 0.05, 0.16);
    this.playBubble(this.randomFreq(400, 20), 0.05, 0.2);
    this.playBubble(this.randomFreq(600, 20), 0.08, 0.24);
    this.playBubble(this.randomFreq(900, 20), 0.12, 0.32);
  }

  playIncoming() {
    this.playBubble(this.randomFreq(587.33, 40), 0.12, 0.32);
    setTimeout(
      () => this.playBubble(this.randomFreq(659.25, 40), 0.12, 0.32),
      120,
    );
  }

  playAccepted() {
    this.playBubble(this.randomFreq(800, 30), 0.1, 0.4);
    setTimeout(
      () => this.playBubble(this.randomFreq(1000, 30), 0.12, 0.44),
      100,
    );
    setTimeout(
      () => this.playBubble(this.randomFreq(1200, 30), 0.15, 0.48),
      200,
    );
  }
}

export const soundManager = new SoundManager();
