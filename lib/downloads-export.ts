import { Directory, File, Paths } from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';

const APP_DIRECTORY_NAME = 'PingLogger';
const CONFIG_FILE_NAME = 'public-export.json';
const DEFAULT_SUBDIRECTORY = 'PingLogger';

export type PublicExportRootDirectory = 'downloads' | 'documents';

export type PublicExportSettings = {
  rootDirectory: PublicExportRootDirectory;
  subdirectory: string;
};

type PublicExportConfig = PublicExportSettings;

type PublicExportNativeResult = {
  fileName: string;
  relativePath: string;
  targetUri: string;
};

type PublicExportNativeModule = {
  exportFileToPublicDirectory: (
    sourceFileUri: string,
    displayName: string,
    rootDirectory: PublicExportRootDirectory,
    subdirectory: string,
    mimeType: string,
  ) => Promise<PublicExportNativeResult>;
};

const DEFAULT_SETTINGS: PublicExportSettings = {
  rootDirectory: 'downloads',
  subdirectory: DEFAULT_SUBDIRECTORY,
};

function configFile() {
  const dir = new Directory(Paths.document, APP_DIRECTORY_NAME);
  dir.create({ idempotent: true, intermediates: true });
  return new File(dir, CONFIG_FILE_NAME);
}

function sanitizeSubdirectory(input: string | null | undefined) {
  const normalized = (input ?? '')
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');

  return normalized || DEFAULT_SUBDIRECTORY;
}

function readConfig(): PublicExportConfig {
  const file = configFile();
  if (!file.exists) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(file.textSync()) as Partial<PublicExportConfig>;

    return {
      rootDirectory:
        parsed.rootDirectory === 'documents' ? 'documents' : DEFAULT_SETTINGS.rootDirectory,
      subdirectory: sanitizeSubdirectory(parsed.subdirectory),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeConfig(config: PublicExportConfig) {
  const file = configFile();
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(JSON.stringify(config));
}

function getNativeModule() {
  return NativeModules.PublicExportModule as PublicExportNativeModule | undefined;
}

export function getPublicExportSettings(): PublicExportSettings {
  return readConfig();
}

export function savePublicExportSettings(
  next: Partial<PublicExportSettings>,
): PublicExportSettings {
  const merged: PublicExportSettings = {
    ...readConfig(),
    ...next,
  };

  const normalized: PublicExportSettings = {
    rootDirectory: merged.rootDirectory === 'documents' ? 'documents' : 'downloads',
    subdirectory: sanitizeSubdirectory(merged.subdirectory),
  };

  writeConfig(normalized);
  return normalized;
}

export function getPublicExportDirectoryLabel(settings = getPublicExportSettings()) {
  const root = settings.rootDirectory === 'documents' ? 'Documents' : 'Downloads';
  return `${root}/${sanitizeSubdirectory(settings.subdirectory)}`;
}

export type PublicExportOutcome =
  | { exported: true; fileName: string; relativePath: string; targetUri: string }
  | { exported: false; reason: 'unsupported' | 'error'; error?: string };

export async function exportSessionFileToPublicDirectory({
  internalFileUri,
  fileName,
}: {
  internalFileUri: string;
  fileName: string;
}): Promise<PublicExportOutcome> {
  if (Platform.OS !== 'android') {
    return { exported: false, reason: 'unsupported' };
  }

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    return {
      exported: false,
      reason: 'unsupported',
      error: 'Public export native module is unavailable in this build.',
    };
  }

  const settings = getPublicExportSettings();

  try {
    const result = await nativeModule.exportFileToPublicDirectory(
      internalFileUri,
      fileName,
      settings.rootDirectory,
      sanitizeSubdirectory(settings.subdirectory),
      'application/x-ndjson',
    );

    return {
      exported: true,
      fileName: result.fileName,
      relativePath: result.relativePath,
      targetUri: result.targetUri,
    };
  } catch (error) {
    return {
      exported: false,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
