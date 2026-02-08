import { Component, OnDestroy } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { environment } from '../environments/environment';
import { GriotApiService } from './services/griot-api.service';

const GET_STORY_REQUEST = gql`
  query GetStoryRequest($id: UUID!) {
    storyRequest(id: $id) {
      id
      status
      tone
      storyText
      moral
      themes
      proverbs
      extractedData
      sourceText
      audioUrl
      audioData
      audioFormat
      subtitles
      createdAt
    }
  }
`;

interface StoryRequestResponse {
  storyRequest: {
    id: string;
    status: string;
    tone: string;
    storyText: string;
    moral: string;
    themes: unknown;
    proverbs: unknown;
    extractedData: unknown;
    sourceText: string;
    audioUrl: string;
    audioData: string;
    audioFormat: string;
    subtitles: unknown;
    createdAt: string;
  } | null;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  tones = [
    { value: 'moonlight_elder', label: 'Moonlight Elder (Classic Griot)' },
    { value: 'village_fire', label: 'Village Fire Storyteller' },
    { value: 'wise_judge', label: 'Wise Judge' },
    { value: 'hopeful_healer', label: 'Hopeful Healer' },
    { value: 'playful_trickster', label: 'Playful Trickster' },
  ];

  inputValue = '';
  tone = 'moonlight_elder';

  requestId = '';
  status = '';
  error = '';
  loading = false;

  storyText = '';
  moral = '';
  themes: string[] = [];
  proverbMatch: any = null;
  facts: any = null;
  sourceText = '';
  audioSrc = '';
  subtitles: any[] = [];
  models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> = [];
  modelsError = '';
  ttsTestAudio = '';
  ttsTestError = '';
  ttsTestLoading = false;
  audioLoading = false;
  realtimeReading = false;
  toneIcons: Record<string, string> = {
    moonlight_elder: '🌓',
    village_fire: '🔥',
    wise_judge: '⚖️',
    hopeful_healer: '🌱',
    playful_trickster: '🐢'
  };

  private statusSub?: Subscription;
  private drumAudio: HTMLAudioElement | null = null;
  private realtimeAudioEl: HTMLAudioElement | null = null;
  private ambientAudioEl: HTMLAudioElement | null = null;
  private drumTracks = [
    'assets/drums/adinkra_audio-african-cultue-jingle-beat-270357.mp3',
    'assets/drums/adinkra_audio-conga-400506.mp3',
    'assets/drums/ethnicsoundscapes-djembe-beat-4-slow-pace-323061.mp3',
    'assets/drums/freesound_community-african-98600.mp3'
  ];

  constructor(
    private api: GriotApiService,
    private apollo: Apollo
  ) {}

  ngOnDestroy(): void {
    this.statusSub?.unsubscribe();
    this.stopDrum();
    this.stopRealtimeNarration();
  }

  submit(): void {
    this.error = '';
    this.storyText = '';
    this.moral = '';
    this.themes = [];
    this.proverbMatch = null;
    this.facts = null;
    this.sourceText = '';
    this.audioSrc = '';
    this.subtitles = [];
    this.realtimeReading = false;
    this.stopRealtimeNarration();

    if (!this.inputValue) {
      this.error = 'Please add a URL or paste text.';
      return;
    }

    const trimmedInput = this.inputValue.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(trimmedInput);

    this.loading = true;
    this.startDrum();

    this.api.createRequest({
      input_url: isUrl ? trimmedInput : undefined,
      input_text: isUrl ? undefined : trimmedInput,
      tone: this.tone
    }).subscribe({
      next: (response) => {
        this.requestId = response.id;
        this.status = 'queued';
        this.pollStatus();
      },
      error: (err) => {
        this.loading = false;
        this.stopDrum();
        this.error = err?.error?.error || err.message || 'Failed to create request.';
      }
    });
  }

  runTtsTest(): void {
    this.ttsTestError = '';
    this.ttsTestAudio = '';
    this.ttsTestLoading = true;
    this.api.testTts().subscribe({
      next: (response) => {
        this.ttsTestAudio = this.buildAudioSrc(
          response.audio_url,
          response.audio_data,
          response.audio_format
        );
        this.ttsTestLoading = false;
      },
      error: (err) => {
        this.ttsTestError = err?.error?.error || err.message || 'TTS test failed.';
        this.ttsTestLoading = false;
      }
    });
  }

  get activeToneLabel(): string {
    return this.tones.find((option) => option.value === this.tone)?.label || '';
  }

  loadModels(): void {
    this.modelsError = '';
    this.api.listModels().subscribe({
      next: (response) => {
        this.models = response.models || [];
      },
      error: (err) => {
        this.modelsError = err?.error?.error || err.message || 'Failed to load models.';
      }
    });
  }

  private pollStatus(): void {
    this.statusSub?.unsubscribe();
    this.statusSub = interval(2000)
      .pipe(switchMap(() => this.api.getStatus(this.requestId)))
      .subscribe({
        next: (response) => {
          this.status = response.status;
          if (response.status === 'failed') {
            this.loading = false;
            this.stopDrum();
            this.error = response.error || 'Processing failed.';
            this.statusSub?.unsubscribe();
          }
          if (response.status === 'completed') {
            this.statusSub?.unsubscribe();
            this.fetchResult();
          }
        },
        error: (err) => {
          this.loading = false;
          this.stopDrum();
          this.error = err.message || 'Failed to fetch status.';
          this.statusSub?.unsubscribe();
        }
      });
  }

  private fetchResult(): void {
    this.apollo
      .query<StoryRequestResponse>({
        query: GET_STORY_REQUEST,
        variables: { id: this.requestId },
        fetchPolicy: 'network-only'
      })
      .subscribe({
        next: ({ data }) => {
          const result = data.storyRequest;
          if (!result) {
            this.loading = false;
            this.stopDrum();
            this.error = 'Result not found.';
            return;
          }
          this.storyText = result.storyText || '';
          this.moral = result.moral || '';
          this.themes = this.parseJson(result.themes) || [];
          this.proverbMatch = this.parseJson(result.proverbs);
          this.facts = this.parseJson(result.extractedData);
          this.sourceText = result.sourceText || '';
          this.audioSrc = '';
          this.subtitles = this.parseJson(result.subtitles) || [];
          this.audioLoading = false;
          this.loading = false;
          this.stopDrum();
        },
        error: (err) => {
          this.loading = false;
          this.stopDrum();
          this.error = err.message || 'Failed to fetch result.';
        }
      });
  }

  private startDrum(): void {
    if (this.drumAudio) {
      return;
    }
    const track = this.randomTrack();
    this.drumAudio = new Audio(track);
    this.drumAudio.loop = true;
    this.drumAudio.volume = 0.35;
    this.drumAudio.play().catch(() => {
      this.stopDrum();
    });
  }

  private stopDrum(): void {
    if (this.drumAudio) {
      this.drumAudio.pause();
      this.drumAudio.currentTime = 0;
      this.drumAudio = null;
    }
  }

  private randomTrack(): string {
    const index = Math.floor(Math.random() * this.drumTracks.length);
    return this.drumTracks[index];
  }

  private requestNarration(text: string): void {
    const script = this.buildNarrationScript(text);
    if (!script) {
      this.audioLoading = false;
      this.loading = false;
      this.stopDrum();
      return;
    }

    this.audioLoading = true;
    this.api.synthesizeAudio(this.requestId, { text: script, tone: this.tone }).subscribe({
      next: (response) => {
        this.audioSrc = this.buildAudioSrc(response.audio_url, '', response.audio_format);
        this.audioLoading = false;
        this.loading = false;
        this.stopDrum();
      },
      error: (err) => {
        this.audioLoading = false;
        this.loading = false;
        this.stopDrum();
        this.error = err?.error?.error || err.message || 'Failed to generate narration.';
      }
    });
  }

  async startRealtimeNarration(): Promise<void> {
    const script = this.buildNarrationScript(this.storyText);
    if (!script || this.realtimeReading) {
      return;
    }

    this.error = '';
    this.stopRealtimeNarration();
    this.realtimeReading = true;
    this.startAmbientBackdrop();
    const chunks = this.buildRealtimeChunks(script, 1);

    try {
      for (const chunk of chunks) {
        if (!this.realtimeReading) {
          break;
        }
        const response = await this.api.realtimeTts({ text: chunk, tone: this.tone }).toPromise();
        if (!response?.audio_data || !response?.audio_format) {
          continue;
        }
        await this.playRealtimeChunk(`data:${response.audio_format};base64,${response.audio_data}`);
      }
    } catch (err: any) {
      this.error = err?.error?.error || err?.message || 'Realtime narration failed.';
    } finally {
      this.realtimeReading = false;
      this.stopRealtimeNarration();
    }
  }

  stopRealtimeNarration(): void {
    this.realtimeReading = false;
    if (this.realtimeAudioEl) {
      this.realtimeAudioEl.pause();
      this.realtimeAudioEl.currentTime = 0;
      this.realtimeAudioEl.src = '';
      this.realtimeAudioEl = null;
    }
    this.stopAmbientBackdrop();
  }

  private startAmbientBackdrop(): void {
    if (this.ambientAudioEl) {
      return;
    }
    const track = 'assets/drums/ethnicsoundscapes-djembe-beat-4-slow-pace-323061.mp3';
    this.ambientAudioEl = new Audio(track);
    this.ambientAudioEl.loop = true;
    this.ambientAudioEl.volume = 0.12;
    this.ambientAudioEl.play().catch(() => {
      this.stopAmbientBackdrop();
    });
  }

  private stopAmbientBackdrop(): void {
    if (this.ambientAudioEl) {
      this.ambientAudioEl.pause();
      this.ambientAudioEl.currentTime = 0;
      this.ambientAudioEl = null;
    }
  }

  private buildRealtimeChunks(text: string, sentenceBatchSize: number): string[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!sentences.length) {
      return [text];
    }
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += sentenceBatchSize) {
      chunks.push(sentences.slice(i, i + sentenceBatchSize).join(' '));
    }
    return chunks;
  }

  private buildNarrationScript(story: string): string {
    const sections: string[] = [];
    const storyText = (story || '').trim();
    if (storyText) {
      sections.push(storyText);
    }

    const moralText = (this.moral || '').trim();
    if (moralText) {
      sections.push(`Moral. ${moralText}`);
    }

    const themeItems = (this.themes || []).map((t) => (t || '').trim()).filter(Boolean);
    if (themeItems.length) {
      sections.push(`Themes. ${themeItems.join(', ')}.`);
    }

    const bestProverb = (this.proverbMatch?.best?.text || '').trim();
    if (bestProverb) {
      sections.push(`Best fit proverb. ${bestProverb}`);
    }

    return sections.join('\n\n').trim();
  }

  private playRealtimeChunk(src: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(src);
      this.realtimeAudioEl = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  private buildAudioSrc(audioUrl: string, audioData: string, audioFormat: string) {
    if (audioUrl) {
      if (/^https?:\/\//i.test(audioUrl)) {
        return audioUrl;
      }
      return `${environment.apiBaseUrl}${audioUrl}`;
    }
    if (!audioData || !audioFormat) {
      return '';
    }
    return `data:${audioFormat};base64,${audioData}`;
  }

  private parseJson(value: any) {
    if (!value) {
      return null;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }
}
