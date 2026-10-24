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
  if (!imageTypeSchema.safeParse(type).success) throw new Error('Use a PNG, JPEG, or WebP image.');
  if (!file.size) throw new Error('The selected file is empty. Choose another image.');
  if (file.size > 20 * 1024 * 1024)
    throw new Error('The image is larger than 20 MB. Choose a smaller section.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't open the image. Use a valid PNG, JPEG, or WebP.");
  }
  try {
    signal.throwIfAborted();
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('The image resolution is too high. Choose a smaller section.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Your browser couldn't prepare the image.");
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
    throw new Error('The image is still too large after resizing. Choose a smaller section.');
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
    throw new Error('The connection was interrupted. Check your network and try again.');
  }
  const body = await result.json().catch(() => null);
  signal.throwIfAborted();
  if (!result.ok) {
    const fallback =
      result.status === 413
        ? 'The image is too large. Choose a smaller section.'
        : result.status === 504
          ? 'Reading took too long. Try again.'
          : "Couldn't read the image right now. Try again.";
    throw new Error(typeof body?.error === 'string' ? body.error : fallback);
  }
  const extracted = extractResponseSchema.safeParse(body);
  if (!extracted.success)
    throw new Error("Image recognition didn't return a valid response. Try again.");
  return extracted.data;
}
