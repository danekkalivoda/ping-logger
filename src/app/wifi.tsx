import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert, AlertText } from '@/components/ui/alert';
import { Box } from '@/components/ui/box';
import { Button } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import {
  formatConnected,
  formatOptional,
  formatReachability,
  formatSignal,
  normalizeNetworkStatus,
  type NetworkStatusKind,
  type NetworkStatusView,
} from '@/lib/network-status';
import { useIconColors } from '@/lib/theme-colors';

type DetailRow = {
  label: string;
  value: string;
};

export default function WifiScreen() {
  const netInfo = useNetInfo();
  const [status, setStatus] = useState<NetworkStatusView>(() =>
    normalizeNetworkStatus(netInfo),
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const iconColors = useIconColors();

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const next = await NetInfo.refresh();
      setStatus(normalizeNetworkStatus(next));
      setLastRefreshedAt(new Date());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to refresh network state.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setStatus(normalizeNetworkStatus(netInfo));
    setLastRefreshedAt(new Date());
  }, [netInfo]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  const wirelessRows = useMemo<DetailRow[]>(
    () => [
      { label: 'SSID', value: formatOptional(status.ssid) },
      { label: 'BSSID', value: formatOptional(status.bssid) },
      {
        label: 'Frequency',
        value:
          status.frequencyMhz === null ? 'N/A' : `${status.frequencyMhz} MHz`,
      },
      {
        label: 'Link speed',
        value:
          status.linkSpeedMbps === null ? 'N/A' : `${status.linkSpeedMbps} Mbps`,
      },
      {
        label: 'RX speed',
        value:
          status.rxLinkSpeedMbps === null
            ? 'N/A'
            : `${status.rxLinkSpeedMbps} Mbps`,
      },
      {
        label: 'TX speed',
        value:
          status.txLinkSpeedMbps === null
            ? 'N/A'
            : `${status.txLinkSpeedMbps} Mbps`,
      },
    ],
    [status],
  );

  const networkRows = useMemo<DetailRow[]>(
    () => [
      { label: 'Connected', value: formatConnected(status.isConnected) },
      { label: 'Internet', value: formatReachability(status.isInternetReachable) },
      { label: 'IP address', value: formatOptional(status.ipAddress) },
      { label: 'Subnet', value: formatOptional(status.subnet) },
      {
        label: 'Wi-Fi radio',
        value:
          status.isWifiEnabled === null
            ? 'N/A'
            : status.isWifiEnabled
              ? 'On'
              : 'Off',
      },
      {
        label: 'Cost',
        value:
          status.isConnectionExpensive === null
            ? 'N/A'
            : status.isConnectionExpensive
              ? 'Expensive'
              : 'Normal',
      },
    ],
    [status],
  );

  const cellularRows = useMemo<DetailRow[]>(
    () => [
      {
        label: 'Generation',
        value: formatOptional(status.cellularGeneration?.toUpperCase() ?? null),
      },
      { label: 'Carrier', value: formatOptional(status.carrier) },
    ],
    [status],
  );

  const statusClass = getStatusClass(status.kind);
  const statusValueClass = getStatusValueClass(status.kind);
  const iconName = getStatusIcon(status.kind);
  const lastRefreshedLabel = lastRefreshedAt
    ? formatClock(lastRefreshedAt)
    : 'Pending';

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={[]}>
      <ScrollView className="flex-1 bg-background">
        <VStack className="px-5 pb-12 pt-6" space="lg">
          {errorMessage ? (
            <Alert variant="destructive" className="rounded-md">
              <AlertText>{errorMessage}</AlertText>
            </Alert>
          ) : null}

          <Box className={`rounded-md border px-4 py-4 ${statusClass}`}>
            <HStack className="items-center justify-between" space="md">
              <HStack className="min-w-0 flex-1 items-center" space="md">
                <Box className="h-11 w-11 items-center justify-center rounded-md bg-background/70">
                  <Ionicons
                    name={iconName}
                    size={22}
                    color={status.kind === 'offline' ? iconColors.destructive : iconColors.foreground}
                  />
                </Box>
                <VStack className="min-w-0 flex-1" space="xs">
                  <Text
                    className={`text-xl font-semibold ${statusValueClass}`}
                    numberOfLines={1}
                  >
                    {status.title}
                  </Text>
                  <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                    {status.subtitle}
                  </Text>
                </VStack>
              </HStack>

              <Button
                size="icon"
                variant="secondary"
                onPress={refresh}
                isDisabled={isRefreshing}
                accessibilityLabel="Refresh network status"
                className="h-11 w-11"
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={isRefreshing ? iconColors.mutedForeground : iconColors.foreground}
                />
              </Button>
            </HStack>
          </Box>

          <HStack className="overflow-hidden rounded-md border border-border bg-card/60">
            <Tile label="Type" value={status.title} first />
            <Tile label="Signal" value={formatSignal(status.wifiStrength)} />
            <Tile
              label="Internet"
              value={formatReachability(status.isInternetReachable)}
            />
            <Tile label="Refresh" value={lastRefreshedLabel} />
          </HStack>

          <VStack space="sm">
            <SectionLabel>Signal</SectionLabel>
            <SignalMeter value={status.wifiStrength} />
          </VStack>

          <VStack space="sm">
            <SectionLabel>Network</SectionLabel>
            <DetailList rows={networkRows} />
          </VStack>

          <VStack space="sm">
            <SectionLabel>Wireless</SectionLabel>
            <DetailList rows={wirelessRows} />
          </VStack>

          {status.kind === 'cellular' ? (
            <VStack space="sm">
              <SectionLabel>Cellular</SectionLabel>
              <DetailList rows={cellularRows} />
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <Box className={`min-w-0 flex-1 px-3 py-3 ${first ? '' : 'border-l border-border'}`}>
      <Text className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1.5 text-sm font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </Box>
  );
}

function SignalMeter({ value }: { value: number | null }) {
  const width = `${value ?? 0}%` as DimensionValue;
  return (
    <Box className="rounded-md border border-border bg-card px-4 py-4">
      <HStack className="items-center justify-between" space="md">
        <Text className="text-sm font-medium text-foreground">Strength</Text>
        <Text className="font-mono text-sm text-muted-foreground">
          {formatSignal(value)}
        </Text>
      </HStack>
      <Box className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <Box className="h-full rounded-full bg-primary" style={{ width }} />
      </Box>
    </Box>
  );
}

function DetailList({ rows }: { rows: DetailRow[] }) {
  return (
    <Box className="overflow-hidden rounded-md border border-border bg-card">
      {rows.map((row, index) => (
        <HStack
          key={row.label}
          className={`items-start justify-between px-4 py-3 ${
            index === 0 ? '' : 'border-t border-border'
          }`}
          space="md"
        >
          <Text className="font-mono text-[10px] uppercase text-muted-foreground">
            {row.label}
          </Text>
          <Text className="min-w-0 flex-1 text-right text-sm font-medium text-foreground" numberOfLines={2}>
            {row.value}
          </Text>
        </HStack>
      ))}
    </Box>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </Text>
  );
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusIcon(kind: NetworkStatusKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'wifi':
      return 'wifi-outline';
    case 'cellular':
      return 'cellular-outline';
    case 'offline':
      return 'cloud-offline-outline';
    case 'ethernet':
      return 'git-network-outline';
    case 'vpn':
      return 'shield-checkmark-outline';
    case 'other':
      return 'radio-outline';
    case 'unknown':
    default:
      return 'help-circle-outline';
  }
}

function getStatusClass(kind: NetworkStatusKind) {
  switch (kind) {
    case 'wifi':
      return 'border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900';
    case 'offline':
      return 'border-destructive/40 bg-destructive/10';
    default:
      return 'border-border bg-card/60';
  }
}

function getStatusValueClass(kind: NetworkStatusKind) {
  switch (kind) {
    case 'wifi':
      return 'text-emerald-950 dark:text-emerald-50';
    case 'offline':
      return 'text-destructive';
    default:
      return 'text-foreground';
  }
}
