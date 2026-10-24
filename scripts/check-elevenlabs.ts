/** Live provider check using synthetic speech and an in-memory demo day. Never records a microphone. */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../server/config.js';
import { freshWorkspace } from '../src/state.js';
import { describeDay, executeVoiceReplan } from '../src/voice-tools.js';

const base = process.argv[2] || 'http://localhost:3012';
const message =
  'Mein Zug ist verspätet. Ich bin erst ab 14 Uhr verfügbar. Bitte plane meinen Tag um.';
assert.ok(config.elevenLabsApiKey, 'ElevenLabs key required');
const headers = { 'xi-api-key': config.elevenLabsApiKey };
const audioResponse = await fetch(
  'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=pcm_16000',
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message, model_id: 'eleven_flash_v2_5', language_code: 'de' }),
    signal: AbortSignal.timeout(20000),
  },
);
assert.equal(audioResponse.status, 200, `Synthetic speech HTTP ${audioResponse.status}`);
const audio = Buffer.from(await audioResponse.arrayBuffer());
const sessionResponse = await fetch(`${base}/api/voice/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin },
  body: '{}',
});
assert.equal(sessionResponse.status, 200);
const { signedUrl } = await sessionResponse.json();
let workspace = freshWorkspace();
let transcribed = false;
let applied = false;
let explanation = false;
let audioAfterApply = 0;
let started = false;
let completed = false;
const socket = new WebSocket(signedUrl, ['convai']);
const send = (value: unknown) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
};
const finished = new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error('Voice test timed out'));
  }, 100000);
  const fail = (error: unknown) => {
    clearTimeout(timeout);
    socket.close();
    reject(error);
  };
  socket.onopen = () => send({ type: 'conversation_initiation_client_data' });
  socket.onerror = () => fail(new Error('ElevenLabs WebSocket failed'));
  socket.onclose = (event) => {
    clearTimeout(timeout);
    if (!completed) reject(new Error(`Voice disconnected (${event.code}): ${event.reason}`));
  };
  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(String(event.data));
      if (data.type === 'ping') send({ type: 'pong', event_id: data.ping_event.event_id });
      if (data.type === 'agent_response') {
        console.log(JSON.stringify({ agent: data.agent_response_event.agent_response }));
        if (applied) explanation = true;
      }
      if (data.type === 'audio' && applied) audioAfterApply++;
      if (applied && explanation && audioAfterApply > 0) {
        assert.equal(workspace.plan.availableFrom, 840);
        assert.equal(workspace.history.length, 1);
        assert.equal(transcribed, true);
        completed = true;
        clearTimeout(timeout);
        socket.close(1000, 'synthetic test complete');
        resolve();
      }
      if (data.type === 'user_transcript') {
        transcribed = true;
        console.log(JSON.stringify({ transcript: data.user_transcription_event.user_transcript }));
      }
      if (data.type === 'conversation_initiation_metadata' && !started) {
        started = true;
        await delay(4500);
        for (let offset = 0; offset < audio.length + 32000 * 3; offset += 3200) {
          if (socket.readyState !== WebSocket.OPEN) return;
          send({
            user_audio_chunk: (offset < audio.length
              ? audio.subarray(offset, offset + 3200)
              : Buffer.alloc(3200)
            ).toString('base64'),
          });
          await delay(100);
        }
      }
      if (data.type === 'client_tool_call') {
        const call = data.client_tool_call;
        console.log(JSON.stringify({ tool: call.tool_name }));
        let result: unknown;
        if (call.tool_name === 'get_day_plan') result = describeDay(workspace);
        else if (call.tool_name === 'replan_day') {
          result = await executeVoiceReplan(call.parameters.message, {
            read: () => workspace,
            request: async (source, text) => {
              const response = await fetch(`${base}/api/replan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin },
                body: JSON.stringify({ plan: source.plan, checkIn: source.checkIn, message: text }),
                signal: AbortSignal.timeout(65000),
              });
              if (!response.ok) throw new Error(`Planner HTTP ${response.status}`);
              return response.json();
            },
            commit: (next) => {
              workspace = next;
              applied = true;
            },
            showResult: () => {},
            signal: new AbortController().signal,
          });
          console.log(
            JSON.stringify({
              status: (result as { status: string }).status,
              availableFrom: workspace.plan.availableFrom,
            }),
          );
        } else throw new Error(`Unexpected tool ${call.tool_name}`);
        send({
          type: 'client_tool_result',
          tool_call_id: call.tool_call_id,
          result: JSON.stringify(result),
          is_error: false,
        });
      }
    } catch (error) {
      fail(error);
    }
  };
});
await finished;
console.log(JSON.stringify({ passed: true, transcribed, applied, explanation, audioAfterApply }));
