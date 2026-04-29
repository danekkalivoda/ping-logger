import notifee, {
  AndroidColor,
  AndroidImportance,
  AndroidStyle,
  AuthorizationStatus,
  EventType,
  type Event,
} from '@notifee/react-native';
import { PermissionsAndroid, Platform } from 'react-native';

const CHANNEL_ID = 'ping_session';
const NOTIFICATION_ID = 'ping_session_active';
const STOP_ACTION_ID = 'stop-ping-session';

export type PingNotificationState = {
  url: string;
  startedAt: string;
  requestCount: number;
  errorCount: number;
  averageLatencyMs: number;
};

let didRegisterRuntime = false;
let stopRequestHandler: (() => void) | null = null;
let foregroundServiceResolver: (() => void) | null = null;

export class NotificationPermissionError extends Error {
  constructor() {
    super('Notification permission is required to run the ping session.');
    this.name = 'NotificationPermissionError';
  }
}

function getHostLabel(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function formatClockLabel(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatElapsedLabel(isoString: string) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoString).getTime()) / 1000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function handleEvent(event: Event) {
  if (
    event.type === EventType.ACTION_PRESS &&
    event.detail.pressAction?.id === STOP_ACTION_ID
  ) {
    stopRequestHandler?.();
  }
}

export function setStopRequestHandler(handler: (() => void) | null) {
  stopRequestHandler = handler;
}

async function ensureChannel() {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Ping Session',
    importance: AndroidImportance.LOW,
    vibration: false,
  });
}

function isNotificationAuthorized(status: AuthorizationStatus) {
  return status > AuthorizationStatus.DENIED;
}

function isAndroid13OrNewer() {
  const version =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : Number.parseInt(Platform.Version, 10);
  return Number.isFinite(version) && version >= 33;
}

async function requestAndroidPostNotificationsPermission() {
  if (Platform.OS !== 'android' || !isAndroid13OrNewer()) {
    return;
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return;
  }

  const result = await PermissionsAndroid.request(permission);
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new NotificationPermissionError();
  }
}

export async function ensureForegroundServicePermissions() {
  if (Platform.OS !== 'android') {
    return;
  }

  const current = await notifee.getNotificationSettings();
  if (isNotificationAuthorized(current.authorizationStatus)) {
    return;
  }

  await requestAndroidPostNotificationsPermission();

  const next = await notifee.requestPermission();
  if (!isNotificationAuthorized(next.authorizationStatus)) {
    throw new NotificationPermissionError();
  }
}

export async function openPingNotificationSettings() {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await ensureChannel();
  } catch {
    // Settings can still open at app level if channel creation is unavailable.
  }

  await notifee.openNotificationSettings(CHANNEL_ID);
}

export async function showPingNotification(state: PingNotificationState) {
  if (Platform.OS !== 'android') {
    return;
  }

  const channelId = await ensureChannel();
  const host = getHostLabel(state.url);

  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: `Pinging ${host}`,
    body:
      `Started ${formatClockLabel(state.startedAt)} · Elapsed ${formatElapsedLabel(state.startedAt)}\n` +
      `${state.requestCount} req · ${state.errorCount} err · avg ${state.averageLatencyMs}ms\n` +
      state.url,
    android: {
      channelId,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      color: AndroidColor.BLUE,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
      actions: [
        {
          title: 'Stop',
          pressAction: { id: STOP_ACTION_ID },
        },
      ],
      style: {
        type: AndroidStyle.BIGTEXT,
        text:
          `Started ${formatClockLabel(state.startedAt)} · Elapsed ${formatElapsedLabel(state.startedAt)}\n` +
          `${state.requestCount} req · ${state.errorCount} err · avg ${state.averageLatencyMs}ms\n` +
          state.url,
      },
    },
  });
}

export async function stopPingNotification() {
  if (Platform.OS !== 'android') {
    return;
  }

  foregroundServiceResolver?.();
  foregroundServiceResolver = null;

  try {
    await notifee.stopForegroundService();
  } catch {
    // ignore
  }

  try {
    await notifee.cancelNotification(NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

export function registerNotificationRuntime() {
  if (didRegisterRuntime || Platform.OS !== 'android') {
    return;
  }

  didRegisterRuntime = true;

  notifee.registerForegroundService(() =>
    new Promise<void>((resolve) => {
      foregroundServiceResolver?.();
      foregroundServiceResolver = resolve;
    }),
  );

  notifee.onBackgroundEvent(async (event) => {
    handleEvent(event);
  });

  notifee.onForegroundEvent((event) => {
    handleEvent(event);
  });
}
