export class SoundManager {
  constructor() {
    this.audioContext = null;
    this.initialized = false;
    this.incomingInterval = null;
    this.volumeMultiplier = 1;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopIncomingLoop();
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
    if (!this.enabled) return;
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
    gain.gain.linearRampToValueAtTime(
      volume * this.volumeMultiplier,
      now + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCall() {
    this.playBubble(440, 0.15, 0.288);
    setTimeout(() => this.playBubble(550, 0.15, 0.288), 100);
    setTimeout(() => this.playBubble(660, 0.15, 0.288), 200);
  }

  playConnecting() {
    this.playBubble(700, 0.1, 0.252);
    setTimeout(() => this.playBubble(850, 0.1, 0.252), 80);
  }

  playConnect() {
    this.playBubble(660, 0.1, 0.36);
    setTimeout(() => this.playBubble(880, 0.15, 0.396), 80);
  }

  playDisconnect() {
    this.playBubble(440, 0.1, 0.288);
    setTimeout(() => this.playBubble(330, 0.15, 0.252), 80);
  }

  playCancel() {
    this.playBubble(300, 0.08, 0.252);
    setTimeout(() => this.playBubble(250, 0.12, 0.216), 80);
  }

  playIdChange() {
    this.playBubble(300, 0.05, 0.144);
    this.playBubble(400, 0.05, 0.18);
    this.playBubble(600, 0.08, 0.216);
    this.playBubble(900, 0.12, 0.288);
  }

  playIncomingLoop() {
    this.stopIncomingLoop();
    this.incomingInterval = setInterval(() => {
      this.playBubble(587.33, 0.12, 0.288);
      setTimeout(() => this.playBubble(659.25, 0.12, 0.288), 120);
    }, 500);
  }

  stopIncomingLoop() {
    if (this.incomingInterval) {
      clearInterval(this.incomingInterval);
      this.incomingInterval = null;
    }
  }
}

export const soundManager = new SoundManager();
