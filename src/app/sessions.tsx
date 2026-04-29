import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertText } from '@/components/ui/alert';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { Toast, ToastTitle, useToast } from '@/components/ui/toast';
import { VStack } from '@/components/ui/vstack';
import {
  exportSessionFileToPublicDirectory,
  getPublicExportDirectoryLabel,
} from '@/lib/downloads-export';
import type { SessionPreview } from '@/lib/session-types';
import { clearSessionHistory, loadSessionHistory } from '@/lib/sessions';
import { useIconColors } from '@/lib/theme-colors';
import { useSessionStore } from '@/store/session';

function pad(v: number) {
  return String(v).padStart(2, '0');
}

function formatDuration(seconds: number) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(rest)}s`;
  return `${rest}s`;
}

function shortenUrl(url: string) {
  return url.replace(/^https?:\/\//, '');
}

function czechDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportDirectoryLabel, setExportDirectoryLabel] = useState(() =>
    getPublicExportDirectoryLabel(),
  );
  const iconColors = useIconColors();
  const isFocused = useIsFocused();
  const toast = useToast();

  const liveSessionId = useSessionStore((s) => s.sessionId);
  const liveIsRunning = useSessionStore((s) => s.isRunning);
  const liveRequestCount = useSessionStore((s) => s.requestCount);
  const liveErrorCount = useSessionStore((s) => s.errorCount);
  const liveAvgLatency = useSessionStore((s) => s.averageLatencyMs);
  const liveStartedAt = useSessionStore((s) => s.startedAt);
  const liveUrl = useSessionStore((s) => s.urlInput);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await loadSessionHistory();
      setSessions(next);
      setExportDirectoryLabel(getPublicExportDirectoryLabel());
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to read saved sessions.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!liveIsRunning) {
      void load();
    }
  }, [liveIsRunning, load]);

  useEffect(() => {
    if (!infoMessage) return;

    const id = `sessions-info-${Date.now()}`;
    toast.show({
      id,
      placement: 'top',
      duration: 3500,
      render: () => (
        <Toast nativeID={id} variant="solid">
          <ToastTitle className="text-foreground">{infoMessage}</ToastTitle>
        </Toast>
      ),
    });

    setInfoMessage(null);
  }, [infoMessage, toast]);

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!liveIsRunning || !isFocused) return;
    const t = setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [liveIsRunning, isFocused]);

  const merged = useMemo(() => {
    return sessions.map((session) => {
      if (
        !liveIsRunning ||
        session.id !== liveSessionId ||
        session.status !== 'incomplete'
      ) {
        return session;
      }
      const startedMs = liveStartedAt ? new Date(liveStartedAt).getTime() : Date.now();
      const durationSeconds = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
      void nowTick;
      return {
        ...session,
        url: liveUrl || session.url,
        totalRequests: liveRequestCount,
        errorCount: liveErrorCount,
        successCount: Math.max(0, liveRequestCount - liveErrorCount),
        avgLatencyMs: liveAvgLatency,
        durationLabel: formatDuration(durationSeconds),
      } satisfies SessionPreview;
    });
  }, [
    sessions,
    liveIsRunning,
    liveSessionId,
    liveStartedAt,
    liveUrl,
    liveRequestCount,
    liveErrorCount,
    liveAvgLatency,
    nowTick,
  ]);

  async function handleExport(session: SessionPreview) {
    setExportingId(session.id);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const outcome = await exportSessionFileToPublicDirectory({
        internalFileUri: session.fileUri,
        fileName: session.fileName,
      });

      if (outcome.exported) {
        setInfoMessage(`Exported to ${outcome.relativePath}.`);
        return;
      }

      if (outcome.reason === 'unsupported') {
        setErrorMessage('Public folder export is only available on Android.');
        return;
      }

      setErrorMessage(
        outcome.error
          ? `Failed to export: ${outcome.error}`
          : 'Failed to export the session.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to export the session.',
      );
    } finally {
      setExportingId(null);
    }
  }

  async function handleShare(session: SessionPreview) {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setErrorMessage('Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(session.fileUri, {
        mimeType: 'application/json',
        dialogTitle: session.fileName,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to share session file.',
      );
    }
  }

  function handleClearHistory() {
    RNAlert.alert(
      'Delete all history?',
      'All saved session files will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSessionHistory();
              await load();
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : 'Failed to delete history.',
              );
            }
          },
        },
      ],
    );
  }

  const hasSessions = merged.length > 0;

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={[]}>
      <ScrollView className="flex-1 bg-background">
        {errorMessage ? (
          <Box className="px-5 pt-6">
            <Alert variant="destructive" className="rounded-md">
              <AlertText>{errorMessage}</AlertText>
            </Alert>
          </Box>
        ) : null}

        {isLoading && sessions.length === 0 ? (
          <Box className="px-5 pt-6">
            <Text className="text-sm text-muted-foreground">Loading session files...</Text>
          </Box>
        ) : null}

        {!isLoading && !errorMessage && sessions.length === 0 ? (
          <VStack className="px-5 pt-6" space="sm">
            <Heading size="md" className="text-foreground">
              No sessions yet
            </Heading>
            <Text className="text-sm text-muted-foreground">
              Start and stop a session to create the first JSONL log file.
            </Text>
          </VStack>
        ) : null}

        {hasSessions ? (
          <Accordion type="multiple" isCollapsible className="bg-transparent">
            {merged.map((session, idx) => {
              const isLive =
                liveIsRunning &&
                session.id === liveSessionId &&
                session.status === 'incomplete';
              const isIncomplete = session.status === 'incomplete';
              const successRatio =
                session.totalRequests > 0
                  ? Math.round((session.successCount / session.totalRequests) * 100)
                  : 0;
              return (
                <AccordionItem
                  key={session.id}
                  value={session.id}
                  className={idx > 0 ? 'border-t border-border/40' : ''}
                >
                  <AccordionHeader className="px-5 py-0">
                    <AccordionTrigger className="py-3">
                      {({ isExpanded }: { isExpanded: boolean }) => (
                        <>
                          <HStack className="flex-1 items-center" space="sm">
                            <Box
                              className={`h-2 w-2 rounded-full ${
                                isLive
                                  ? 'bg-emerald-500'
                                  : isIncomplete
                                    ? 'bg-destructive'
                                    : 'bg-muted-foreground/50'
                              }`}
                            />
                            <VStack className="flex-1" space="xs">
                              <Text
                                className="text-sm text-foreground"
                                numberOfLines={1}
                              >
                                {shortenUrl(session.url)}
                              </Text>
                              <Text className="font-mono text-[12px] uppercase text-muted-foreground">
                                {czechDateTime(session.startedAt)} · {session.totalRequests} req
                                {isLive ? ' · live' : ''}
                              </Text>
                            </VStack>
                          </HStack>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={iconColors.mutedForeground}
                          />
                        </>
                      )}
                    </AccordionTrigger>
                  </AccordionHeader>
                  <AccordionContent className="pl-5 pb-6">
                    <VStack space="sm">
                      <HStack className="flex-wrap gap-2">
                        <DetailTile label="Duration" value={session.durationLabel} />
                        <DetailTile
                          label="Requests"
                          value={String(session.totalRequests)}
                        />
                        <DetailTile label="Success" value={`${successRatio}%`} />
                        <DetailTile
                          label="Avg latency"
                          value={`${session.avgLatencyMs}ms`}
                        />
                        <DetailTile label="Errors" value={String(session.errorCount)} />
                      </HStack>
                      <Button
                        variant="outline"
                        onPress={() => handleShare(session)}
                        isDisabled={isLive}
                        accessibilityLabel="Share session file"
                      >
                        <Ionicons name="share-outline" size={16} color={iconColors.foreground} />
                        <ButtonText>Share file</ButtonText>
                      </Button>
                      <Button
                        variant="outline"
                        onPress={() => handleExport(session)}
                        isDisabled={isLive || exportingId === session.id}
                        accessibilityLabel="Export session file to Downloads"
                      >
                        <Ionicons name="download-outline" size={16} color={iconColors.foreground} />
                        <ButtonText>
                          {exportingId === session.id ? 'Exporting…' : 'Export'}
                        </ButtonText>
                      </Button>
                    </VStack>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : null}

        {hasSessions ? (
          <Box className="px-5 pb-10 pt-6">
            <Button
              variant="outline"
              onPress={handleClearHistory}
              accessibilityLabel="Delete all sessions"
              className="border-destructive/40"
            >
              <Ionicons name="trash-outline" size={16} color={iconColors.destructive} />
              <ButtonText className="text-destructive">Delete all history</ButtonText>
            </Button>
          </Box>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <Box className="min-w-[30%] rounded-md px-4 py-2">
      <Text className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm text-foreground">{value}</Text>
    </Box>
  );
}
