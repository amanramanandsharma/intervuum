import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, filter } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, Participant, ParticipantId, SignalMessage } from './models';

@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private ws?: WebSocket;
  private roomId?: string;

  readonly selfId: ParticipantId = uuidv4();
  readonly participants$ = new BehaviorSubject<Map<ParticipantId, Participant>>(new Map());
  readonly chat$ = new BehaviorSubject<ChatMessage[]>([]);
  readonly speakerView$ = new BehaviorSubject<boolean>(false);

  private pcMap = new Map<ParticipantId, RTCPeerConnection>();
  private localStream?: MediaStream;
  private screenStream?: MediaStream;

  get me(): Participant {
    const p = this.participants$.value.get(this.selfId);
    return p ?? { id: this.selfId, displayName: 'Me', isMuted: false, isCameraOff: false };
  }

  async initLocalMedia(constraints: MediaStreamConstraints = { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }) {
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.upsertParticipant({ id: this.selfId, displayName: 'Me', stream: this.localStream, isMuted: false, isCameraOff: false });
  }

  toggleSpeakerView() {
    this.speakerView$.next(!this.speakerView$.value);
  }

  async join(roomId: string, signalingUrl: string, displayName = 'Me') {
    this.roomId = roomId;
    this.ws = new WebSocket(signalingUrl);
    await new Promise<void>((res, rej) => {
      this.ws!.onopen = () => res();
      this.ws!.onerror = (e) => rej(e);
    });

    this.ws.onmessage = (ev) => this.handleSignal(JSON.parse(ev.data));

    this.upsertParticipant({ id: this.selfId, displayName, stream: this.localStream, isMuted: false, isCameraOff: false });

    this.send({ type: 'join', roomId, from: this.selfId });
  }

  leave() {
    this.send({ type: 'leave', roomId: this.roomId!, from: this.selfId });
    this.ws?.close();
    this.pcMap.forEach(pc => pc.close());
    this.pcMap.clear();
    this.participants$.next(new Map([[this.selfId, this.me]]));
    this.localStream?.getTracks().forEach(t => t.stop());
    this.screenStream?.getTracks().forEach(t => t.stop());
  }

  async startScreenShare() {
    if (this.screenStream) return;
    this.screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
    // Replace sender track in all peer connections
    for (const [, pc] of this.pcMap) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && this.screenStream.getVideoTracks()[0]) {
        await sender.replaceTrack(this.screenStream.getVideoTracks()[0]);
      }
    }
    this.upsertParticipant({ ...this.me, stream: this.screenStream, isScreenSharing: true });
    this.screenStream.getVideoTracks()[0].addEventListener('ended', () => this.stopScreenShare());
  }

  async stopScreenShare() {
    if (!this.screenStream || !this.localStream) return;
    for (const [, pc] of this.pcMap) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && this.localStream.getVideoTracks()[0]) {
        await sender.replaceTrack(this.localStream.getVideoTracks()[0]);
      }
    }
    this.screenStream.getTracks().forEach(t => t.stop());
    this.screenStream = undefined;
    this.upsertParticipant({ ...this.me, stream: this.localStream, isScreenSharing: false });
  }

  mute(unmute = false) {
    this.localStream?.getAudioTracks().forEach(t => (t.enabled = unmute));
    this.upsertParticipant({ ...this.me, isMuted: !unmute });
  }

  camera(off = true) {
    this.localStream?.getVideoTracks().forEach(t => (t.enabled = !off));
    this.upsertParticipant({ ...this.me, isCameraOff: off });
  }

  raiseHand(toggle = true) {
    this.upsertParticipant({ ...this.me, raisedHand: toggle ? !this.me.raisedHand : !!this.me.raisedHand });
  }

  sendChat(text: string) {
    const msg: ChatMessage = { id: uuidv4(), userId: this.selfId, name: this.me.displayName, text, ts: Date.now() };
    this.chat$.next([...this.chat$.value, msg]);
    this.send({ type: 'chat', roomId: this.roomId!, from: this.selfId, payload: msg });
  }

  // ============= Signaling / Peer setup =============
  private send(msg: SignalMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.from === this.selfId) return;
    switch (msg.type) {
      case 'join':
        await this.createPeerAndOffer(msg.from);
        break;
      case 'offer':
        await this.onOffer(msg.from, msg.payload);
        break;
      case 'answer':
        await this.onAnswer(msg.from, msg.payload);
        break;
      case 'ice':
        await this.pcMap.get(msg.from)?.addIceCandidate(msg.payload);
        break;
      case 'chat':
        this.chat$.next([...this.chat$.value, msg.payload as ChatMessage]);
        break;
      case 'leave':
        this.removeParticipant(msg.from);
        break;
    }
  }

  private async createPeerAndOffer(remoteId: ParticipantId) {
    const pc = this.createPC(remoteId);
    // Add local tracks
    this.localStream?.getTracks().forEach(t => pc.addTrack(t, this.localStream!));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ type: 'offer', roomId: this.roomId!, from: this.selfId, to: remoteId, payload: offer });
  }

  private async onOffer(remoteId: ParticipantId, sdp: RTCSessionDescriptionInit) {
    const pc = this.createPC(remoteId);
    this.localStream?.getTracks().forEach(t => pc.addTrack(t, this.localStream!));
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.send({ type: 'answer', roomId: this.roomId!, from: this.selfId, to: remoteId, payload: answer });
  }

  private async onAnswer(remoteId: ParticipantId, sdp: RTCSessionDescriptionInit) {
    const pc = this.pcMap.get(remoteId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  private createPC(remoteId: ParticipantId) {
    let pc = this.pcMap.get(remoteId);
    if (pc) return pc;

    pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
    });
    this.pcMap.set(remoteId, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ type: 'ice', roomId: this.roomId!, from: this.selfId, to: remoteId, payload: e.candidate });
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      const existing = this.participants$.value.get(remoteId);
      const p: Participant = existing ?? { id: remoteId, displayName: `User ${remoteId.slice(0, 5)}`, isMuted: false, isCameraOff: false };
      this.upsertParticipant({ ...p, stream });
    };

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === 'disconnected' || pc!.connectionState === 'failed') {
        this.removeParticipant(remoteId);
      }
    };

    // Create/refresh participant stub
    const p = this.participants$.value.get(remoteId) ?? { id: remoteId, displayName: `User ${remoteId.slice(0, 5)}`, isMuted: false, isCameraOff: false };
    this.upsertParticipant(p);
    return pc;
  }

  private upsertParticipant(patch: Participant) {
    const clone = new Map(this.participants$.value);
    const current = clone.get(patch.id) ?? { id: patch.id, displayName: patch.displayName, isMuted: false, isCameraOff: false };
    clone.set(patch.id, { ...current, ...patch });
    this.participants$.next(clone);
  }

  private removeParticipant(id: ParticipantId) {
    const clone = new Map(this.participants$.value);
    const pc = this.pcMap.get(id);
    pc?.close();
    this.pcMap.delete(id);
    clone.delete(id);
    this.participants$.next(clone);
  }
}
