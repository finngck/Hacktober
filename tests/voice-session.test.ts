import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForVoice, voiceErrorMessage } from '../src/lib/voice-session';

test('cancelled microphone permission is released even when the user accepts it later', async () => {
  let grant!: (value: { stop: () => void }) => void;
  let stopped = false;
  const controller = new AbortController();
  const pending = waitForVoice(
    new Promise<{ stop: () => void }>((resolve) => {
      grant = resolve;
    }),
    controller.signal,
    (stream) => stream.stop(),
  );
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  grant({
    stop: () => {
      stopped = true;
    },
  });
  await Promise.resolve();
  assert.equal(stopped, true);
});

test('a late SDK session is ended after timeout; a successful session remains usable', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('Timed out', 'TimeoutError'));
  let ended = false;
  await assert.rejects(
    waitForVoice(Promise.resolve('session'), controller.signal, () => {
      ended = true;
    }),
    { name: 'TimeoutError' },
  );
  assert.equal(ended, true);
  assert.equal(
    await waitForVoice(Promise.resolve('connected'), new AbortController().signal),
    'connected',
  );
});

test('microphone failures have actionable messages rather than a generic network error', () => {
  assert.match(voiceErrorMessage(new DOMException('', 'NotAllowedError')), /website settings/);
  assert.match(voiceErrorMessage(new DOMException('', 'NotFoundError')), /No microphone/);
  assert.match(voiceErrorMessage(new DOMException('', 'NotReadableError')), /another app/);
  assert.match(voiceErrorMessage(new DOMException('', 'TimeoutError')), /took too long/);
});
