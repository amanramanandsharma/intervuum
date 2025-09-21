export type ParticipantId = string;

export interface Participant {
  id: ParticipantId;
  displayName: string;
  stream?: MediaStream;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing?: boolean;
  raisedHand?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: ParticipantId;
  name: string;
  text: string;
  ts: number;
}

export interface SignalMessage {
  type: 'join' | 'leave' | 'offer' | 'answer' | 'ice' | 'chat';
  roomId: string;
  from: ParticipantId;
  to?: ParticipantId;
  payload?: any;
}
