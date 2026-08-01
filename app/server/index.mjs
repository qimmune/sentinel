/**
 * Sentinel telephony server — Twilio ⇄ Deepgram ⇄ Medplum.
 *
 *   phone call → ask questions → record in Medplum → dashboard updates
 *
 * ⚠️ UNTESTED END TO END. Written without a Twilio account or a public URL, so
 * no call has ever been placed through it. The Deepgram and Medplum halves are
 * the same code paths the app uses in anger; the Twilio half is not.
 *
 * WHY <Record> AND NOT MEDIA STREAMS
 * ----------------------------------
 * Twilio can stream live audio over a WebSocket, but our check-in is a sequence
 * of closed questions with short answers. Recording each answer and posting it
 * to Deepgram's pre-recorded endpoint is dramatically simpler, has no socket
 * lifecycle to fail mid-call, and — the part that matters — is the identical
 * transcription path the browser already uses. One fewer thing that can behave
 * differently on the phone than in testing.
 *
 * THE RULE THIS FILE EXISTS TO PROTECT
 * ------------------------------------
 * It owns no clinical logic. The questions, the scoring, the triage and the
 * FHIR writing all come from ../dist/core/core.js, which is built from the same
 * source the app and the tests use. This file moves audio around and nothing
 * else.
 */

import { createServer } from 'node:http';
import { MedplumClient } from '@medplum/core';
import {
  CALL_GREETING,
  CHECK_IN_SCRIPT,
  RECORDED_STEPS,
  SENTINEL_IDENTIFIER_SYSTEM,
  buildCheckInResponse,
  extractFeatures,
  getPatientCity,
  getPatientName,
  runAgentForPatient,
} from '../dist/core/core.js';

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID;
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/** Twilio API keys authenticate as SK.../secret against the AC... account. */
const twilioAuth = 'Basic ' + Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');

/** In-flight calls, keyed by Twilio CallSid. */
const sessions = new Map();

const intro = CHECK_IN_SCRIPT.find((step) => step.kind === 'statement');

// ---------------------------------------------------------------------------
// Medplum
// ---------------------------------------------------------------------------

let medplumPromise;

/**
 * A server cannot use the app's email/password sign-in, so this needs a
 * ClientApplication (Medplum → Project Admin → Client Applications).
 */
function medplum() {
  medplumPromise ??= (async () => {
    const client = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/' });
    await client.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
    return client;
  })();
  return medplumPromise;
}

// ---------------------------------------------------------------------------
// TwiML
// ---------------------------------------------------------------------------

function xmlEscape(text) {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

/** Deepgram Aura speaks every prompt, so the phone voice matches the app's. */
function play(text) {
  return `<Play>${xmlEscape(`${PUBLIC_URL}/tts?text=${encodeURIComponent(text)}`)}</Play>`;
}

function twiml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`;
}

/**
 * Ask question N and record the answer.
 *
 * `playBeep` matters: without an audible cue people talk over the prompt and
 * the first second of the answer is lost. `trim` off, because a patient who
 * says nothing is a finding we need to see rather than an empty file.
 */
function askStep(index) {
  const step = RECORDED_STEPS[index];
  if (!step) {
    return twiml(`<Redirect method="POST">${PUBLIC_URL}/finish</Redirect>`);
  }
  return twiml(
    play(step.prompt) +
      `<Record action="${PUBLIC_URL}/answer?i=${index}" method="POST" maxLength="12" timeout="4" playBeep="true" trim="do-not-trim" />` +
      // Reached only if <Record> times out with no audio at all.
      `<Redirect method="POST">${PUBLIC_URL}/answer?i=${index}</Redirect>`
  );
}

// ---------------------------------------------------------------------------
// Deepgram
// ---------------------------------------------------------------------------

async function synthesise(text) {
  const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3', {
    method: 'POST',
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Deepgram speak ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function transcribe(audio, contentType) {
  const params = new URLSearchParams({ model: 'nova-2', smart_format: 'true', punctuate: 'true' });
  const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': contentType },
    body: audio,
  });
  if (!response.ok) {
    throw new Error(`Deepgram listen ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  return body?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

/**
 * Twilio's recording is not always readable the instant the action callback
 * fires. Retry briefly rather than losing the answer.
 */
async function fetchRecording(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${url}.mp3`, { headers: { Authorization: twilioAuth } });
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(`Could not fetch recording ${url}`);
}

// ---------------------------------------------------------------------------
// Placing the call
// ---------------------------------------------------------------------------

async function placeCall({ patientId, toNumber, reason }) {
  const client = await medplum();
  const patient = await client.readResource('Patient', patientId);

  const form = new URLSearchParams({
    To: toNumber,
    From: TWILIO_FROM_NUMBER,
    Url: `${PUBLIC_URL}/twiml`,
    Method: 'POST',
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  const call = await response.json();
  if (!response.ok) {
    throw new Error(`Twilio ${response.status}: ${call.message ?? JSON.stringify(call)}`);
  }

  sessions.set(call.sid, { patientId, patient, reason, answers: [] });
  console.log(`[call ${call.sid}] dialling ${toNumber} for ${getPatientName(patient)}`);
  return { callId: call.sid, status: call.status };
}

// ---------------------------------------------------------------------------
// Finish: score, write, escalate
// ---------------------------------------------------------------------------

async function finishCall(callSid) {
  const session = sessions.get(callSid);
  if (!session) {
    return 'No session for this call.';
  }

  const client = await medplum();
  const { patient, answers } = session;

  // Same scoring the browser runs. No phone-specific clinical logic, ever.
  const { features } = extractFeatures(answers, { now: new Date(), expectedCity: getPatientCity(patient) });

  const transcript = answers
    .map(({ stepId, transcript: text }) => {
      const prompt = RECORDED_STEPS.find((step) => step.id === stepId)?.prompt ?? stepId;
      return `Q: ${prompt}\nA: ${text || '(no answer)'}`;
    })
    .join('\n\n');

  const response = buildCheckInResponse(
    { reference: `Patient/${patient.id}` },
    features,
    new Date().toISOString(),
    transcript
  );
  await client.createResource({
    ...response,
    identifier: { system: SENTINEL_IDENTIFIER_SYSTEM, value: `phone-checkin-${callSid}` },
  });

  // The agent re-triages and raises RiskAssessment / Flag / Task as needed —
  // which is what makes the physician dashboard change.
  const outcome = await runAgentForPatient(client, patient);
  console.log(`[call ${callSid}] ${outcome.name}: ${outcome.previousTier ?? 'new'} -> ${outcome.tier}`);

  sessions.delete(callSid);
  return outcome.tier;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, type, payload) => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(payload);
  };

  try {
    // Twilio fetches this for every <Play>.
    if (url.pathname === '/tts') {
      return send(200, 'audio/mpeg', await synthesise(url.searchParams.get('text') ?? ''));
    }

    if (url.pathname === '/health') {
      return send(200, 'application/json', JSON.stringify({ ok: true, activeCalls: sessions.size }));
    }

    // Kick off a call. Called by hand, or by the agent on vitals drift.
    if (url.pathname === '/call' && req.method === 'POST') {
      const result = await placeCall(JSON.parse(await body(req)));
      return send(200, 'application/json', JSON.stringify(result));
    }

    const form = new URLSearchParams(await body(req));
    const callSid = form.get('CallSid');

    // The call connected: greet, hand over the recall words, ask question one.
    if (url.pathname === '/twiml') {
      return send(
        200,
        'text/xml',
        twiml(
          play(CALL_GREETING) +
            (intro ? play(intro.prompt) : '') +
            `<Redirect method="POST">${PUBLIC_URL}/ask?i=0</Redirect>`
        )
      );
    }

    if (url.pathname === '/ask') {
      return send(200, 'text/xml', askStep(Number(url.searchParams.get('i') ?? 0)));
    }

    // An answer came back. Transcribe it, store it, move on.
    if (url.pathname === '/answer') {
      const index = Number(url.searchParams.get('i') ?? 0);
      const session = sessions.get(callSid);
      const recordingUrl = form.get('RecordingUrl');

      if (session) {
        let text = '';
        if (recordingUrl) {
          try {
            text = await transcribe(await fetchRecording(recordingUrl), 'audio/mpeg');
          } catch (error) {
            // A lost answer is 'unknown', never a denial. Keep the call going.
            console.error(`[call ${callSid}] q${index} transcription failed:`, error.message);
          }
        }
        session.answers.push({ stepId: RECORDED_STEPS[index].id, transcript: text });
        console.log(`[call ${callSid}] q${index} (${RECORDED_STEPS[index].id}): "${text}"`);
      }

      return send(200, 'text/xml', askStep(index + 1));
    }

    if (url.pathname === '/finish') {
      const tier = await finishCall(callSid);
      return send(
        200,
        'text/xml',
        twiml(play('Thank you. Your care team has been updated. Goodbye.') + '<Hangup/>')
      );
    }

    send(404, 'text/plain', 'Not found');
  } catch (error) {
    console.error('[server]', error);
    // Say something human rather than dropping the line on a patient.
    if (url.pathname.startsWith('/ask') || url.pathname.startsWith('/answer') || url.pathname === '/twiml') {
      return send(200, 'text/xml', twiml('<Say>Sorry, something went wrong. Your care team will call you back.</Say><Hangup/>'));
    }
    send(500, 'application/json', JSON.stringify({ error: String(error.message ?? error) }));
  }
});

server.listen(PORT, () => {
  console.log(`Sentinel telephony on :${PORT}`);
  for (const [name, value] of Object.entries({
    PUBLIC_URL,
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_FROM_NUMBER,
    DEEPGRAM_API_KEY,
    MEDPLUM_CLIENT_ID: process.env.MEDPLUM_CLIENT_ID,
  })) {
    if (!value) {
      console.warn(`  missing ${name} — see server/README.md`);
    }
  }
});
