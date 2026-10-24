export function isAllowedRequest(
  host: string | undefined,
  origin: string | undefined,
  allowedHosts: string[],
) {
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname;
    if (!allowedHosts.includes(hostname)) return false;
    if (origin) {
      const supplied = new URL(origin);
      if (supplied.host !== host || !['http:', 'https:'].includes(supplied.protocol)) return false;
      if (!['localhost', '127.0.0.1'].includes(hostname) && supplied.protocol !== 'https:')
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
