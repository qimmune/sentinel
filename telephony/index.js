/**
 * Sentinel telephony bridge — Twilio ⇄ Deepgram ⇄ Medplum.
 *
 * ⚠️ UNTESTED. Written without a Twilio account, a phone number, or a public
 * URL, so no part of this has ever run. It is a starting point that saves you
 * reading three sets of API docs — not working software. Expect to debug it.
 *
 * WHAT IT DOES
 *   1. POST /call        → places an outbound call to the patient
 *   2. POST /twiml       → Twilio fetches this; returns the call script
 *   3. WS   /media       → Twilio streams call audio here; we forward it to
 *                          Deepgram's live endpoint and collect transcripts
 *   4. POST /status      → on hangup, score the answers and write to Medplum
 *
 * WHAT YOU NEED BEFORE IT WORKS
 *   - A Twilio account + a voice-capable number. Trial accounts work, but can
 *     only call numbers you've verified — fine for a demo, verify Cameron's.
 *   - A public URL. `ngrok http 8080` is the fastest option.
 *   - A Medplum ClientApplication (client ID + secret). The React app uses
 *     email/password sign-in and has no client credentials; a server cannot use
 *     that flow. Create one at app.medplum.com → Project Admin → Client
 *     Applications.
 *   - The Deepgram key you already have.
 *
 * See README.md in this directory for the exact sequence.
 */

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import twilio from 'twilio';
import { MedplumClient } from '@medplum/core';

const PORT = process.env.PORT || 8080;
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://abc123.ngrok.io

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/** In-flight calls, keyed by Twilio CallSid. */
const calls = new Map();

// ---------------------------------------------------------------------------
// 1. Place the call
// ---------------------------------------------------------------------------

/**
 * Called by the agent when it decides to reach the patient.
 * Body: { patientId, toNumber, reason }
 */
async function placeCall(body) {
  const call = await twilioClient.calls.create({
    to: body.toNumber,
    from: process.env.TWILIO_FROM_NUMBER,
    url: `${PUBLIC_URL}/twiml`,
    statusCallback: `${PUBLIC_URL}/status`,
    statusCallbackEvent: ['completed'],
  });

  calls.set(call.sid, { patientId: body.patientId, reason: body.reason, answers: [], transcript: '' });
  return { callId: call.sid, status: 'ringing' };
}

// ---------------------------------------------------------------------------
// 2. The call script
// ---------------------------------------------------------------------------

/**
 * TwiML: greet, then open a bidirectional media stream.
 *
 * IMPORTANT: the spoken questions must come from the app's checkInScript.ts,
 * not be retyped here. If the spoken exam and the scored exam drift apart, the
 * ICE score stops meaning anything. Import it (or generate this from it) rather
 * than hardcoding — the placeholder below is deliberately minimal so nobody
 * mistakes it for the real script.
 */
function twiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello, this is Sentinel calling from your care team. I have a few short questions about how you are feeling. Please answer after each one.</Say>
  <Connect>
    <Stream url="${PUBLIC_URL.replace(/^https/, 'wss')}/media" />
  </Connect>
</Response>`;
}

// ---------------------------------------------------------------------------
// 3. Audio bridge: Twilio media stream → Deepgram live
// ---------------------------------------------------------------------------

/**
 * Twilio sends base64 μ-law, 8 kHz, mono. Deepgram accepts that natively if you
 * declare it — no transcoding needed, which is the whole reason this is only a
 * few lines. Getting `encoding` or `sample_rate` wrong yields silence with no
 * error, so check these first when it doesn't work.
 */
function openDeepgram(onTranscript) {
  const params = new URLSearchParams({
    model: 'nova-2',
    encoding: 'mulaw',
    sample_rate: '8000',
    channels: '1',
    punctuate: 'true',
    interim_results: 'false',
    endpointing: '800', // ms of silence before finalising an utterance
  });

  const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const text = message?.channel?.alternatives?.[0]?.transcript;
    if (message.is_final && text) {
      onTranscript(text);
    }
  });

  socket.on('error', (error) => console.error('[deepgram]', error));
  return socket;
}

function handleMediaSocket(ws) {
  let deepgram;
  let callSid;

  ws.on('message', (raw) => {
    const frame = JSON.parse(raw.toString());

    switch (frame.event) {
      case 'start':
        callSid = frame.start.callSid;
        deepgram = openDeepgram((text) => {
          const state = calls.get(callSid);
          if (state) {
            state.transcript += (state.transcript ? ' ' : '') + text;
            console.log(`[${callSid}] ${text}`);
          }
        });
        break;

      case 'media':
        if (deepgram?.readyState === WebSocket.OPEN) {
          deepgram.send(Buffer.from(frame.media.payload, 'base64'));
        }
        break;

      case 'stop':
        deepgram?.close();
        break;
    }
  });

  ws.on('close', () => deepgram?.close());
}

// ---------------------------------------------------------------------------
// 4. Hang up → score → write to Medplum
// ---------------------------------------------------------------------------

async function medplum() {
  const client = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await client.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
  return client;
}

/**
 * On hangup, turn the call transcript into a check-in and let the agent decide.
 *
 * THE BOUNDARY STILL HOLDS HERE. This writes what the patient said and runs the
 * same triage() the app runs. Telephony is a delivery mechanism; it must not
 * acquire any clinical logic of its own.
 *
 * The import below is the app's real code — build it with `npm run build:bot`
 * in ../app and point at the output, or wire this directory into the same
 * TypeScript build. Do NOT reimplement scoring here.
 */
async function finishCall(callSid) {
  const state = calls.get(callSid);
  if (!state) {
    return;
  }

  console.log(`[${callSid}] full transcript: ${state.transcript}`);

  // const { extractFeatures } = await import('../app/dist/bot/triageBot.js');
  // const { features } = extractFeatures(state.answers, { now: new Date() });
  // const client = await medplum();
  // await client.createResource(buildCheckInResponse(...));
  // await runAgentForPatient(client, await client.readResource('Patient', state.patientId));

  calls.delete(callSid);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/twiml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml());
    return;
  }

  if (pathname === '/call' && req.method === 'POST') {
    const result = await placeCall(JSON.parse(await readBody(req)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === '/status' && req.method === 'POST') {
    const params = new URLSearchParams(await readBody(req));
    await finishCall(params.get('CallSid'));
    res.writeHead(204).end();
    return;
  }

  res.writeHead(404).end();
});

new WebSocketServer({ server, path: '/media' }).on('connection', handleMediaSocket);

server.listen(PORT, () => {
  console.log(`Sentinel telephony bridge on :${PORT}`);
  if (!PUBLIC_URL) {
    console.warn('PUBLIC_URL is not set — Twilio cannot reach /twiml or /media.');
  }
});
