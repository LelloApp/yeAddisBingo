// Ethiopian Local Language (Amharic) Bingo Announcer & Sound FX Engine

const AMHARIC_DIGITS: { [key: number]: string } = {
  1: 'አንድ',
  2: 'ሁለት',
  3: 'ሶስት',
  4: 'አራት',
  5: 'አምስት',
  6: 'ስድስት',
  7: 'ሰባት',
  8: 'ስምንት',
  9: 'ዘጠኝ',
  10: 'አስር',
};

const AMHARIC_TENS: { [key: number]: string } = {
  20: 'ሃያ',
  30: 'ሰላሳ',
  40: 'አርባ',
  50: 'ሃምሳ',
  60: 'ስልሳ',
  70: 'ሰባ',
};

export function numberToAmharicWord(num: number): string {
  if (num <= 0 || num > 75) return String(num);

  if (num <= 10) {
    return AMHARIC_DIGITS[num];
  }

  if (num < 20) {
    const unit = num - 10;
    return `አስራ ${AMHARIC_DIGITS[unit]}`;
  }

  const tens = Math.floor(num / 10) * 10;
  const unit = num % 10;

  if (unit === 0) {
    return AMHARIC_TENS[tens] || String(num);
  }

  return `${AMHARIC_TENS[tens]} ${AMHARIC_DIGITS[unit]}`;
}

export function getAmharicLetter(num: number): string {
  if (num >= 1 && num <= 15) return 'ቢ';
  if (num >= 16 && num <= 30) return 'አይ';
  if (num >= 31 && num <= 45) return 'ኤን';
  if (num >= 46 && num <= 60) return 'ጂ';
  if (num >= 61 && num <= 75) return 'ኦ';
  return '';
}

class SoundAnnouncerEngine {
  private isMuted: boolean = false;
  private audioCtx: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isMuted = localStorage.getItem('bingo_audio_muted') === 'true';
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Play a soft digital chime when a number appears
  public playChime(frequency = 587.33, duration = 0.25) {
    if (this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context might be restricted before user interaction
    }
  }

  // Celebration fan-fare sound for Bingo winner
  public playWinFanfare() {
    if (this.isMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C - E - G - High C
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playChime(freq, 0.4);
      }, idx * 160);
    });
  }

  // Announce the number using Speech Synthesis in Amharic
  public announceNumber(num: number) {
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;

    this.playChime();

    const letter = getAmharicLetter(num);
    const amharicNumber = numberToAmharicWord(num);
    const spokenText = `${letter}, ${amharicNumber}`; // e.g. "ቢ, አስራ አምስት"

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = 0.95; // Slightly measured rate for clear bingo call
      utterance.pitch = 1.05;

      // Try finding an Amharic or English voice
      const voices = window.speechSynthesis.getVoices();
      const amVoice = voices.find((v) => v.lang.startsWith('am') || v.lang.includes('ETH'));
      if (amVoice) {
        utterance.voice = amVoice;
        utterance.lang = 'am-ET';
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('bingo_audio_muted', String(this.isMuted));
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }
}

export const soundAnnouncer = new SoundAnnouncerEngine();
