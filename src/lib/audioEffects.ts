/**
 * Audio effects for auction events
 * Uses Web Audio API to generate sound effects without external files
 */

let audioContext: AudioContext | null = null;

// Initialize audio context on user interaction (required by browsers)
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      return null;
    }
  }

  // Resume context if suspended (required by some browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

/**
 * Play a buzzer sound effect (like a game show buzzer)
 * Used when auction timer expires
 */
export function playBuzzer() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Create oscillator for buzzer tone
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Connect audio nodes
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Buzzer characteristics: harsh, descending tone
  oscillator.type = 'sawtooth'; // Harsh, buzzer-like sound
  oscillator.frequency.setValueAtTime(220, now); // Start at A3
  oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.5); // Drop to A2

  // Volume envelope: quick attack, sustained, quick release
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02); // Attack
  gainNode.gain.setValueAtTime(0.3, now + 0.4); // Sustain
  gainNode.gain.linearRampToValueAtTime(0, now + 0.5); // Release

  // Play for 500ms
  oscillator.start(now);
  oscillator.stop(now + 0.5);

  // Cleanup
  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

/**
 * Play a short beep for countdown warnings (e.g., 10 seconds remaining)
 */
export function playWarningBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Warning beep: medium pitch, short duration
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(660, now); // E5

  // Quick beep
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, now + 0.15);

  oscillator.start(now);
  oscillator.stop(now + 0.15);

  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

/**
 * Play a success sound for successful bid placement
 */
export function playBidSuccess() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Pleasant ascending tone
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523, now); // C5
  oscillator.frequency.exponentialRampToValueAtTime(784, now + 0.1); // G5

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.1, now + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, now + 0.15);

  oscillator.start(now);
  oscillator.stop(now + 0.15);

  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

/**
 * Play a "sold" sound for when a lot is sold
 * Like a cash register or gavel
 */
export function playSoldSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Create two tones for a "cha-ching" effect
  const playTone = (frequency: number, startTime: number) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, startTime + 0.2);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);

    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  };

  playTone(880, now); // A5
  playTone(1047, now + 0.08); // C6
}

/**
 * Initialize audio context on user interaction
 * Call this on first user click/tap to unlock audio
 */
export function initAudio() {
  getAudioContext();
}
