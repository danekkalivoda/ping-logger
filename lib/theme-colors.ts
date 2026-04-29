import { useColorScheme } from 'react-native';

/**
 * Hex colors mirrored from `src/global.css` tokens for places where we need a
 * literal color string (e.g. `<Ionicons color={...}>`). Uses RN's
 * `useColorScheme` which — thanks to `Appearance.setColorScheme` being called
 * synchronously in `store/preferences.ts` — stays in lock-step with the app's
 * theme preference, not just the system scheme.
 */
export function useIconColors() {
  const isDark = useColorScheme() === 'dark';
  return {
    foreground: isDark ? '#E4EFEC' : '#101C1E',
    mutedForeground: isDark ? '#7F979B' : '#607474',
    primaryForeground: '#042F24',
    destructive: isDark ? '#ED7850' : '#B54322',
  };
}
