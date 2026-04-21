import type { SessionPingLine } from '@/lib/session-types';

const REQUEST_TIMEOUT_MS = 10_000;

function normalizeNetworkErrorMessage(error: unknown, didTimeout: boolean) {
  if (didTimeout) {
    return 'Network request timed out';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Network request failed';
}

export function startPingLoop({
  url,
  intervalMs,
  onPing,
  onFatalError,
  shouldContinue,
}: {
  url: string;
  intervalMs: number;
  onPing: (line: SessionPingLine) => Promise<void>;
  onFatalError: (message: string) => void;
  shouldContinue: () => boolean;
}) {
  let isStopped = false;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let activeAbortController: AbortController | null = null;

  const clearScheduledWork = () => {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  };

  const stop = () => {
    isStopped = true;
    clearScheduledWork();
  };

  const tick = async () => {
    if (isStopped || !shouldContinue()) {
      return;
    }

    const tickStartedAt = Date.now();
    const requestStartedAt = new Date().toISOString();
    const abortController = new AbortController();
    activeAbortController = abortController;
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);
    let line: SessionPingLine | null = null;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: abortController.signal,
      });
      const latencyMs = Date.now() - tickStartedAt;
      line = response.ok
        ? {
            type: 'ping',
            ts: requestStartedAt,
            status: response.status,
            latency_ms: latencyMs,
          }
        : {
            type: 'ping',
            ts: requestStartedAt,
            status: response.status,
            latency_ms: latencyMs,
            error: `HTTP ${response.status}`,
          };

    } catch (error) {
      if (isStopped || !shouldContinue()) {
        return;
      }

      const wasManualAbort = abortController.signal.aborted && !didTimeout;

      if (wasManualAbort) {
        return;
      }

      line = {
        type: 'ping',
        ts: requestStartedAt,
        status: 0,
        latency_ms: didTimeout ? REQUEST_TIMEOUT_MS : Date.now() - tickStartedAt,
        error: normalizeNetworkErrorMessage(error, didTimeout),
      };
    } finally {
      clearTimeout(timeoutId);

      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    }

    if (!line || isStopped || !shouldContinue()) {
      return;
    }

    try {
      await onPing(line);
    } catch (error) {
      onFatalError(
        error instanceof Error ? error.message : 'Failed to persist a ping log line.',
      );
      return;
    }

    if (isStopped || !shouldContinue()) {
      return;
    }

    const delayMs = Math.max(0, intervalMs - (Date.now() - tickStartedAt));
    activeTimer = setTimeout(() => {
      void tick().catch((error) => {
        onFatalError(
          error instanceof Error ? error.message : 'The ping loop crashed unexpectedly.',
        );
      });
    }, delayMs);
  };

  void tick().catch((error) => {
    onFatalError(
      error instanceof Error ? error.message : 'The ping loop crashed unexpectedly.',
    );
  });

  return stop;
}
