import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const APP_DIRECTORY_NAME = 'PingLogger';
const SESSIONS_DIRECTORY_NAME = 'sessions';

function assertNativeFilesystemAvailable() {
  if (Platform.OS === 'web') {
    throw new Error('Session storage is currently supported only on native builds.');
  }
}

export function getSessionsDirectory() {
  assertNativeFilesystemAvailable();
  return new Directory(Paths.document, APP_DIRECTORY_NAME, SESSIONS_DIRECTORY_NAME);
}

export function ensureSessionsDirectory() {
  const directory = getSessionsDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

export function createSessionFile(fileName: string) {
  const directory = ensureSessionsDirectory();
  const file = new File(directory, fileName);

  if (!file.exists) {
    file.create({ intermediates: true });
  }

  return file;
}

export function openSessionFile(fileUri: string) {
  assertNativeFilesystemAvailable();
  return new File(fileUri);
}

export function appendLineToFile(file: File, serializedLine: string) {
  file.write(`${serializedLine}\n`, { append: true });
}

export function listSessionFiles() {
  const directory = ensureSessionsDirectory();

  return directory
    .list()
    .filter((item): item is File => item instanceof File && item.extension === '.jsonl')
    .sort(
      (left, right) =>
        (right.modificationTime ?? 0) - (left.modificationTime ?? 0),
    );
}

export function deleteAllSessionFiles() {
  for (const file of listSessionFiles()) {
    file.delete();
  }
}
