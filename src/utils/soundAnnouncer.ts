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

      // Auto-unlock Web Audio API on first user interaction anywhere
      const unlockAudio = () => {
        const ctx = this.getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume();
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
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
    } catch {
      return null;
    }
  }

  // Play a crisp, pleasant dual-tone chime when a number appears
  public playChime(frequency = 587.33, duration = 0.35) {
    if (this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // First bell harmonic
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(frequency * 1.33, ctx.currentTime + duration);

      gain1.gain.setValueAtTime(0.28, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + duration);

      // Second harmonic overtone for clarity
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(frequency * 1.5, ctx.currentTime);

      gain2.gain.setValueAtTime(0.12, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + duration);
    } catch (err) {
      console.warn('Audio chime playback error:', err);
    }
  }

  // Celebration fanfare sound for Bingo winner
  public playWinFanfare() {
    if (this.isMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C - E - G - High C - High E
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playChime(freq, 0.45);
      }, idx * 140);
    });
  }

  // Announce the number using chime + speech synthesis
  public announceNumber(num: number) {
    if (this.isMuted) return;

    // 1. ALWAYS play the energetic bell chime first
    this.playChime();

    // 2. Vocal pronunciation if speech synthesis is available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const letter = getAmharicLetter(num);
        const amharicNumber = numberToAmharicWord(num);
        const spokenText = `${letter}, ${amharicNumber}`;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.rate = 0.95;
        utterance.pitch = 1.05;

        const voices = window.speechSynthesis.getVoices();
        const amVoice = voices.find((v) => v.lang.startsWith('am') || v.lang.includes('ETH'));
        if (amVoice) {
          utterance.voice = amVoice;
          utterance.lang = 'am-ET';
        }

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        // Speech synthesis is non-blocking fallback
      }
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
