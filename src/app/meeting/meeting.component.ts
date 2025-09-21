import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { WebRTCService } from '../webrtc.service';
import { VideoTileComponent } from '../video-tile/video-tile.component';
import { AiInterviewerComponent } from '../ai-interviewer/ai-interviewer.component';
import { ChatMessage, Participant } from '../models';
import { TranscriptSidebarComponent } from '../transcript-sidebar/transcript-sidebar.component';

@Component({
  selector: 'app-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, VideoTileComponent, AiInterviewerComponent, TranscriptSidebarComponent],
  templateUrl: './meeting.component.html',
  styleUrls: ['./meeting.component.scss'],
})
export class MeetingComponent {
  rtc = inject(WebRTCService);

  aiTalking = false; // set true while TTS audio plays
  aiTyping = false; // set true while you "prepare" an answer

  // Turn Subjects into Signals for reactivity
  participantsMapSig = toSignal(this.rtc.participants$, { initialValue: new Map() });
  chatSig = toSignal(this.rtc.chat$, { initialValue: [] });
  speakerViewSig = toSignal(this.rtc.speakerView$, { initialValue: false });

  // Derived
  participantsArr = computed<Participant[]>(() => Array.from(this.participantsMapSig().values()));
  chat = computed<ChatMessage[]>(() => this.chatSig());

  // UI state
  showParticipants = signal(false);
  showChat = signal(false);
  showConnect = signal(false);

  // Minimal connect form (hidden by default)
  room = 'demo';
  signalUrl = 'ws://localhost:8080';
  displayName = 'Me';
  draft = '';

  constructor() {
    // Start local media immediately so your tile is visible on first paint
    this.rtc.initLocalMedia().catch((err) => {
      console.error('Local media failed', err);
      alert('Camera/mic permission blocked or unavailable.');
    });
  }

  // Helpers
  me = () => this.participantsMapSig().get(this.rtc.selfId);
  activeSpeaker = () => this.participantsArr()[0] ?? this.me();

  // Remote-only view helpers
  remoteParticipants = computed(() =>
    this.participantsArr().filter((p) => p.id !== this.rtc.selfId)
  );

  // If you want “speaker view” to prefer a remote speaker:
  activeSpeakerRemote = () => this.remoteParticipants()[0] || null;

  // Toggles
  toggleParticipants() {
    this.showParticipants.update((v) => !v);
  }
  toggleChat() {
    this.showChat.update((v) => !v);
  }
  toggleConnect() {
    this.showConnect.update((v) => !v);
  }

  // Actions
  async join() {
    await this.rtc.join(this.room, this.signalUrl, this.displayName);
    this.showConnect.set(false);
  }
  leave() {
    this.rtc.leave(); /* stay in self-preview mode */
  }

  toggleMic() {
    this.me()?.isMuted ? this.rtc.mute(true) : this.rtc.mute(false);
  }
  toggleCam() {
    this.me()?.isCameraOff ? this.rtc.camera(false) : this.rtc.camera(true);
  }
  async share() {
    this.me()?.isScreenSharing
      ? await this.rtc.stopScreenShare()
      : await this.rtc.startScreenShare();
  }
  raise() {
    this.rtc.raiseHand(true);
  }

  sendChat() {
    const text = this.draft.trim();
    if (!text) return;
    this.rtc.sendChat(text);
    this.draft = '';
  }

  time(ts: number) {
    return new Date(ts).toLocaleTimeString();
  }
}
