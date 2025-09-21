import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranscribeService } from './transcribe.service';

@Component({
  selector: 'app-transcript-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transcript-sidebar.component.html',
  styleUrls: ['./transcript-sidebar.component.scss'],
})
export class TranscriptSidebarComponent {

  constructor(public tx: TranscribeService) {
  // optional: point to your FastAPI server once
  this.tx.setBackend('http://localhost:8000');
}

  svc = inject(TranscribeService);
  items = computed(() => this.svc.items());

  toggleRecord(){
    this.svc.isRecording() ? this.svc.stop() : this.svc.start();
  }
  time(ms:number){ return new Date(ms).toLocaleTimeString(); }
}
