import { Injectable, signal } from '@angular/core';

export interface TranscriptItem {
  id: string;
  text: string;
  created_ts: number; // ms epoch from backend
}

export interface TranscribeStartOpts {
  /** Chunk duration in ms (default 4000). */
  chunkMs?: number;
  /** Optional language hint sent as form field. */
  languageHint?: string;
  /** Optional backend override just for this session. */
  backendUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class TranscribeService {
  // ===== Public reactive state =====
  readonly items = signal<TranscriptItem[]>([]);
  readonly isRecording = signal(false);
  readonly sessionId = signal<string | null>(null);
  readonly backendUrl = signal<string>('http://localhost:8000'); // FastAPI base

  // ===== Internals =====
  private recorder?: MediaRecorder;
  private chunkMs = 4000;
  private languageHint?: string;
  private uploadQueue: Blob[] = [];
  private uploading = false;
  private abortCtrl?: AbortController;

  /** Set the FastAPI server URL globally (e.g., from an env). */
  setBackend(url: string) { this.backendUrl.set(url.replace(/\/+$/, '')); }

  /** Start mic capture and chunked uploads. */
  async start(opts: TranscribeStartOpts = {}) {
    if (this.isRecording()) return;

    if (opts.backendUrl) this.setBackend(opts.backendUrl);
    this.chunkMs = opts.chunkMs ?? 4000;
    this.languageHint = opts.languageHint;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mime = this.pickMimeType();
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.abortCtrl = new AbortController();

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) {
        this.uploadQueue.push(ev.data);
        this.flushQueue(); // fire-and-forget
      }
    };
    this.recorder.onerror = (e) => {
      console.error('MediaRecorder error', e);
      this.stop(); // fail-safe
    };

    this.recorder.start(this.chunkMs);
    this.isRecording.set(true);
  }

  /** Stop recording and close tracks. Any queued chunks will finish uploading. */
  stop() {
    try { this.recorder?.stop(); } catch {}
    this.recorder?.stream.getTracks().forEach(t => t.stop());
    this.recorder = undefined;
    this.isRecording.set(false);
    // You can optionally cancel inflight requests:
    // this.abortCtrl?.abort();
    // this.abortCtrl = undefined;
  }

  /** Clear UI state and forget the server session id. */
  clear() {
    this.items.set([]);
    this.sessionId.set(null);
    this.uploadQueue = [];
  }

  /** Optional: manually push a Blob (e.g., from file input) to the same pipeline. */
  enqueue(blob: Blob) {
    this.uploadQueue.push(blob);
    this.flushQueue();
  }

  // ===== Helpers =====

  private pickMimeType(): string | null {
    const prefs = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg'
    ];
    return prefs.find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || null;
  }

  private async flushQueue() {
    if (this.uploading) return;
    this.uploading = true;

    while (this.uploadQueue.length) {
      const blob = this.uploadQueue.shift()!;
      try {
        await this.sendChunk(blob);
      } catch (err) {
        console.error('Upload failed, re-queueing once:', err);
        // simple one-time retry: push to front and try again once
        if (!('_retried' in (blob as any))) {
          (blob as any)._retried = true;
          this.uploadQueue.unshift(blob);
        }
        break; // break loop so we don’t spin
      }
    }

    this.uploading = false;
  }

  private async sendChunk(blob: Blob) {
    const base = this.backendUrl();
    const url = `${base}/transcribe`;

    const form = new FormData();
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `part-${Date.now()}.${ext}`, { type: blob.type || `audio/${ext}` });
    form.append('file', file);
    if (this.sessionId()) form.append('session_id', this.sessionId()!);
    if (this.languageHint) form.append('language_hint', this.languageHint);

    // basic exponential backoff
    const maxAttempts = 3;
    let attempt = 0, lastErr: any;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: form,
          signal: this.abortCtrl?.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!this.sessionId()) this.sessionId.set(data.session_id);
        const item = data.item as TranscriptItem;
        this.items.update(arr => [...arr, item]);
        return;
      } catch (e) {
        lastErr = e;
        const delay = 300 * Math.pow(2, attempt - 1); // 300ms, 600ms, 1200ms
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }
}
