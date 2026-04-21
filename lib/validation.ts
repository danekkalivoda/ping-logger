const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60000;

export function normalizeUrlInput(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return '';
  }

  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

export function validatePingInputs(urlInput: string, intervalInput: string) {
  const normalizedUrl = normalizeUrlInput(urlInput);

  if (!normalizedUrl) {
    return { ok: false as const, error: 'Enter a URL before starting a session.' };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        ok: false as const,
        error: 'Only http:// and https:// targets are supported in the MVP.',
      };
    }
  } catch {
    return { ok: false as const, error: 'The URL format is invalid.' };
  }

  const numericInterval = Number(intervalInput || DEFAULT_INTERVAL_MS);

  if (!Number.isFinite(numericInterval)) {
    return { ok: false as const, error: 'Interval must be a numeric value in milliseconds.' };
  }

  const intervalMs = Math.min(
    MAX_INTERVAL_MS,
    Math.max(MIN_INTERVAL_MS, Math.round(numericInterval)),
  );

  return {
    ok: true as const,
    value: {
      normalizedUrl,
      intervalMs,
    },
  };
}
