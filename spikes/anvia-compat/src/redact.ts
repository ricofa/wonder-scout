/**
 * Removes credentials from any text before it is logged or recorded.
 * Redacts the configured key verbatim plus common bearer/sk- token shapes.
 */
export function redact(text: string, secrets: readonly (string | undefined)[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret !== undefined && secret.length >= 6) out = out.split(secret).join('[REDACTED]');
  }
  return out
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{6,}/gi, '$1[REDACTED]');
}
