const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
} = require('@expo/config-plugins');

const TAG = 'with-notifee-foreground-service';
const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const TARGET_TYPE = 'dataSync';

function upsertNotifeeService(application) {
  if (!application.service) {
    application.service = [];
  }

  const existing = application.service.find(
    (entry) => entry.$ && entry.$['android:name'] === SERVICE_NAME,
  );

  if (existing) {
    existing.$['android:foregroundServiceType'] = TARGET_TYPE;
    existing.$['tools:replace'] = 'android:foregroundServiceType';
    return;
  }

  application.service.push({
    $: {
      'android:name': SERVICE_NAME,
      'android:exported': 'false',
      'android:foregroundServiceType': TARGET_TYPE,
      'tools:replace': 'android:foregroundServiceType',
    },
  });
}

const withNotifeeForegroundService = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    manifest.manifest.$['xmlns:tools'] =
      manifest.manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    upsertNotifeeService(application);

    return cfg;
  });

module.exports = createRunOncePlugin(
  withNotifeeForegroundService,
  TAG,
  '1.0.0',
);
