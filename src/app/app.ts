import { Component, signal } from '@angular/core';
import { MeetingComponent } from './meeting/meeting.component';

@Component({
  selector: 'app-root',
  imports: [MeetingComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('intervuum');
}
