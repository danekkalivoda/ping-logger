import {
  NetInfoStateType,
  type NetInfoCellularState,
  type NetInfoState,
  type NetInfoWifiState,
} from '@react-native-community/netinfo';

export type NetworkStatusKind =
  | 'wifi'
  | 'cellular'
  | 'offline'
  | 'ethernet'
  | 'vpn'
  | 'other'
  | 'unknown';

export type NetworkStatusView = {
  kind: NetworkStatusKind;
  title: string;
  subtitle: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isWifiEnabled: boolean | null;
  isConnectionExpensive: boolean | null;
  ssid: string | null;
  bssid: string | null;
  wifiStrength: number | null;
  ipAddress: string | null;
  subnet: string | null;
  frequencyMhz: number | null;
  linkSpeedMbps: number | null;
  rxLinkSpeedMbps: number | null;
  txLinkSpeedMbps: number | null;
  cellularGeneration: string | null;
  carrier: string | null;
};

const REDACTED_BSSID = '02:00:00:00:00:00';

export function normalizeNetworkStatus(state: NetInfoState): NetworkStatusView {
  const connectedDetails = state.details;
  const expensive =
    connectedDetails && 'isConnectionExpensive' in connectedDetails
      ? connectedDetails.isConnectionExpensive
      : null;
  const isWifiEnabled =
    typeof state.isWifiEnabled === 'boolean' ? state.isWifiEnabled : null;
  const base = {
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    isWifiEnabled,
    isConnectionExpensive: expensive,
    ssid: null,
    bssid: null,
    wifiStrength: null,
    ipAddress: null,
    subnet: null,
    frequencyMhz: null,
    linkSpeedMbps: null,
    rxLinkSpeedMbps: null,
    txLinkSpeedMbps: null,
    cellularGeneration: null,
    carrier: null,
  } satisfies Omit<NetworkStatusView, 'kind' | 'title' | 'subtitle'>;

  switch (state.type) {
    case NetInfoStateType.wifi: {
      const details = (state as NetInfoWifiState).details;
      const ssid = normalizeSsid(details.ssid);
      return {
        ...base,
        kind: 'wifi',
        title: 'Wi-Fi',
        subtitle: ssid ?? 'Wireless network',
        ssid,
        bssid: normalizeBssid(details.bssid),
        wifiStrength: normalizePercent(details.strength),
        ipAddress: normalizeString(details.ipAddress),
        subnet: normalizeString(details.subnet),
        frequencyMhz: normalizePositiveNumber(details.frequency),
        linkSpeedMbps: normalizePositiveNumber(details.linkSpeed),
        rxLinkSpeedMbps: normalizePositiveNumber(details.rxLinkSpeed),
        txLinkSpeedMbps: normalizePositiveNumber(details.txLinkSpeed),
      };
    }

    case NetInfoStateType.cellular: {
      const details = (state as NetInfoCellularState).details;
      const generation = normalizeString(details.cellularGeneration);
      return {
        ...base,
        kind: 'cellular',
        title: 'Cellular',
        subtitle: generation ? generation.toUpperCase() : 'Mobile data',
        cellularGeneration: generation,
        carrier: normalizeString(details.carrier),
      };
    }

    case NetInfoStateType.none:
      return {
        ...base,
        kind: 'offline',
        title: 'Offline',
        subtitle: 'No active network',
      };

    case NetInfoStateType.ethernet:
      return {
        ...base,
        kind: 'ethernet',
        title: 'Ethernet',
        subtitle: 'Wired network',
        ipAddress: normalizeString(
          'ipAddress' in (state.details ?? {}) ? state.details?.ipAddress : null,
        ),
        subnet: normalizeString(
          'subnet' in (state.details ?? {}) ? state.details?.subnet : null,
        ),
      };

    case NetInfoStateType.vpn:
      return {
        ...base,
        kind: 'vpn',
        title: 'VPN',
        subtitle: 'Tunnel connection',
      };

    case NetInfoStateType.bluetooth:
    case NetInfoStateType.wimax:
    case NetInfoStateType.other:
      return {
        ...base,
        kind: 'other',
        title: titleCase(state.type),
        subtitle: 'Network connection',
      };

    case NetInfoStateType.unknown:
    default:
      return {
        ...base,
        kind: 'unknown',
        title: 'Unknown',
        subtitle: 'Network state pending',
      };
  }
}

export function formatReachability(value: boolean | null) {
  if (value === true) return 'Reachable';
  if (value === false) return 'Not reachable';
  return 'Checking';
}

export function formatConnected(value: boolean | null) {
  if (value === true) return 'Connected';
  if (value === false) return 'Disconnected';
  return 'Unknown';
}

export function formatSignal(value: number | null) {
  return value === null ? 'N/A' : `${value}%`;
}

export function formatOptional(value: string | number | null) {
  return value === null || value === '' ? 'N/A' : String(value);
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSsid(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === '<unknown ssid>' || lower === 'unknown ssid') return null;
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalizeString(normalized.slice(1, -1));
  }
  return normalized;
}

function normalizeBssid(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized.toLowerCase() === REDACTED_BSSID ? null : normalized;
}

function normalizePercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePositiveNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
