// Sound player for tactile UI interactions using provided audio assets

class SoundFX {
  private individualAudio: HTMLAudioElement | null = null;
  private entrepreneurAudio: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.individualAudio = new Audio('/sounds/individual-click.mp3');
        this.individualAudio.preload = 'auto';
        this.individualAudio.volume = 0.8;

        this.entrepreneurAudio = new Audio('/sounds/entrepreneur-click.mp3');
        this.entrepreneurAudio.preload = 'auto';
        this.entrepreneurAudio.volume = 0.8;
      } catch {
        // Audio not supported in this environment
      }
    }
  }

  // Play audio for Individual Button Click (audley_fergine-ui-button-click-8)
  playIndividualClick() {
    try {
      const audio = this.individualAudio || new Audio('/sounds/individual-click.mp3');
      audio.currentTime = 0;
      audio.volume = 0.85;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay policy or user hasn't interacted
        });
      }
    } catch {
      // Audio playback fallback
    }
  }

  // Play audio for Entrepreneur Button Click (humordome-magic-button-click)
  playEntrepreneurClick() {
    try {
      const audio = this.entrepreneurAudio || new Audio('/sounds/entrepreneur-click.mp3');
      audio.currentTime = 0;
      audio.volume = 0.85;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay policy or user hasn't interacted
        });
      }
    } catch {
      // Audio playback fallback
    }
  }
}

export const soundFX = new SoundFX();
