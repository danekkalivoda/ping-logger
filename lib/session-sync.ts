import { Directory, File, Paths } from 'expo-file-system';

import { getDeviceIdentity } from '@/lib/device-identity';
import { openSessionFile } from '@/lib/session-storage';
import type {
  SessionFileLine,
  SessionFooterLine,
  SessionHeaderLine,
  SessionPingLine,
} from '@/lib/session-types';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionUploadStatusStore } from '@/store/session-upload-status';

const APP_DIRECTORY_NAME = 'PingLogger';
const QUEUE_FILE_NAME = 'supabase-sync-queue.json';
const PING_SESSIONS_TABLE = 'ping_sessions';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type SessionUploadQueueItem = {
  fileUri: string;
  fileName: string;
  sessionId: string;
  enqueuedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
};

type SessionUploadQueue = {
  items: SessionUploadQueueItem[];
};

type SessionUploadPayload = {
  schema_version: 1;
  uploaded_at: string;
  session_id: string;
  file_name: string;
  storage_path: string;
  line_count: number;
  header: SessionHeaderLine;
  pings: SessionPingLine[];
  footer: SessionFooterLine | null;
  lines: SessionFileLine[];
  summary: {
    total: number;
    success: number;
    error: number;
    avg_latency_ms: number;
    duration_s: number;
    abnormal_termination: boolean;
  };
};

type PingSessionInsert = {
  device_id: string;
  device_name: string;
  device_label: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  url: string;
  payload: JsonValue;
};

let flushPromise: Promise<void> | null = null;

function queueFile() {
  const dir = new Directory(Paths.document, APP_DIRECTORY_NAME);
  dir.create({ idempotent: true, intermediates: true });
  return new File(dir, QUEUE_FILE_NAME);
}

function readQueue(): SessionUploadQueue {
  const file = queueFile();

  if (!file.exists) {
    return { items: [] };
  }

  try {
    const parsed = JSON.parse(file.textSync()) as Partial<SessionUploadQueue>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(
          (item): item is SessionUploadQueueItem =>
            typeof item?.fileUri === 'string' &&
            typeof item.fileName === 'string' &&
            typeof item.sessionId === 'string' &&
            typeof item.enqueuedAt === 'string' &&
            typeof item.attempts === 'number',
        )
      : [];

    return { items };
  } catch {
    return { items: [] };
  }
}

function writeQueue(queue: SessionUploadQueue) {
  const file = queueFile();
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(JSON.stringify(queue));
}

function setIdle(pendingCount = readQueue().items.length) {
  useSessionUploadStatusStore.getState().setIdle(pendingCount);
}

function setSyncing(pendingCount = readQueue().items.length) {
  useSessionUploadStatusStore.getState().setSyncing(pendingCount);
}

function setError(message: string, pendingCount = readQueue().items.length) {
  useSessionUploadStatusStore.getState().setError(message, pendingCount);
}

function sanitizeSerializedLine(line: string) {
  return line.replace(/\u0000/g, '').trim();
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

function toSessionId(fileName: string) {
  return fileName.replace(/\.jsonl$/, '');
}

function sessionStoragePath(fileName: string) {
  return `PingLogger/sessions/${fileName}`;
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
) {
  if (footer) {
    return footer.duration_s;
  }

  const fallbackEnd = pings.at(-1)?.ts ?? startedAt;
  return Math.max(
    0,
    Math.round((new Date(fallbackEnd).getTime() - new Date(startedAt).getTime()) / 1000),
  );
}

function buildSessionPayload({
  fileUri,
  fileName,
}: {
  fileUri: string;
  fileName: string;
}) {
  const file = openSessionFile(fileUri);

  if (!file.exists) {
    throw new Error(`Session file no longer exists: ${fileName}`);
  }

  const lines = file
    .textSync()
    .split('\n')
    .map(sanitizeSerializedLine)
    .filter(Boolean)
    .map(parseLine)
    .filter((line): line is SessionFileLine => line !== null);

  const header = lines.find(
    (line): line is SessionHeaderLine => line.type === 'header',
  );

  if (!header) {
    throw new Error(`Session file is missing a header: ${fileName}`);
  }

  const footer =
    [...lines]
      .reverse()
      .find((line): line is SessionFooterLine => line.type === 'footer') ?? null;
  const pings = lines.filter(
    (line): line is SessionPingLine => line.type === 'ping',
  );
  const errorCount =
    footer?.error ??
    pings.filter((ping) => ping.status < 200 || ping.status >= 400 || Boolean(ping.error))
      .length;
  const total = footer?.total ?? pings.length;
  const success = footer?.success ?? Math.max(0, total - errorCount);
  const avgLatencyMs = footer?.avg_latency_ms ?? averageLatency(pings);
  const durationSeconds = inferDurationSeconds(header.start, footer, pings);

  return {
    schema_version: 1,
    uploaded_at: new Date().toISOString(),
    session_id: toSessionId(fileName),
    file_name: fileName,
    storage_path: sessionStoragePath(fileName),
    line_count: lines.length,
    header,
    pings,
    footer,
    lines,
    summary: {
      total,
      success,
      error: errorCount,
      avg_latency_ms: avgLatencyMs,
      duration_s: durationSeconds,
      abnormal_termination: Boolean(footer?.abnormal_termination),
    },
  } satisfies SessionUploadPayload;
}

function buildInsertRecord(item: SessionUploadQueueItem): PingSessionInsert {
  const identity = getDeviceIdentity();
  const payload = buildSessionPayload({
    fileUri: item.fileUri,
    fileName: item.fileName,
  });

  return {
    device_id: identity.deviceId,
    device_name: identity.deviceName,
    device_label: identity.deviceLabel,
    session_id: payload.session_id,
    started_at: payload.header.start,
    ended_at: payload.footer?.end ?? null,
    url: payload.header.url,
    payload: payload as unknown as JsonValue,
  };
}

function upsertQueueItem(fileUri: string) {
  const file = openSessionFile(fileUri);
  const fileName = file.name;
  const sessionId = toSessionId(fileName);
  const queue = readQueue();
  const existing = queue.items.find(
    (item) => item.sessionId === sessionId || item.fileUri === fileUri,
  );

  if (existing) {
    setIdle(queue.items.length);
    return existing;
  }

  const item: SessionUploadQueueItem = {
    fileUri,
    fileName,
    sessionId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };

  queue.items.push(item);
  writeQueue(queue);
  setIdle(queue.items.length);
  return item;
}

function removeQueueItem(queue: SessionUploadQueue, sessionId: string) {
  queue.items = queue.items.filter((item) => item.sessionId !== sessionId);
}

function removePersistedQueueItem(sessionId: string) {
  const queue = readQueue();
  removeQueueItem(queue, sessionId);
  writeQueue(queue);
  return queue;
}

function updateQueueItemError(
  queue: SessionUploadQueue,
  sessionId: string,
  error: string,
) {
  queue.items = queue.items.map((item) =>
    item.sessionId === sessionId
      ? {
          ...item,
          attempts: item.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: error,
        }
      : item,
  );
}

function updatePersistedQueueItemError(sessionId: string, error: string) {
  const queue = readQueue();
  updateQueueItemError(queue, sessionId, error);
  writeQueue(queue);
  return queue;
}

async function uploadQueueItem(item: SessionUploadQueueItem) {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const record = buildInsertRecord(item);
  const { error } = await client.from(PING_SESSIONS_TABLE).insert(record);

  if (error && error.code !== '23505') {
    throw error;
  }
}

async function flushPendingSessionUploadsInner() {
  let queue = readQueue();

  if (queue.items.length === 0) {
    setIdle(0);
    return;
  }

  if (!isSupabaseConfigured()) {
    setIdle(queue.items.length);
    return;
  }

  let lastError: string | null = null;

  for (const item of [...queue.items]) {
    setSyncing(queue.items.length);

    try {
      const file = openSessionFile(item.fileUri);
      if (!file.exists) {
        removePersistedQueueItem(item.sessionId);
        continue;
      }

      await uploadQueueItem(item);
      removePersistedQueueItem(item.sessionId);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      updatePersistedQueueItemError(item.sessionId, lastError);
    }

    queue = readQueue();
  }

  queue = readQueue();

  if (queue.items.length > 0 && lastError) {
    setError(lastError, queue.items.length);
    return;
  }

  setIdle(queue.items.length);
}

export async function flushPendingSessionUploads() {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = flushPendingSessionUploadsInner().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

export async function syncCompletedSession({ fileUri }: { fileUri: string }) {
  upsertQueueItem(fileUri);
  return flushPendingSessionUploads();
}

export function queueSessionUpload({ fileUri }: { fileUri: string }) {
  upsertQueueItem(fileUri);
}

export function getPendingSessionUploadCount() {
  return readQueue().items.length;
}
