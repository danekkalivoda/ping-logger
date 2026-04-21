import type { PingNotificationState } from '@/lib/notifications';

export type { PingNotificationState } from '@/lib/notifications';

export function registerNotificationRuntime() {}

export function setStopRequestHandler(_handler: (() => void) | null) {}

export async function ensureForegroundServicePermissions() {
  throw new Error('Foreground ping service is currently supported only on Android.');
}

export async function showPingNotification(_state: PingNotificationState) {
  throw new Error('Foreground ping service is currently supported only on Android.');
}

export async function stopPingNotification() {}
