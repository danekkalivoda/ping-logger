import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert, AlertText } from '@/components/ui/alert';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { Toast, ToastTitle, useToast } from '@/components/ui/toast';
import { VStack } from '@/components/ui/vstack';
import {
  formatDeviceLabel,
  getDeviceIdentity,
  saveDeviceName,
  type DeviceIdentity,
} from '@/lib/device-identity';
import {
  getPublicExportDirectoryLabel,
  getPublicExportSettings,
  savePublicExportSettings,
  type PublicExportRootDirectory,
  type PublicExportSettings,
} from '@/lib/downloads-export';
import { useIconColors } from '@/lib/theme-colors';
import { usePreferencesStore } from '@/store/preferences';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<PublicExportSettings>(() =>
    getPublicExportSettings(),
  );
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity>(() =>
    getDeviceIdentity(),
  );
  const [deviceNameInput, setDeviceNameInput] = useState(deviceIdentity.deviceName);
  const [subdirectoryInput, setSubdirectoryInput] = useState(settings.subdirectory);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const toast = useToast();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const loadSettings = useCallback(() => {
    const next = getPublicExportSettings();
    const nextIdentity = getDeviceIdentity();
    setSettings(next);
    setDeviceIdentity(nextIdentity);
    setDeviceNameInput(nextIdentity.deviceName);
    setSubdirectoryInput(next.subdirectory);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      setInfoMessage(null);
    }, [loadSettings]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!infoMessage) return;

      const id = `settings-info-${Date.now()}`;
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
    }, [infoMessage, toast]),
  );

  function handleRootChange(rootDirectory: PublicExportRootDirectory) {
    setSettings((current) => ({ ...current, rootDirectory }));
    setInfoMessage(null);
  }

  function handleSave() {
    const saved = savePublicExportSettings({
      rootDirectory: settings.rootDirectory,
      subdirectory: subdirectoryInput,
    });

    setSettings(saved);
    setSubdirectoryInput(saved.subdirectory);
    setInfoMessage(`Export location saved: ${getPublicExportDirectoryLabel(saved)}.`);
  }

  function handleSaveDeviceName() {
    const saved = saveDeviceName(deviceNameInput);
    setDeviceIdentity(saved);
    setDeviceNameInput(saved.deviceName);
    setInfoMessage(`Device label saved: ${saved.deviceLabel}.`);
  }

  const destinationLabel = getPublicExportDirectoryLabel({
    rootDirectory: settings.rootDirectory,
    subdirectory: subdirectoryInput,
  });
  const deviceLabelPreview = formatDeviceLabel(
    deviceNameInput,
    deviceIdentity.deviceId,
  );

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={[]}>
      <ScrollView className="flex-1 bg-background">
        <VStack className="px-5 pb-12 pt-6" space="lg">
          <VStack space="xs">
            <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Appearance
            </Text>
            <HStack space="sm">
              <OptionButton
                active={themeMode === 'auto'}
                icon="contrast-outline"
                label="Auto"
                onPress={() => setThemeMode('auto')}
              />
              <OptionButton
                active={themeMode === 'light'}
                icon="sunny-outline"
                label="Light"
                onPress={() => setThemeMode('light')}
              />
              <OptionButton
                active={themeMode === 'dark'}
                icon="moon-outline"
                label="Dark"
                onPress={() => setThemeMode('dark')}
              />
            </HStack>
          </VStack>

          <VStack space="md">
            <VStack space="xs">
              <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Device identity
              </Text>
              <Input className="min-h-12 rounded-md border-border bg-card">
                <InputField
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="otter"
                  value={deviceNameInput}
                  onChangeText={setDeviceNameInput}
                />
              </Input>
              <Text className="text-xs text-muted-foreground">
                Cloud label: {deviceLabelPreview}
              </Text>
              <Text className="font-mono text-[10px] leading-4 text-muted-foreground">
                Device key: {deviceIdentity.deviceId}
              </Text>
            </VStack>

            <Button variant="outline" onPress={handleSaveDeviceName}>
              <ButtonText>Save device name</ButtonText>
            </Button>
          </VStack>

          {Platform.OS !== 'android' ? (
            <Alert variant="default" className="rounded-md">
              <AlertText>Public folder export is currently supported only on Android.</AlertText>
            </Alert>
          ) : null}

          <VStack
            space="md"
          >
            <VStack space="xs">
              <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Public root
              </Text>
              <HStack space="sm">
                <OptionButton
                  active={settings.rootDirectory === 'downloads'}
                  icon="download-outline"
                  label="Downloads"
                  onPress={() => handleRootChange('downloads')}
                />
                <OptionButton
                  active={settings.rootDirectory === 'documents'}
                  icon="document-text-outline"
                  label="Documents"
                  onPress={() => handleRootChange('documents')}
                />
              </HStack>
            </VStack>

            <VStack space="xs">
              <Text className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                App subfolder
              </Text>
              <Input className="min-h-12 rounded-md border-border bg-card">
                <InputField
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="PingLogger"
                  value={subdirectoryInput}
                  onChangeText={setSubdirectoryInput}
                />
              </Input>
              <Text className="text-xs text-muted-foreground">
                Preview: {destinationLabel}
              </Text>
            </VStack>

            <Button onPress={handleSave} isDisabled={Platform.OS !== 'android'}>
              <ButtonText>Save export location</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const iconColors = useIconColors();
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      onPress={onPress}
      className="flex-1 will-change-variable"
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? iconColors.primaryForeground : iconColors.mutedForeground}
      />
      <ButtonText>{label}</ButtonText>
    </Button>
  );
}
