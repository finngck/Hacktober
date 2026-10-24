/** A cancelled permission prompt/session must never start a later, invisible conversation. */
export function waitForVoice<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  dispose: (value: T) => void = () => {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Abgebrochen', 'AbortError'));
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
    return 'Der Mikrofonzugriff ist blockiert. Erlaube das Mikrofon in den Website-Einstellungen deines Browsers und starte erneut.';
  if (/NotFound|DevicesNotFound/i.test(detail))
    return 'Kein Mikrofon gefunden. Verbinde ein Mikrofon und starte das Gespräch erneut.';
  if (/NotReadable|TrackStart/i.test(detail))
    return 'Das Mikrofon ist gerade nicht verfügbar. Prüfe, ob eine andere App es verwendet.';
  if (/MIC_UNAVAILABLE/i.test(detail))
    return 'Dieser Browser bietet hier keinen Mikrofonzugriff. Öffne Pivot direkt in Safari, Chrome oder Edge über HTTPS oder localhost.';
  if (/Timeout|timed out/i.test(detail))
    return 'Der Sprachstart dauert zu lange. Prüfe die Mikrofonfreigabe und deine Verbindung und versuche es erneut.';
  return 'Die Sprachverbindung wurde unterbrochen. Prüfe deine Verbindung und starte das Gespräch erneut.';
}
