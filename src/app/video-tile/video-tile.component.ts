import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Participant } from '../models';

@Component({
  selector: 'app-video-tile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-tile.component.html',
  styleUrls: ['./video-tile.component.scss'],
})
export class VideoTileComponent implements OnInit, OnDestroy {
  @Input() participant?: Participant;
  @Input() isSelf = false;
  @ViewChild('vid', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  hasVideo = false;

  ngOnInit(): void { this.attach(); }
  ngOnDestroy(): void { this.videoRef.nativeElement.srcObject = null; }
  ngOnChanges(){ this.attach(); }

  private attach() {
    const v = this.videoRef.nativeElement;
    if (this.participant?.stream) {
      const stream = this.participant.stream;
      if (v.srcObject !== stream) v.srcObject = stream;

      // some browsers need an explicit play() when tracks turn on/off
      setTimeout(() => v.play().catch(() => {}), 0);

      // mark when video track is actually available/enabled
      const updateHasVideo = () => {
        this.hasVideo = stream.getVideoTracks().some(t => t.enabled);
      };
      updateHasVideo();
      stream.getVideoTracks().forEach(tr => {
        tr.onended = updateHasVideo;
        tr.onmute = updateHasVideo;
        tr.onunmute = () => { updateHasVideo(); setTimeout(() => v.play().catch(()=>{}), 0); };
      });
    } else {
      this.hasVideo = false;
      v.srcObject = null;
    }
  }

  initials(name: string) {
    return name.split(' ').slice(0,2).map(s => s[0]?.toUpperCase() || '').join('');
  }
}