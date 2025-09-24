// tts-web.service.ts
import { Injectable } from '@angular/core';

export type TtsOptions = {
  voiceName?: string;        // e.g. "Google हिन्दी", "Google UK English Female"
  lang?: string;             // e.g. "hi-IN", "en-IN", "en-US"
  rate?: number;             // 0.1 - 10 (default 1)
  pitch?: number;            // 0 - 2 (default 1)
  volume?: number;           // 0 - 1 (default 1)
  queue?: boolean;           // if false, cancel any ongoing before speaking
};

@Injectable({ providedIn: 'root' })
export class TtsService {
  private synth = window.speechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesReady: Promise<SpeechSynthesisVoice[]>;

  constructor() {
    this.voicesReady = new Promise((resolve) => {
      const load = () => {
        this.voices = this.synth.getVoices();
        if (this.voices.length) resolve(this.voices);
      };
      // Some browsers populate asynchronously
      this.synth.onvoiceschanged = () => { load(); };
      // Try immediately too
      load();
      // Fallback timer (Safari sometimes needs a tick)
      setTimeout(load, 300);
    });
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    await this.voicesReady;
    return this.voices.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  async speak(text: string, opts: TtsOptions = {}) {
    if (!('speechSynthesis' in window)) {
      throw new Error('Web Speech API not supported in this browser.');
    }

    await this.voicesReady;

    if (!opts.queue) this.synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = opts.rate   ?? 1;
    utter.pitch  = opts.pitch  ?? 1;
    utter.volume = opts.volume ?? 1;
    utter.lang   = opts.lang   ?? 'en-IN';

    // Pick a voice: by exact name, else by lang, else first available
    if (opts.voiceName) {
      utter.voice = this.voices.find(v => v.name === opts.voiceName) || null;
    }
    if (!utter.voice && opts.lang) {
      const byLang = this.voices.find(v => v.lang.toLowerCase() === opts.lang!.toLowerCase())
                  || this.voices.find(v => v.lang.toLowerCase().startsWith(opts.lang!.split('-')[0].toLowerCase()));
      if (byLang) utter.voice = byLang;
    }
    if (!utter.voice && this.voices.length) {
      utter.voice = this.voices[0];
    }

    return new Promise<void>((resolve, reject) => {
      utter.onend = () => resolve();
      utter.onerror = (e) => reject(e.error || e);
      this.synth.speak(utter);
    });
  }

  pause()  { if (this.synth.speaking && !this.synth.paused) this.synth.pause(); }
  resume() { if (this.synth.paused) this.synth.resume(); }
  stop()   { this.synth.cancel(); }
}
