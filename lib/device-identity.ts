import { Directory, File, Paths } from 'expo-file-system';

const APP_DIRECTORY_NAME = 'PingLogger';
const CONFIG_FILE_NAME = 'device-identity.json';
const DEVICE_NAME_MAX_LENGTH = 48;

const DEFAULT_DEVICE_NAMES = [
  'badger',
  'beaver',
  'bobcat',
  'falcon',
  'fox',
  'heron',
  'lynx',
  'otter',
  'owl',
  'puma',
  'raven',
  'seal',
  'stoat',
  'swift',
  'wren',
] as const;

export type DeviceIdentity = {
  deviceId: string;
  deviceName: string;
  deviceLabel: string;
  createdAt: string;
  updatedAt: string;
};

type StoredDeviceIdentity = {
  deviceId: string;
  deviceName: string;
  createdAt: string;
  updatedAt: string;
};

function configFile() {
  const dir = new Directory(Paths.document, APP_DIRECTORY_NAME);
  dir.create({ idempotent: true, intermediates: true });
  return new File(dir, CONFIG_FILE_NAME);
}

function randomHex(length: number) {
  const crypto = globalThis.crypto;

  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }

  let output = '';
  while (output.length < length) {
    output += Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return output.slice(0, length);
}

function generateDeviceId() {
  return [
    randomHex(8),
    randomHex(4),
    randomHex(4),
    randomHex(4),
    randomHex(12),
  ].join('-');
}

function defaultDeviceName() {
  const index = Math.floor(Math.random() * DEFAULT_DEVICE_NAMES.length);
  return DEFAULT_DEVICE_NAMES[index] ?? 'otter';
}

export function sanitizeDeviceName(input: string | null | undefined) {
  const normalized = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, DEVICE_NAME_MAX_LENGTH)
    .replace(/-+$/g, '');

  return normalized || defaultDeviceName();
}

function deviceSuffix(deviceId: string) {
  const compact = deviceId.replace(/[^a-f0-9]/gi, '').toLowerCase();
  return compact.slice(-6) || randomHex(6);
}

export function formatDeviceLabel(deviceName: string, deviceId: string) {
  return `${sanitizeDeviceName(deviceName)}-${deviceSuffix(deviceId)}`;
}

function toIdentity(stored: StoredDeviceIdentity): DeviceIdentity {
  const deviceName = sanitizeDeviceName(stored.deviceName);
  return {
    ...stored,
    deviceName,
    deviceLabel: formatDeviceLabel(deviceName, stored.deviceId),
  };
}

function writeStoredIdentity(stored: StoredDeviceIdentity) {
  const file = configFile();
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(JSON.stringify(stored));
}

function createStoredIdentity(): StoredDeviceIdentity {
  const now = new Date().toISOString();
  const stored = {
    deviceId: generateDeviceId(),
    deviceName: defaultDeviceName(),
    createdAt: now,
    updatedAt: now,
  };

  writeStoredIdentity(stored);
  return stored;
}

function readStoredIdentity(): StoredDeviceIdentity {
  const file = configFile();

  if (!file.exists) {
    return createStoredIdentity();
  }

  try {
    const parsed = JSON.parse(file.textSync()) as Partial<StoredDeviceIdentity>;
    if (!parsed.deviceId || !parsed.createdAt) {
      return createStoredIdentity();
    }

    const stored = {
      deviceId: parsed.deviceId,
      deviceName: sanitizeDeviceName(parsed.deviceName),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt ?? parsed.createdAt,
    };

    writeStoredIdentity(stored);
    return stored;
  } catch {
    return createStoredIdentity();
  }
}

export function getDeviceIdentity() {
  return toIdentity(readStoredIdentity());
}

export function saveDeviceName(deviceName: string) {
  const current = readStoredIdentity();
  const next = {
    ...current,
    deviceName: sanitizeDeviceName(deviceName),
    updatedAt: new Date().toISOString(),
  };

  writeStoredIdentity(next);
  return toIdentity(next);
}
