import { create } from 'zustand';

import {
  ensureForegroundServicePermissions,
  setStopRequestHandler,
  showPingNotification,
  stopPingNotification,
} from '@/lib/notifications';
import { startPingLoop } from '@/lib/pinger';
import {
  appendPingLine,
  finalizeIncompleteSessions,
  serializeSessionLine,
  startSessionLifecycle,
  stopSessionLifecycle,
} from '@/lib/sessions';
import type { SessionPingLine } from '@/lib/session-types';
import { validatePingInputs } from '@/lib/validation';

const IDLE_LOG_LINES = [
  '// Ready to start a new session.',
  '// Start spins up an Android foreground service and begins pinging.',
  '// Stop works from the app and from the persistent notification.',
];

const MAX_LOG_LINES = 150;
const NOTIFICATION_REFRESH_MS = 5_000;

let stopPingLoopFn: (() => void) | null = null;
let notificationRefreshTimer: ReturnType<typeof setInterval> | null = null;
let didBootstrap = false;

function rollLogLines(lines: string[]) {
  return lines.slice(-MAX_LOG_LINES);
}

function clearNotificationTimer() {
  if (notificationRefreshTimer) {
    clearInterval(notificationRefreshTimer);
    notificationRefreshTimer = null;
  }
}

type SessionState = {
  sessionId: string | null;
  urlInput: string;
  intervalInput: string;
  showAdvanced: boolean;
  isBusy: boolean;
  isRunning: boolean;
  requestCount: number;
  errorCount: number;
  averageLatencyMs: number;
  startedAt: string | null;
  sessionFileUri: string | null;
  sessionStoragePath: string | null;
  logLines: string[];
  errorMessage: string | null;
  infoMessage: string | null;
  sessionSavedAt: number | null;
  setUrlInput: (value: string) => void;
  setIntervalInput: (value: string) => void;
  toggleAdvanced: () => void;
  bootstrap: () => Promise<void>;
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => {
  async function finalizeCurrentSession(reason: 'user' | 'fatal' | 'permission') {
    const state = get();

    if (!state.sessionFileUri || !state.startedAt || !state.isRunning) {
      return;
    }

    stopPingLoopFn?.();
    stopPingLoopFn = null;
    clearNotificationTimer();
    setStopRequestHandler(null);

    try {
      const result = await stopSessionLifecycle({
        fileUri: state.sessionFileUri,
        startedAt: state.startedAt,
        requestCount: state.requestCount,
        errorCount: state.errorCount,
        averageLatencyMs: state.averageLatencyMs,
      });

      set((current) => ({
        ...current,
        isBusy: false,
        isRunning: false,
        logLines: rollLogLines([...current.logLines, result.serializedFooter]),
        errorMessage:
          reason === 'fatal'
            ? 'The ping loop stopped unexpectedly. The session was saved.'
            : null,
        infoMessage: null,
        sessionSavedAt: reason === 'user' ? Date.now() : current.sessionSavedAt,
      }));
    } catch (error) {
      set({
        isBusy: false,
        isRunning: false,
        errorMessage:
          error instanceof Error
            ? `Failed to close session: ${error.message}`
            : 'Failed to close the session.',
      });
    } finally {
      await stopPingNotification();
    }
  }

  return {
    sessionId: null,
    urlInput: 'https://www.lekarna.cz',
    intervalInput: '1000',
    showAdvanced: false,
    isBusy: false,
    isRunning: false,
    requestCount: 0,
    errorCount: 0,
    averageLatencyMs: 0,
    startedAt: null,
    sessionFileUri: null,
    sessionStoragePath: null,
    logLines: IDLE_LOG_LINES,
    errorMessage: null,
    infoMessage: null,
    sessionSavedAt: null,
    setUrlInput: (value) =>
      set({ urlInput: value, errorMessage: null, infoMessage: null }),
    setIntervalInput: (value) =>
      set({ intervalInput: value, errorMessage: null, infoMessage: null }),
    toggleAdvanced: () => set((state) => ({ showAdvanced: !state.showAdvanced })),
    bootstrap: async () => {
      if (didBootstrap) {
        return;
      }
      didBootstrap = true;

      try {
        const closed = await finalizeIncompleteSessions();

        if (closed.length > 0) {
          set({
            infoMessage:
              closed.length === 1
                ? 'A previous session was left unfinished and has been marked as aborted.'
                : `${closed.length} previous sessions were left unfinished and marked as aborted.`,
          });
        }
      } catch {
        // silent — bootstrap should never block starting a new session
      }
    },
    startSession: async () => {
      const state = get();

      if (state.isBusy || state.isRunning) {
        return;
      }

      const validation = validatePingInputs(state.urlInput, state.intervalInput);
      if (!validation.ok) {
        set({ errorMessage: validation.error, infoMessage: null });
        return;
      }

      set({ isBusy: true, errorMessage: null, infoMessage: null });

      let createdSession:
        | Awaited<ReturnType<typeof startSessionLifecycle>>
        | null = null;

      try {
        await ensureForegroundServicePermissions();

        createdSession = await startSessionLifecycle({
          url: validation.value.normalizedUrl,
          intervalMs: validation.value.intervalMs,
        });

        setStopRequestHandler(() => {
          void get().stopSession();
        });

        await showPingNotification({
          url: validation.value.normalizedUrl,
          startedAt: createdSession.header.start,
          requestCount: 0,
          errorCount: 0,
          averageLatencyMs: 0,
        });

        set({
          sessionId: createdSession.sessionId,
          urlInput: validation.value.normalizedUrl,
          intervalInput: String(validation.value.intervalMs),
          isBusy: false,
          isRunning: true,
          requestCount: 0,
          errorCount: 0,
          averageLatencyMs: 0,
          startedAt: createdSession.header.start,
          sessionFileUri: createdSession.fileUri,
          sessionStoragePath: createdSession.storagePath,
          logLines: [createdSession.serializedHeader],
        });

        const pingerFileUri = createdSession.fileUri;

        stopPingLoopFn = startPingLoop({
          url: validation.value.normalizedUrl,
          intervalMs: validation.value.intervalMs,
          shouldContinue: () => get().isRunning,
          onPing: async (line: SessionPingLine) => {
            await appendPingLine({ fileUri: pingerFileUri, line });

            set((current) => {
              if (!current.isRunning || current.sessionFileUri !== pingerFileUri) {
                return current;
              }

              const nextRequestCount = current.requestCount + 1;
              const nextErrorCount =
                current.errorCount +
                (line.status < 200 || line.status >= 400 || line.error ? 1 : 0);
              const nextAverageLatencyMs = Math.round(
                ((current.averageLatencyMs * current.requestCount) + line.latency_ms) /
                  nextRequestCount,
              );

              return {
                ...current,
                requestCount: nextRequestCount,
                errorCount: nextErrorCount,
                averageLatencyMs: nextAverageLatencyMs,
                logLines: rollLogLines([
                  ...current.logLines,
                  serializeSessionLine(line),
                ]),
              };
            });
          },
          onFatalError: () => {
            void finalizeCurrentSession('fatal');
          },
        });

        clearNotificationTimer();
        notificationRefreshTimer = setInterval(() => {
          const live = get();
          if (!live.isRunning || !live.startedAt) {
            return;
          }

          void showPingNotification({
            url: validation.value.normalizedUrl,
            startedAt: live.startedAt,
            requestCount: live.requestCount,
            errorCount: live.errorCount,
            averageLatencyMs: live.averageLatencyMs,
          }).catch(() => {
            // ignore refresh errors
          });
        }, NOTIFICATION_REFRESH_MS);
      } catch (error) {
        stopPingLoopFn?.();
        stopPingLoopFn = null;
        clearNotificationTimer();
        setStopRequestHandler(null);
        await stopPingNotification();

        let fallbackLogLines = IDLE_LOG_LINES;

        if (createdSession) {
          try {
            const closedSession = await stopSessionLifecycle({
              fileUri: createdSession.fileUri,
              startedAt: createdSession.header.start,
              requestCount: 0,
              errorCount: 0,
              averageLatencyMs: 0,
              abnormalTermination: true,
            });
            fallbackLogLines = [
              createdSession.serializedHeader,
              closedSession.serializedFooter,
            ];
          } catch {
            fallbackLogLines = [createdSession.serializedHeader];
          }
        }

        set({
          sessionId: null,
          isBusy: false,
          isRunning: false,
          requestCount: 0,
          errorCount: 0,
          averageLatencyMs: 0,
          startedAt: null,
          sessionFileUri: null,
          sessionStoragePath: createdSession?.storagePath ?? null,
          logLines: fallbackLogLines,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Failed to start the ping session.',
          infoMessage: null,
        });
      }
    },
    stopSession: async () => {
      const state = get();

      if (!state.isRunning || !state.sessionFileUri || !state.startedAt) {
        return;
      }

      if (state.isBusy) {
        return;
      }

      set({ isBusy: true });

      await finalizeCurrentSession('user');
    },
  };
});
