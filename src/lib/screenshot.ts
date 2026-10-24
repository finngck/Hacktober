import {
  extractResponseSchema,
  imageTypeSchema,
  MAX_IMAGE_BASE64_LENGTH,
  type ExtractRequest,
} from '../../shared/contracts';

/** Keep text sharp where possible, and bound the encoded request before uploading. */
export async function prepareScreenshot(file: File, signal: AbortSignal): Promise<ExtractRequest> {
  const type =
    file.type ||
    ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as const)[
      file.name.split('.').pop()?.toLowerCase() as 'png' | 'jpg' | 'jpeg' | 'webp'
    ];
  if (!imageTypeSchema.safeParse(type).success)
    throw new Error('Nutze ein Bild im Format PNG, JPEG oder WebP.');
  if (!file.size) throw new Error('Die ausgewählte Datei ist leer. Wähle ein anderes Bild.');
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Das Bild ist größer als 20 MB. Wähle einen kleineren Ausschnitt.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      'Das Bild konnte nicht geöffnet werden. Nutze ein gültiges PNG, JPEG oder WebP.',
    );
  }
  try {
    signal.throwIfAborted();
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('Die Bildauflösung ist zu groß. Wähle einen kleineren Ausschnitt.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Dein Browser konnte das Bild nicht vorbereiten.');
    for (const edge of [2400, 1600, 1200]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      // JPEG otherwise composites transparent pixels onto black, hiding dark text.
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const mimeType of ['image/png', 'image/jpeg'] as const) {
        signal.throwIfAborted();
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        const image = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (image && image.length <= MAX_IMAGE_BASE64_LENGTH) return { image, mimeType };
      }
    }
    throw new Error('Das Bild ist auch verkleinert zu groß. Wähle einen kleineren Ausschnitt.');
  } finally {
    bitmap.close();
  }
}

export async function readScreenshot(file: File, signal: AbortSignal) {
  const payload = await prepareScreenshot(file, signal);
  signal.throwIfAborted();
  let result: Response;
  try {
    result = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload),
    });
  } catch {
    signal.throwIfAborted();
    throw new Error('Die Verbindung wurde unterbrochen. Prüfe dein Netz und versuche es erneut.');
  }
  const body = await result.json().catch(() => null);
  signal.throwIfAborted();
  if (!result.ok) {
    const fallback =
      result.status === 413
        ? 'Das Bild ist zu groß. Wähle einen kleineren Ausschnitt.'
        : result.status === 504
          ? 'Das Lesen hat zu lange gedauert. Versuche es erneut.'
          : 'Das Bild konnte gerade nicht gelesen werden. Versuche es erneut.';
    throw new Error(typeof body?.error === 'string' ? body.error : fallback);
  }
  const extracted = extractResponseSchema.safeParse(body);
  if (!extracted.success)
    throw new Error('Die Bilderkennung hat keine gültige Antwort geliefert. Versuche es erneut.');
  return extracted.data;
}
