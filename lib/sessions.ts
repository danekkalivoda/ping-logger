import Constants from 'expo-constants';
import * as Device from 'expo-device';

import { appendLineToFile, createSessionFile, deleteAllSessionFiles, listSessionFiles, openSessionFile } from '@/lib/session-storage';
import type {
  SessionFileLine,
  SessionFooterLine,
  SessionHeaderLine,
  SessionPingLine,
  SessionPreview,
} from '@/lib/session-types';

export type IncompleteSessionRecovery = {
  fileUri: string;
  fileName: string;
  storagePath: string;
  startedAt: string;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatFileTimestamp(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function formatStartedLabel(isoString: string) {
  const date = new Date(isoString);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} - ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDurationLabel(durationSeconds: number) {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`;
  }

  return `${seconds}s`;
}

function serializeLine(line: SessionFileLine) {
  return JSON.stringify(line);
}

export function serializeSessionLine(line: SessionFileLine) {
  return serializeLine(line);
}

function parseLine(line: string): SessionFileLine | null {
  try {
    const parsed = JSON.parse(line) as Partial<SessionFileLine> & { type?: string };

    if (parsed.type === 'header') {
      return parsed as SessionHeaderLine;
    }

    if (parsed.type === 'ping') {
      return parsed as SessionPingLine;
    }

    if (parsed.type === 'footer') {
      return parsed as SessionFooterLine;
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeSerializedLine(line: string) {
  return line.replace(/\u0000/g, '').trim();
}

function averageLatency(pings: SessionPingLine[]) {
  if (pings.length === 0) {
    return 0;
  }

  const total = pings.reduce((sum, ping) => sum + ping.latency_ms, 0);
  return Math.round(total / pings.length);
}

function inferDurationSeconds(
  startedAt: string,
  footer: SessionFooterLine | null,
  pings: SessionPingLine[],
  modificationTime: number | null,
) {
  if (footer) {
    return footer.duration_s;
  }

  const fallbackEnd =
    pings.at(-1)?.ts ??
    (modificationTime ? new Date(modificationTime).toISOString() : startedAt);

  return Math.max(
    0,
    Math.round((new Date(fallbackEnd).getTime() - new Date(startedAt).getTime()) / 1000),
  );
}

function summarizeSessionText(
  fileName: string,
  fileUri: string,
  modificationTime: number | null,
  fileText: string,
) {
  const parsedLines = fileText
    .split('\n')
    .map(sanitizeSerializedLine)
    .filter(Boolean)
    .map(parseLine)
    .filter((line): line is SessionFileLine => line !== null);

  const header = parsedLines.find(
    (line): line is SessionHeaderLine => line.type === 'header',
  );
  const footer =
    [...parsedLines]
      .reverse()
      .find((line): line is SessionFooterLine => line.type === 'footer') ?? null;
  const pings = parsedLines.filter(
    (line): line is SessionPingLine => line.type === 'ping',
  );

  const startedAt = header?.start ?? new Date(modificationTime ?? Date.now()).toISOString();
  const durationSeconds = inferDurationSeconds(startedAt, footer, pings, modificationTime);
  const totalRequests = footer?.total ?? pings.length;
  const successCount =
    footer?.success ?? pings.filter((ping) => ping.status >= 200 && ping.status < 400).length;
  const errorCount = footer?.error ?? Math.max(0, totalRequests - successCount);
  const avgLatencyMs = footer?.avg_latency_ms ?? averageLatency(pings);

  return {
    id: fileName.replace(/\.jsonl$/, ''),
    fileName,
    fileUri,
    storagePath: `PingLogger/sessions/${fileName}`,
    url: header?.url ?? 'Unknown target',
    startedAt,
    endedAt: footer?.end ?? null,
    startedLabel: formatStartedLabel(startedAt),
    durationLabel: formatDurationLabel(durationSeconds),
    totalRequests,
    successCount,
    errorCount,
    avgLatencyMs,
    status: footer ? 'ready' : 'incomplete',
  } satisfies SessionPreview;
}

export async function startSessionLifecycle({
  url,
  intervalMs,
}: {
  url: string;
  intervalMs: number;
}) {
  const startedAt = new Date();
  const fileName = `session-${formatFileTimestamp(startedAt)}.jsonl`;
  const file = createSessionFile(fileName);
  const header: SessionHeaderLine = {
    type: 'header',
    url,
    start: startedAt.toISOString(),
    interval_ms: intervalMs,
    device: Device.modelName ?? 'Unknown device',
    app_version: Constants.expoConfig?.version ?? 'unknown',
  };
  const serializedHeader = serializeLine(header);

  appendLineToFile(file, serializedHeader);

  return {
    sessionId: fileName.replace(/\.jsonl$/, ''),
    fileName,
    fileUri: file.uri,
    storagePath: `PingLogger/sessions/${file.name}`,
    header,
    serializedHeader,
  };
}

export async function stopSessionLifecycle({
  fileUri,
  startedAt,
  requestCount,
  errorCount,
  averageLatencyMs,
  abnormalTermination = false,
}: {
  fileUri: string;
  startedAt: string;
  requestCount: number;
  errorCount: number;
  averageLatencyMs: number;
  abnormalTermination?: boolean;
}) {
  const file = openSessionFile(fileUri);
  const endedAt = new Date();
  const footer: SessionFooterLine = {
    type: 'footer',
    end: abnormalTermination ? null : endedAt.toISOString(),
    duration_s: Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / 1000),
    ),
    total: requestCount,
    success: Math.max(0, requestCount - errorCount),
    error: errorCount,
    avg_latency_ms: averageLatencyMs,
    ...(abnormalTermination ? { abnormal_termination: true } : {}),
  };
  const serializedFooter = serializeLine(footer);

  appendLineToFile(file, serializedFooter);

  return {
    footer,
    serializedFooter,
  };
}

export async function finalizeIncompleteSessions() {
  const files = listSessionFiles();
  const closed: IncompleteSessionRecovery[] = [];

  for (const file of files) {
    const text = file.textSync();
    const parsedLines = text
      .split('\n')
      .map(sanitizeSerializedLine)
      .filter(Boolean)
      .map(parseLine)
      .filter((line): line is SessionFileLine => line !== null);

    const header = parsedLines.find(
      (line): line is SessionHeaderLine => line.type === 'header',
    );
    const hasFooter = parsedLines.some((line) => line.type === 'footer');

    if (!header || hasFooter) {
      continue;
    }

    const pings = parsedLines.filter(
      (line): line is SessionPingLine => line.type === 'ping',
    );
    const errorCount = pings.filter(
      (ping) => ping.status < 200 || ping.status >= 400 || Boolean(ping.error),
    ).length;

    await stopSessionLifecycle({
      fileUri: file.uri,
      startedAt: header.start,
      requestCount: pings.length,
      errorCount,
      averageLatencyMs: averageLatency(pings),
      abnormalTermination: true,
    });

    closed.push({
      fileUri: file.uri,
      fileName: file.name,
      storagePath: `PingLogger/sessions/${file.name}`,
      startedAt: header.start,
    });
  }

  return closed;
}

export async function appendPingLine({
  fileUri,
  line,
}: {
  fileUri: string;
  line: SessionPingLine;
}) {
  const file = openSessionFile(fileUri);
  const serializedPing = serializeLine(line);

  appendLineToFile(file, serializedPing);

  return {
    line,
    serializedPing,
  };
}

export async function loadSessionHistory() {
  return listSessionFiles().map((file) =>
    summarizeSessionText(file.name, file.uri, file.modificationTime, file.textSync()),
  );
}

export async function clearSessionHistory() {
  deleteAllSessionFiles();
}
