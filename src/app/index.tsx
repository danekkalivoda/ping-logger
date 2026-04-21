import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from '@/components/ui/accordion';
import { Alert, AlertText } from '@/components/ui/alert';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { Toast, ToastTitle, useToast } from '@/components/ui/toast';
import { VStack } from '@/components/ui/vstack';
import { useSessionStore } from '@/store/session';

export default function SessionScreen() {
  const urlInput = useSessionStore((s) => s.urlInput);
  const intervalInput = useSessionStore((s) => s.intervalInput);
  const isBusy = useSessionStore((s) => s.isBusy);
  const isRunning = useSessionStore((s) => s.isRunning);
  const requestCount = useSessionStore((s) => s.requestCount);
  const errorCount = useSessionStore((s) => s.errorCount);
  const averageLatencyMs = useSessionStore((s) => s.averageLatencyMs);
  const errorMessage = useSessionStore((s) => s.errorMessage);
  const infoMessage = useSessionStore((s) => s.infoMessage);
  const sessionSavedAt = useSessionStore((s) => s.sessionSavedAt);
  const setUrlInput = useSessionStore((s) => s.setUrlInput);
  const setIntervalInput = useSessionStore((s) => s.setIntervalInput);
  const startSession = useSessionStore((s) => s.startSession);
  const stopSession = useSessionStore((s) => s.stopSession);

  const toast = useToast();
  const lastToastAt = useRef<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (sessionSavedAt && sessionSavedAt !== lastToastAt.current) {
      lastToastAt.current = sessionSavedAt;
      const id = `saved-${sessionSavedAt}`;
      toast.show({
        id,
        placement: 'top',
        duration: 2500,
        render: () => (
          <Toast nativeID={id} variant="solid" className="border-emerald-500/40">
            <ToastTitle className="text-foreground">Session saved</ToastTitle>
          </Toast>
        ),
      });
    }
  }, [sessionSavedAt, toast]);

  useEffect(() => {
    if (!infoMessage) return;
    const id = `info-${Date.now()}`;
    toast.show({
      id,
      placement: 'top',
      duration: 4000,
      render: () => (
        <Toast nativeID={id} variant="solid">
          <ToastTitle className="text-foreground">{infoMessage}</ToastTitle>
        </Toast>
      ),
    });
    useSessionStore.setState({ infoMessage: null });
  }, [infoMessage, toast]);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={['top']}>
      <ScrollView className="flex-1 bg-background">
        <VStack className="px-5 pb-12 pt-4" space="md">
          <HStack
            className={`rounded-md border overflow-hidden ${
              isRunning
                ? 'bg-emerald-900 border-emerald-800'
                : 'bg-card/60 border-border'
            }`}
          >
            <Tile
              label="Requests"
              value={String(requestCount)}
              first
              running={isRunning}
            />
            <Tile label="Errors" value={String(errorCount)} running={isRunning} />
            <Tile
              label="Interval"
              value={`${intervalInput || '1000'}ms`}
              running={isRunning}
            />
            <Tile
              label="Avg"
              value={`${averageLatencyMs}ms`}
              running={isRunning}
            />
          </HStack>

          <VStack space="md">
            {errorMessage ? (
              <Alert variant="destructive" className="rounded-md">
                <AlertText className="text-destructive">{errorMessage}</AlertText>
              </Alert>
            ) : null}

            <HStack space="sm" className="items-center">
              <Box className="flex-1">
                <Input className="min-h-12 rounded-md border-border bg-background">
                  <InputField
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="status.example.com/health"
                    value={urlInput}
                    onChangeText={setUrlInput}
                  />
                </Input>
              </Box>
              <Button
                size="icon"
                variant="secondary"
                onPress={() => setAdvancedOpen((v) => !v)}
                accessibilityLabel="Advanced options"
                className="h-12 w-12"
              >
                <Ionicons
                  name="settings-outline"
                  size={16}
                  color={advancedOpen ? '#FFFFFF' : 'rgb(127,151,155)'}
                />
              </Button>
            </HStack>

            <Accordion
              type="single"
              value={advancedOpen ? ['advanced'] : []}
              className="bg-transparent space-y-0"
            >
              <AccordionItem value="advanced">
                <AccordionContent className="pb-0">
                  <HStack space="sm" className="items-center">
                    <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-24">
                      Interval ms
                    </Text>
                    <Box className="flex-1">
                      <Input className="min-h-12 rounded-md border-border bg-background mb-3">
                        <InputField
                          keyboardType="number-pad"
                          placeholder="1000"
                          value={intervalInput}
                          onChangeText={setIntervalInput}
                        />
                      </Input>
                    </Box>
                  </HStack>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Button
              variant="default"
              className="-mt-3"
              onPress={isRunning ? stopSession : startSession}
              isDisabled={isBusy}
            >
              <ButtonText>
                {isRunning
                    ? 'Stop session'
                    : 'Start requesting'}
              </ButtonText>
            </Button>
          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({
  label,
  value,
  first = false,
  running = false,
}: {
  label: string;
  value: string;
  first?: boolean;
  running?: boolean;
}) {
  const divider = first
    ? ''
    : running
      ? 'border-l border-emerald-800'
      : 'border-l border-border';
  const labelClass = running ? 'text-emerald-300' : 'text-muted-foreground';
  const valueClass = running ? 'text-emerald-50' : 'text-foreground';

  return (
    <Box className={`min-w-0 flex-1 py-3 px-4 ${divider}`}>
      <Text
        className={`font-mono text-[10px] uppercase ${labelClass}`}
      >
        {label}
      </Text>
      <Text
        className={`mt-1.5 text-base font-semibold ${valueClass}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </Box>
  );
}
