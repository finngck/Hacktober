/** A cancelled permission prompt/session must never start a later, invisible conversation. */
export function waitForVoice<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  dispose: (value: T) => void = () => {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Canceled', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) dispose(value);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

export function voiceErrorMessage(cause: unknown): string {
  const detail = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
  if (/NotAllowed|PermissionDenied|permission|denied/i.test(detail))
    return 'Microphone access is blocked. Allow the microphone in your browser website settings and try again.';
  if (/NotFound|DevicesNotFound/i.test(detail))
    return 'No microphone found. Connect a microphone and start the conversation again.';
  if (/NotReadable|TrackStart/i.test(detail))
    return 'The microphone is unavailable. Check whether another app is using it.';
  if (/MIC_UNAVAILABLE/i.test(detail))
    return 'This browser cannot access a microphone here. Open Pivot directly in Safari, Chrome or Edge over HTTPS or localhost.';
  if (/Timeout|timed out/i.test(detail))
    return 'Starting voice chat took too long. Check microphone permission and your connection, then try again.';
  return 'The voice connection was interrupted. Check your connection and start the conversation again.';
}
