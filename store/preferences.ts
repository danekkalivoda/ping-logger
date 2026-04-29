import { Directory, File, Paths } from 'expo-file-system';
import { Appearance } from 'react-native';
import { create } from 'zustand';

const APP_DIRECTORY_NAME = 'PingLogger';
const CONFIG_FILE_NAME = 'theme-preference.json';

export type ThemeMode = 'auto' | 'light' | 'dark';

type StoredConfig = { themeMode: ThemeMode };

function configFile() {
  const dir = new Directory(Paths.document, APP_DIRECTORY_NAME);
  dir.create({ idempotent: true, intermediates: true });
  return new File(dir, CONFIG_FILE_NAME);
}

function readMode(): ThemeMode {
  const file = configFile();
  if (!file.exists) return 'auto';
  try {
    const parsed = JSON.parse(file.textSync()) as Partial<StoredConfig>;
    if (
      parsed.themeMode === 'light' ||
      parsed.themeMode === 'dark' ||
      parsed.themeMode === 'auto'
    ) {
      return parsed.themeMode;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

function writeMode(mode: ThemeMode) {
  const file = configFile();
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify({ themeMode: mode } satisfies StoredConfig));
}

type PreferencesState = {
  themeMode: ThemeMode;
  themeLoaded: boolean;
  loadThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

function applyColorScheme(mode: ThemeMode) {
  // RN 0.83's native AppearanceModule declares a non-null String; passing null
  // crashes release builds. "unspecified" resets to MODE_NIGHT_FOLLOW_SYSTEM.
  const value = mode === 'auto' ? 'unspecified' : mode;
  (Appearance.setColorScheme as (scheme: string) => void)(value);
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  themeMode: 'auto',
  themeLoaded: false,
  loadThemeMode: () => {
    const mode = readMode();
    applyColorScheme(mode);
    set({ themeMode: mode, themeLoaded: true });
  },
  setThemeMode: (mode) => {
    applyColorScheme(mode);
    writeMode(mode);
    set({ themeMode: mode });
  },
}));
