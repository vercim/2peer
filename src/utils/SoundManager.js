export class SoundManager {
  constructor() {
    this.audioContext = null;
    this.initialized = false;
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

  playBubble(frequency = 800, duration = 0.08, volume = 0.5) {
    this.ensureContext();
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 1.5,
      now + duration * 0.3,
    );
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCall() {
    this.playBubble(440, 0.15, 0.4);
    setTimeout(() => this.playBubble(550, 0.15, 0.4), 100);
    setTimeout(() => this.playBubble(660, 0.15, 0.4), 200);
  }

  playConnecting() {
    this.playBubble(700, 0.1, 0.35);
    setTimeout(() => this.playBubble(850, 0.1, 0.35), 80);
  }

  playConnect() {
    this.playBubble(660, 0.1, 0.5);
    setTimeout(() => this.playBubble(880, 0.15, 0.55), 80);
  }

  playDisconnect() {
    this.playBubble(440, 0.1, 0.4);
    setTimeout(() => this.playBubble(330, 0.15, 0.35), 80);
  }

  playCancel() {
    this.playBubble(300, 0.08, 0.35);
    setTimeout(() => this.playBubble(250, 0.12, 0.3), 80);
  }

  playIdChange() {
    this.playBubble(300, 0.05, 0.2);
    this.playBubble(400, 0.05, 0.25);
    this.playBubble(600, 0.08, 0.3);
    this.playBubble(900, 0.12, 0.4);
  }

  playIncoming() {
    this.playBubble(587.33, 0.12, 0.4);
    setTimeout(() => this.playBubble(659.25, 0.12, 0.4), 120);
  }
}

export const soundManager = new SoundManager();
