export type SessionHeaderLine = {
  type: 'header';
  url: string;
  start: string;
  interval_ms: number;
  device: string;
  app_version: string;
};

export type SessionPingLine = {
  type: 'ping';
  ts: string;
  status: number;
  latency_ms: number;
  error?: string;
};

export type SessionFooterLine = {
  type: 'footer';
  end: string | null;
  duration_s: number;
  total: number;
  success: number;
  error: number;
  avg_latency_ms: number;
  abnormal_termination?: boolean;
};

export type SessionFileLine =
  | SessionHeaderLine
  | SessionPingLine
  | SessionFooterLine;

export type SessionPreview = {
  id: string;
  fileName: string;
  fileUri: string;
  storagePath: string;
  url: string;
  startedAt: string;
  endedAt: string | null;
  startedLabel: string;
  durationLabel: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatencyMs: number;
  status: 'ready' | 'incomplete';
};

