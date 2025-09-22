import { Injectable, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';

interface TranscriptionResponse {
  transcription?: string;
  [k: string]: any;
}

@Injectable({ providedIn: 'root' })
export class TranscribeService implements OnDestroy {
  // === public reactive state (bind in component template via async pipe) ===
  private _isRecording = new BehaviorSubject<boolean>(false);
  isRecording$ = this._isRecording.asObservable();

  private _apiCallFlag = new BehaviorSubject<boolean>(false);
  apiCallFlag$ = this._apiCallFlag.asObservable();

  private _audioUrl = new BehaviorSubject<string | undefined>(undefined);
  audioUrl$ = this._audioUrl.asObservable();

  transcriptions = signal<any[]>([]);

  private _error = new Subject<string>();
  error$ = this._error.asObservable();

  // === internals ===
  private mediaRecorder?: MediaRecorder;
  private mediaStream?: MediaStream;
  private audioChunks: BlobPart[] = [];
  private lastObjectUrl?: string;

  // === CONFIG ===
  private readonly uploadUrl = 'http://localhost:8000/transcribe'; // <--- change as needed

  constructor(private http: HttpClient) {}

  ngOnDestroy(): void {
    this.destroy();
  }

  /** Start capturing mic and recording one continuous chunk. */
  async startRecording(): Promise<void> {
    if (this._isRecording.value) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.mediaStream = stream;

      const mimeType = this.pickMimeType();
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      this.audioChunks = [];
      this._isRecording.next(true);
      this._apiCallFlag.next(false);

      this.mediaRecorder.ondataavailable = (event: any /* BlobEvent */) => {
        if (event?.data && event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        this._isRecording.next(false);
        this._apiCallFlag.next(true);

        try {
          const type = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type });

          if (this.lastObjectUrl) URL.revokeObjectURL(this.lastObjectUrl);
          this.lastObjectUrl = URL.createObjectURL(audioBlob);
          this._audioUrl.next(this.lastObjectUrl);

          const res = await this.uploadAudio(audioBlob);
          if (res) {
            this.appendTranscription(res);
            // this.transcriptions.push(res.transcription);
          }
        } catch (e: any) {
          this._error.next(String(e?.message || e));
        } finally {
          this._apiCallFlag.next(false);
        }
      };

      this.mediaRecorder.start(); // record as one big chunk; we’ll get it on stop
    } catch (err: any) {
      this._error.next(`getUserMedia error: ${err?.message || err}`);
    }
  }

  /** Stop recording; triggers onstop → blob build → upload. */
  stopRecording(): void {
    if (!this.mediaRecorder) return;
    try {
      if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    } catch {}
    try {
      this.mediaStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    this.mediaStream = undefined;
  }

  /** Cleanup when component is destroyed or when you want to reset the service. */
  destroy(): void {
    try {
      this.mediaStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    this.mediaStream = undefined;
    if (this.lastObjectUrl) {
      URL.revokeObjectURL(this.lastObjectUrl);
      this.lastObjectUrl = undefined;
    }
  }

  // ===== helper bits =====

  private pickMimeType(): string | undefined {
    const prefs = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg',
      'audio/mp4', // Safari/iOS
    ];
    // @ts-ignore
    const isSup = (m: string) => window.MediaRecorder?.isTypeSupported?.(m);
    return prefs.find(isSup);
  }

  private async uploadAudio(blob: Blob): Promise<TranscriptionResponse> {
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], `recording.${ext}`, { type: blob.type || `audio/${ext}` });

    const form = new FormData();
    form.append('file', file);
    // form.append('language_hint', 'en'); // example of an extra field if needed

    // Prefer HttpClient (interceptors, error handling, etc.)
    const req$ = this.http.post<TranscriptionResponse>(this.uploadUrl, form);
    return firstValueFrom(req$);
  }

appendTranscription(t: any) {
    this.transcriptions.update(arr => [...arr, t]);
  }
}
