import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { LogBox, useColorScheme } from 'react-native';

if (__DEV__) {
  LogBox.ignoreLogs([
    /ExpoKeepAwake\.activate/,
    /ExpoSystemUI\.setBackgroundColorAsync/,
    /current activity is no longer available/,
  ]);
}

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useSessionStore } from '@/store/session';
import '@/src/global.css';

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
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const theme = THEME[mode];
  const bootstrap = useSessionStore((state) => state.bootstrap);

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
            headerShown: false,
            sceneStyle: { backgroundColor: theme.background },
            tabBarStyle: {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              elevation: 0,
            },
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.muted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
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
            name="sessions"
            options={{
              title: 'History',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="list-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
