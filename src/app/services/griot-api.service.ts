import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

interface CreateRequestResponse {
  id: string;
}

interface StatusResponse {
  id: string;
  status: string;
  error?: string;
  story_text?: string;
  moral?: string;
  audio_url?: string;
  audio_path?: string;
  audio_format?: string;
  has_audio?: boolean;
}

interface ModelListResponse {
  models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>;
}

interface TtsTestResponse {
  audio_url: string;
  audio_data: string;
  audio_format: string;
}

interface SynthesizeAudioResponse {
  id: string;
  status: string;
  tone: string;
  audio_url: string;
  audio_path: string;
  audio_format: string;
  has_audio: boolean;
}

interface RealtimeTtsResponse {
  audio_data: string;
  audio_format: string;
}

@Injectable({
  providedIn: 'root'
})
export class GriotApiService {
  constructor(private http: HttpClient) {}

  createRequest(payload: { input_url?: string; input_text?: string; tone: string }) {
    return this.http.post<CreateRequestResponse>(
      `${environment.apiBaseUrl}/api/requests/`,
      payload
    );
  }

  getStatus(id: string) {
    return this.http.get<StatusResponse>(
      `${environment.apiBaseUrl}/api/requests/${id}/`
    );
  }

  synthesizeAudio(id: string, payload: { text?: string; tone?: string }) {
    return this.http.post<SynthesizeAudioResponse>(
      `${environment.apiBaseUrl}/api/requests/${id}/synthesize-audio/`,
      payload
    );
  }

  realtimeTts(payload: { text: string; tone?: string }) {
    return this.http.post<RealtimeTtsResponse>(
      `${environment.apiBaseUrl}/api/tts-realtime/`,
      payload
    );
  }

  listModels() {
    return this.http.get<ModelListResponse>(
      `${environment.apiBaseUrl}/api/models/`
    );
  }

  testTts() {
    return this.http.post<TtsTestResponse>(
      `${environment.apiBaseUrl}/api/tts-test/`,
      {}
    );
  }
}
