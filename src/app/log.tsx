import { SafeAreaView } from 'react-native-safe-area-context';

import { LogView } from '@/components/app/log-view';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { useSessionStore } from '@/store/session';

export default function LogScreen() {
  const logLines = useSessionStore((state) => state.logLines);
  const isRunning = useSessionStore((state) => state.isRunning);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={['top']}>
      <Box className="flex-1 bg-background">
        {isRunning ? (
          <LogView lines={logLines} />
        ) : (
          <Box className="flex-1 items-center justify-center">
            <Text className="text-sm text-muted-foreground">
              Start a session to see the live log.
            </Text>
          </Box>
        )}
      </Box>
    </SafeAreaView>
  );
}
