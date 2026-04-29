import type { NetworkStatusSnapshot } from '@/lib/network-status';

export type SessionHeaderLine = {
  type: 'header';
  url: string;
  start: string;
  interval_ms: number;
  include_network_status: boolean;
  device: string;
  app_version: string;
};

export type SessionPingLine = {
  type: 'ping';
  ts: string;
  status: number;
  latency_ms: number;
  error?: string;
  network?: NetworkStatusSnapshot;
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

export type SessionNetworkSummary = {
  sampleCount: number;
  lastNetworkType: NetworkStatusSnapshot['type'] | null;
  lastSsid: string | null;
  lastWifiStrength: number | null;
  minWifiStrength: number | null;
  maxWifiStrength: number | null;
  networkChanged: boolean;
};

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
  networkSummary: SessionNetworkSummary | null;
  status: 'ready' | 'incomplete';
};
