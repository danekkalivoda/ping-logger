import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useRef, useState } from 'react';
import type { ListRenderItem, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { FlatList } from 'react-native';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const NEAR_BOTTOM_PX = 24;

const LineRow = memo(function LineRow({ line }: { line: string }) {
  return (
    <Text className="font-mono text-[12px] leading-5 text-foreground">
      {line}
    </Text>
  );
});

const renderLine: ListRenderItem<string> = ({ item }) => <LineRow line={item} />;

const keyExtractor = (item: string) => item;

export function LogView({ lines }: { lines: string[] }) {
  const listRef = useRef<FlatList<string>>(null);
  const isUserScrolling = useRef(false);
  const autoFollowRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const setAutoFollow = useCallback((next: boolean) => {
    if (autoFollowRef.current === next) return;
    autoFollowRef.current = next;
    setShowJump(!next);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (autoFollowRef.current) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!isUserScrolling.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const atBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
      setAutoFollow(atBottom);
    },
    [setAutoFollow],
  );

  const resumeAutoFollow = useCallback(() => {
    setAutoFollow(true);
    listRef.current?.scrollToEnd({ animated: false });
  }, [setAutoFollow]);

  return (
    <Box className="flex-1 bg-background">
      <FlatList
        ref={listRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={keyExtractor}
        contentContainerClassName="px-4 py-3 gap-2"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={3}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
        }}
        onScrollEndDrag={() => {
          isUserScrolling.current = false;
        }}
        onMomentumScrollEnd={() => {
          isUserScrolling.current = false;
        }}
        scrollEventThrottle={50}
      />
      {showJump ? (
        <Box
          className="absolute bottom-4 left-0 right-0 items-center"
          style={{ pointerEvents: 'box-none' }}
        >
          <Button
            onPress={resumeAutoFollow}
            accessibilityLabel="Resume auto-scroll"
            className="rounded-full border border-emerald-500/40 bg-emerald-500/90 shadow-lg"
          >
            <Ionicons name="arrow-down" size={14} color="#FFFFFF" />
            <ButtonText className="text-white">Jump to latest</ButtonText>
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
