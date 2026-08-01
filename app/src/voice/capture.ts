/**
 * Browser microphone capture -> Deepgram.
 *
 * WHY PRE-RECORDED AND NOT LIVE STREAMING
 * ---------------------------------------
 * This records a short clip and posts it to Deepgram's pre-recorded endpoint
 * rather than streaming over a WebSocket. Three reasons, in order of weight:
 *
 *   1. `@deepgram/sdk` is not installed, and CLAUDE.md rules out npm install at
 *      the venue. (Live streaming is achievable with no SDK — Deepgram's live
 *      endpoint takes the key as a WebSocket subprotocol — so this is the
 *      weakest of the three reasons, but it is real.)
 *   2. A clip survives a loud room and flaky wifi. A dropped socket mid-answer
 *      loses the whole check-in.
 *   3. It looks identical on stage.
 *
 * SPEC.md §6 and the build prompt both pre-authorise this trade. If live
 * streaming is wanted later, the swap is contained entirely in this file:
 * open `wss://api.deepgram.com/v1/listen` with `['token', apiKey]` as the
 * subprotocol and forward each MediaRecorder chunk to it.
 *
 * The API key is browser-exposed. Fine for a hackathon demo, per CLAUDE.md —
 * don't ship it.
 */

/** Word-level timing. Deepgram returns this for free; the speech-latency
 * stretch goal in SPEC.md §5 would build on it. */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

export interface TranscriptResult {
  transcript: string;
  confidence: number;
  words: TranscriptWord[];
  /** Audio length in seconds, per Deepgram. */
  durationSeconds: number;
}

export interface Recorder {
  /** Stop capture and hand back the recorded audio. */
  stop: () => Promise<Blob>;
  /** Abandon the recording and release the microphone. */
  cancel: () => void;
}

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';

/** Safari won't do webm; Chrome and Firefox won't do mp4. Take what we get. */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isMicrophoneSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;
}

/**
 * Start recording from the default microphone.
 *
 * Throws if the user denies permission — the caller should surface that rather
 * than retrying, since a denied prompt won't reappear on its own.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start();

  const releaseMicrophone = (): void => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => {
          releaseMicrophone();
          reject(new Error('Recording failed'));
        };
        recorder.onstop = () => {
          releaseMicrophone();
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      releaseMicrophone();
    },
  };
}

/**
 * Send recorded audio to Deepgram and get the transcript back.
 *
 * @param audio - the recorded clip
 * @param apiKey - Deepgram API key
 */
export async function transcribeAudio(audio: Blob, apiKey: string): Promise<TranscriptResult> {
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not set — check .env and restart vite.');
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    // Patients pause, restart sentences and trail off. Filler words are part of
    // how someone sounds when they're unwell, so keep them.
    filler_words: 'true',
  });

  const response = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': audio.type || 'audio/webm',
    },
    body: audio,
  });

  if (!response.ok) {
    throw new Error(`Deepgram returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();

  // Log the raw response: the transcript is the thing a clinician audits, and
  // during the build it's the fastest way to see what Deepgram actually heard.
  console.log('[Deepgram] raw response', body);

  const alternative = body?.results?.channels?.[0]?.alternatives?.[0];
  if (!alternative) {
    throw new Error('Deepgram returned no transcription alternatives');
  }

  const result: TranscriptResult = {
    transcript: alternative.transcript ?? '',
    confidence: alternative.confidence ?? 0,
    words: alternative.words ?? [],
    durationSeconds: body?.metadata?.duration ?? 0,
  };

  console.log('[Deepgram] transcript:', result.transcript);
  return result;
}

/** The Deepgram key, as exposed to the browser by vite. */
export function getDeepgramApiKey(): string {
  return import.meta.env.DEEPGRAM_API_KEY ?? '';
}
