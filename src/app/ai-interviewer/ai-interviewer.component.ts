import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ai-interviewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-interviewer.component.html',
  styleUrls: ['./ai-interviewer.component.scss'],
})
export class AiInterviewerComponent {
  /** Set true to animate the mouth/equalizer (e.g., while TTS is speaking). */
  @Input() talking = false;
  /** Show the tiny typing bubble (optional). */
  @Input() showBubble = false;
  /** Display name under the avatar. */
  @Input() name = 'AI Interviewer';

  get ariaLabel() {
    return `${this.name}${this.talking ? ' (speaking)' : ''}`;
  }
}
