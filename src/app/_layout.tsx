import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, Text, View, useColorScheme } from 'react-native';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/src/global.css';
import { usePreferencesStore } from '@/store/preferences';
import { useSessionStore } from '@/store/session';
import { useSessionUploadStatusStore } from '@/store/session-upload-status';

if (__DEV__) {
  LogBox.ignoreLogs([
    /ExpoKeepAwake\.activate/,
    /ExpoSystemUI\.setBackgroundColorAsync/,
    /current activity is no longer available/,
  ]);
}

const THEME = {
  light: {
    background: '#F0F7F5',
    card: '#FAFDFC',
    border: '#D2DEDB',
    foreground: '#101C1E',
    muted: '#607474',
    primary: '#047857',
  },
  dark: {
    background: '#0B1315',
    card: '#152024',
    border: '#304044',
    foreground: '#E4EFEC',
    muted: '#7F979B',
    primary: '#6EE7B7',
  },
} as const;

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const loadThemeMode = usePreferencesStore((state) => state.loadThemeMode);
  const effectiveScheme = themeMode === 'auto' ? systemScheme : themeMode;
  const mode = effectiveScheme === 'dark' ? 'dark' : 'light';
  const theme = THEME[mode];
  const bootstrap = useSessionStore((state) => state.bootstrap);

  useEffect(() => {
    loadThemeMode();
  }, [loadThemeMode]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {
      // activity may not be attached during hot reload or startup; harmless
    });
  }, [theme.background]);

  return (
    <GluestackUIProvider mode={mode}>
      <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar
          style={mode === 'dark' ? 'light' : 'dark'}
          backgroundColor={theme.background}
        />
        <Tabs
          screenOptions={{
            headerShown: true,
            headerStyle: {
              backgroundColor: theme.card,
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
              elevation: 0,
              shadowOpacity: 0,
            },
            headerShadowVisible: false,
            headerTitleAlign: 'left',
            headerTintColor: theme.foreground,
            headerTitle: ({ children }) => (
              <Text
                style={{
                  color: theme.foreground,
                  fontSize: 20,
                  fontWeight: '700',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {children}
              </Text>
            ),
            headerRight: () => <SyncHeaderIndicator theme={theme} />,
            sceneStyle: { backgroundColor: theme.background },
            tabBarStyle: {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              elevation: 0,
            },
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.muted,
            tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Session',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="radio-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="log"
            options={{
              title: 'Log mirror',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="pulse-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="wifi"
            options={{
              title: 'Wi-Fi',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="wifi-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="sessions"
            options={{
              title: 'History',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="list-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}

function SyncHeaderIndicator({ theme }: { theme: (typeof THEME)[keyof typeof THEME] }) {
  const status = useSessionUploadStatusStore((state) => state.status);
  const pendingCount = useSessionUploadStatusStore((state) => state.pendingCount);

  if (status === 'idle' && pendingCount === 0) {
    return <View style={{ width: 44 }} />;
  }

  const isSyncing = status === 'syncing';
  const label = isSyncing
    ? `Uploading sessions to Supabase. ${pendingCount} pending.`
    : status === 'error'
      ? `Supabase upload has ${pendingCount} pending session${pendingCount === 1 ? '' : 's'}.`
      : `${pendingCount} session${pendingCount === 1 ? '' : 's'} waiting to upload.`;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6,
        justifyContent: 'center',
        minHeight: 44,
        minWidth: 44,
        paddingRight: 16,
      }}
    >
      {isSyncing ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <Ionicons
          name={status === 'error' ? 'cloud-offline-outline' : 'cloud-upload-outline'}
          size={18}
          color={status === 'error' ? '#B54322' : theme.muted}
        />
      )}
      {pendingCount > 0 ? (
        <Text
          style={{
            color: status === 'error' ? '#B54322' : theme.muted,
            fontSize: 11,
            fontVariant: ['tabular-nums'],
            fontWeight: '700',
          }}
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </Text>
      ) : null}
    </View>
  );
}
