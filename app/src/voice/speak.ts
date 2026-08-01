/**
 * The agent's voice — Deepgram Aura text-to-speech.
 *
 * This is what turns the check-in from a form that displays questions into a
 * call that asks them. The patient hears a voice; they never read the script.
 *
 * Speech and recording are strictly sequential: we finish speaking before the
 * microphone opens, or the recording captures the agent's own voice and
 * Deepgram transcribes the question back to us as the answer.
 */

const SPEAK_URL = 'https://api.deepgram.com/v1/speak';
const VOICE = 'aura-2-thalia-en';

/** Synthesised audio, cached so repeated prompts don't re-hit the API. */
const cache = new Map<string, string>();

async function synthesise(text: string, apiKey: string): Promise<string> {
  const cached = cache.get(text);
  if (cached) {
    return cached;
  }

  const response = await fetch(`${SPEAK_URL}?model=${VOICE}&encoding=mp3`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram speak returned ${response.status}: ${await response.text()}`);
  }

  const url = URL.createObjectURL(await response.blob());
  cache.set(text, url);
  return url;
}

/**
 * Say something and resolve once it has finished playing.
 *
 * Never throws. A failed or blocked TTS call must not stop the check-in — the
 * prompt is on screen either way, so the worst case is a silent question rather
 * than a broken demo.
 *
 * @param text - what to say
 * @param apiKey - Deepgram API key
 */
export async function speak(text: string, apiKey: string): Promise<void> {
  if (!apiKey) {
    return;
  }

  try {
    const audio = new Audio(await synthesise(text, apiKey));
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } catch (error) {
    console.warn('[Deepgram] speech synthesis unavailable, continuing silently', error);
  }
}

/** Warm the cache so the first question doesn't lag behind the ring. */
export function preloadSpeech(lines: string[], apiKey: string): void {
  if (!apiKey) {
    return;
  }
  for (const line of lines) {
    void synthesise(line, apiKey).catch(() => undefined);
  }
}

/** What the patient hears when they pick up. */
export const CALL_GREETING =
  'Hello, this is Sentinel calling from your care team. I have a few short questions about how you are feeling today.';
