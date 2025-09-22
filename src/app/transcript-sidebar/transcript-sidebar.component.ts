import { Component, OnDestroy, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranscribeService } from './transcribe.service';
@Component({
  selector: 'app-transcript-sidebar',
  imports: [CommonModule],
  templateUrl: './transcript-sidebar.component.html',
  styleUrls: ['./transcript-sidebar.component.scss'],
})
export class TranscriptSidebarComponent implements OnDestroy {

  // expose observables for the template (use | async)
  isRecording$;
  apiCallFlag$;
  audioUrl$;
  transcription$;
  error$;

  constructor(public transcript: TranscribeService) {
    this.isRecording$ = this.transcript.isRecording$;
    this.apiCallFlag$ = this.transcript.apiCallFlag$;
    this.audioUrl$ = this.transcript.audioUrl$;
    this.error$ = this.transcript.error$;
  }

  ngOnDestroy(): void {
    // ensure mic tracks are closed and blob URLs are revoked
    this.transcript.destroy();
  }

  startRecording(): void {
    this.transcript.startRecording();
  }

  stopRecording(): void {
    this.transcript.stopRecording();
  }

  rows = computed(() => 
    this.transcript.transcriptions().map(item => ({
      text: item.item.text,
      who: item.speaker ?? 'User',
      atSec: item.item.created_ts 
    }))
  );
}