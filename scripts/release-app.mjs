#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PATHS = {
  config: join(ROOT, '.codex', 'release.json'),
  packageJson: join(ROOT, 'package.json'),
  appJson: join(ROOT, 'app.json'),
  androidGradle: join(ROOT, 'android', 'app', 'build.gradle'),
  androidMainActivity: join(
    ROOT,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'anonymous',
    'pinglogger',
    'MainActivity.kt',
  ),
  androidMainApplication: join(
    ROOT,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'anonymous',
    'pinglogger',
    'MainApplication.kt',
  ),
  iosPbxproj: join(ROOT, 'ios', 'PingLogger.xcodeproj', 'project.pbxproj'),
  iosInfoPlist: join(ROOT, 'ios', 'PingLogger', 'Info.plist'),
};

const args = process.argv.slice(2);
const options = {
  target: null,
  version: null,
  bump: 'patch',
  buildNumber: null,
  appId: null,
  iosBundleId: null,
  androidApplicationId: null,
  skipVerify: false,
  syncOnly: false,
  help: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const next = args[index + 1];

  switch (arg) {
    case '--target':
      options.target = next;
      index += 1;
      break;
    case '--version':
      options.version = next;
      index += 1;
      break;
    case '--bump':
      options.bump = next;
      index += 1;
      break;
    case '--build-number':
      options.buildNumber = next;
      index += 1;
      break;
    case '--app-id':
      options.appId = next;
      index += 1;
      break;
    case '--ios-bundle-id':
      options.iosBundleId = next;
      index += 1;
      break;
    case '--android-application-id':
      options.androidApplicationId = next;
      index += 1;
      break;
    case '--skip-verify':
      options.skipVerify = true;
      break;
    case '--sync-only':
      options.syncOnly = true;
      break;
    case '--help':
    case '-h':
      options.help = true;
      break;
    default:
      throw new Error(`Unknown argument: ${arg}`);
  }
}

if (options.help) {
  console.log(`Usage:
  node scripts/release-app.mjs --target android-apk [--version 0.1.1 | --bump patch] [--build-number 2]
  node scripts/release-app.mjs --target ios-app [--version 0.1.1 | --bump patch] [--build-number 2]

Options:
  --target android-apk|ios-app
  --version x.y.z
  --bump major|minor|patch|none
  --build-number N
  --app-id com.example.app
  --ios-bundle-id com.example.app
  --android-application-id com.example.app
  --skip-verify
  --sync-only
`);
  process.exit(0);
}

const config = readJson(PATHS.config);
const packageJson = readJson(PATHS.packageJson);
const appJson = readJson(PATHS.appJson);

const currentVersion = packageJson.version ?? appJson.expo?.version;
if (!currentVersion) {
  throw new Error('Unable to determine the current app version.');
}

const currentAndroidVersionCode =
  appJson.expo?.android?.versionCode ?? extractInteger(readText(PATHS.androidGradle), /versionCode\s+(\d+)/);
const currentIosBuildNumber =
  appJson.expo?.ios?.buildNumber ??
  extractText(readText(PATHS.iosPbxproj), /CURRENT_PROJECT_VERSION = ([^;]+);/);

const nextVersion = options.version ?? bumpSemver(currentVersion, options.bump);
const nextBuildNumber = String(
  options.buildNumber
    ? parsePositiveInteger(options.buildNumber, '--build-number')
    : Math.max(
        parsePositiveInteger(String(currentAndroidVersionCode ?? 1), 'android versionCode'),
        parsePositiveInteger(String(currentIosBuildNumber ?? 1), 'iOS build number'),
      ) + 1,
);

const androidApplicationId =
  options.androidApplicationId ?? options.appId ?? config.android?.applicationId;
const iosBundleIdentifier =
  options.iosBundleId ?? options.appId ?? config.ios?.bundleIdentifier;
const target = options.target ?? config.defaultTarget ?? 'android-apk';

if (!['android-apk', 'ios-app'].includes(target)) {
  throw new Error(`Unsupported target: ${target}`);
}

syncMetadata({
  packageJson,
  appJson,
  version: nextVersion,
  buildNumber: nextBuildNumber,
  androidApplicationId,
  iosBundleIdentifier,
});

if (!options.skipVerify) {
  runCommand('bunx', ['tsc', '--noEmit']);
  runCommand('bun', ['run', 'lint']);
}

let artifactPaths = [];
if (!options.syncOnly) {
  artifactPaths =
    target === 'android-apk'
      ? buildAndroidApk({
          version: nextVersion,
          buildNumber: nextBuildNumber,
          artifactDir: join(ROOT, config.artifactDir),
          displayName: config.displayName ?? 'PingLogger',
        })
      : buildIosApp({
          version: nextVersion,
          buildNumber: nextBuildNumber,
          artifactDir: join(ROOT, config.artifactDir),
          displayName: config.displayName ?? 'PingLogger',
          workspace: config.ios?.workspace,
          scheme: config.ios?.scheme,
          productName: config.ios?.productName ?? 'PingLogger',
        });
}

const warnings = [];
for (const placeholderId of config.placeholderIds ?? []) {
  if (config.warnOnPlaceholderId && [androidApplicationId, iosBundleIdentifier].includes(placeholderId)) {
    warnings.push(
      `Placeholder app identifier still in use: ${placeholderId}. Set a real identifier before wider external distribution.`,
    );
  }
}

const releaseManifestPath = writeReleaseManifest({
  version: nextVersion,
  buildNumber: nextBuildNumber,
  target,
  artifactPaths,
  androidApplicationId,
  iosBundleIdentifier,
  warnings,
});

console.log('');
console.log(`Release target: ${target}`);
console.log(`Version: ${nextVersion}`);
console.log(`Build number: ${nextBuildNumber}`);
console.log(`Android applicationId: ${androidApplicationId}`);
console.log(`iOS bundleIdentifier: ${iosBundleIdentifier}`);
if (artifactPaths.length > 0) {
  for (const artifactPath of artifactPaths) {
    console.log(`Artifact: ${artifactPath}`);
  }
}
console.log(`Release manifest: ${releaseManifestPath}`);
if (warnings.length > 0) {
  console.log('');
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

function syncMetadata({
  packageJson: packageData,
  appJson: appData,
  version,
  buildNumber,
  androidApplicationId: androidId,
  iosBundleIdentifier: iosId,
}) {
  packageData.version = version;
  writeJson(PATHS.packageJson, packageData);

  const nextAppJson = structuredClone(appData);
  nextAppJson.expo.version = version;
  nextAppJson.expo.ios = nextAppJson.expo.ios ?? {};
  nextAppJson.expo.android = nextAppJson.expo.android ?? {};
  nextAppJson.expo.ios.buildNumber = buildNumber;
  nextAppJson.expo.android.versionCode = Number(buildNumber);
  if (iosId) {
    nextAppJson.expo.ios.bundleIdentifier = iosId;
  }
  if (androidId) {
    nextAppJson.expo.android.package = androidId;
  }
  writeJson(PATHS.appJson, nextAppJson);

  let gradleText = readText(PATHS.androidGradle);
  gradleText = replaceOne(gradleText, /versionCode\s+\d+/, `versionCode ${buildNumber}`);
  gradleText = replaceOne(gradleText, /versionName\s+"[^"]+"/, `versionName "${version}"`);
  if (androidId) {
    gradleText = replaceOne(gradleText, /namespace\s+'[^']+'/, `namespace '${androidId}'`);
    gradleText = replaceOne(gradleText, /applicationId\s+'[^']+'/, `applicationId '${androidId}'`);
    updateAndroidPackageDeclaration(PATHS.androidMainActivity, androidId);
    updateAndroidPackageDeclaration(PATHS.androidMainApplication, androidId);
  }
  writeText(PATHS.androidGradle, gradleText);

  let pbxprojText = readText(PATHS.iosPbxproj);
  pbxprojText = replaceAllMatches(
    pbxprojText,
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${version};`,
  );
  pbxprojText = replaceAllMatches(
    pbxprojText,
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
  );
  if (iosId) {
    pbxprojText = replaceAllMatches(
      pbxprojText,
      /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
      `PRODUCT_BUNDLE_IDENTIFIER = ${iosId};`,
    );
  }
  writeText(PATHS.iosPbxproj, pbxprojText);

  let infoPlistText = readText(PATHS.iosInfoPlist);
  infoPlistText = replaceInfoPlistValue(
    infoPlistText,
    'CFBundleShortVersionString',
    version,
  );
  infoPlistText = replaceInfoPlistValue(infoPlistText, 'CFBundleVersion', buildNumber);
  if (iosId) {
    infoPlistText = infoPlistText.replaceAll(
      appData.expo?.ios?.bundleIdentifier ?? iosId,
      iosId,
    );
  }
  writeText(PATHS.iosInfoPlist, infoPlistText);
}

function buildAndroidApk({ version, buildNumber, artifactDir, displayName }) {
  runCommand(
    './gradlew',
    ['app:assembleRelease', '-x', 'lint', '-x', 'test', '--configure-on-demand', '--build-cache'],
    { cwd: join(ROOT, 'android') },
  );

  const sourceApk = join(
    ROOT,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk',
  );
  if (!existsSync(sourceApk)) {
    throw new Error(`Release APK was not produced at ${sourceApk}`);
  }

  mkdirSync(artifactDir, { recursive: true });
  const artifactName = `${sanitizeFileName(displayName)}-${version}+${buildNumber}-android.apk`;
  const artifactPath = join(artifactDir, artifactName);
  cpSync(sourceApk, artifactPath);
  return [artifactPath];
}

function buildIosApp({
  version,
  buildNumber,
  artifactDir,
  displayName,
  workspace,
  scheme,
  productName,
}) {
  if (!workspace || !scheme) {
    throw new Error('Missing iOS workspace or scheme in .codex/release.json');
  }

  const derivedDataPath = join(ROOT, 'ios', 'build', 'release-device');
  rmSync(derivedDataPath, { recursive: true, force: true });
  runCommand(
    'xcodebuild',
    [
      '-workspace',
      workspace,
      '-scheme',
      scheme,
      '-configuration',
      'Release',
      '-sdk',
      'iphoneos',
      '-derivedDataPath',
      derivedDataPath,
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
      'build',
    ],
    { cwd: ROOT },
  );

  const sourceApp = join(
    derivedDataPath,
    'Build',
    'Products',
    'Release-iphoneos',
    `${productName}.app`,
  );
  if (!existsSync(sourceApp)) {
    throw new Error(`Release app bundle was not produced at ${sourceApp}`);
  }

  mkdirSync(artifactDir, { recursive: true });
  const baseName = `${sanitizeFileName(displayName)}-${version}+${buildNumber}-ios-unsigned`;
  const copiedAppPath = join(artifactDir, `${baseName}.app`);
  const zipPath = join(artifactDir, `${baseName}.zip`);
  rmSync(copiedAppPath, { recursive: true, force: true });
  rmSync(zipPath, { recursive: true, force: true });
  cpSync(sourceApp, copiedAppPath, { recursive: true });
  runCommand('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', copiedAppPath, zipPath]);
  return [copiedAppPath, zipPath];
}

function writeReleaseManifest({
  version,
  buildNumber,
  target,
  artifactPaths,
  androidApplicationId,
  iosBundleIdentifier,
  warnings,
}) {
  const artifactDir = join(ROOT, config.artifactDir);
  mkdirSync(artifactDir, { recursive: true });
  const manifestPath = join(
    artifactDir,
    `${sanitizeFileName(config.displayName ?? 'PingLogger')}-${version}+${buildNumber}.${target}.release.json`,
  );
  const manifest = {
    generatedAt: new Date().toISOString(),
    target,
    version,
    buildNumber,
    androidApplicationId,
    iosBundleIdentifier,
    artifactPaths,
    artifactSha256: artifactPaths.map((artifactPath) => ({
      path: artifactPath,
      sha256: existsSync(artifactPath) ? sha256ForPath(artifactPath) : null,
    })),
    warnings,
  };
  writeJson(manifestPath, manifest);
  return manifestPath;
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function writeText(path, value) {
  writeFileSync(path, value, 'utf8');
}

function runCommand(command, commandArgs, extraOptions = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    ...extraOptions,
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${commandArgs.join(' ')}), exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function bumpSemver(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Version must be x.y.z, got: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'none':
      return version;
    default:
      throw new Error(`Unsupported bump kind: ${bump}`);
  }
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

function extractInteger(text, pattern) {
  const value = extractText(text, pattern);
  return value ? parsePositiveInteger(value, pattern.toString()) : null;
}

function extractText(text, pattern) {
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

function replaceOne(text, pattern, replacement) {
  if (!pattern.test(text)) {
    throw new Error(`Pattern not found: ${pattern}`);
  }
  return text.replace(pattern, replacement);
}

function replaceAllMatches(text, pattern, replacement) {
  const matcher = new RegExp(pattern.source, pattern.flags);
  if (!matcher.test(text)) {
    throw new Error(`Pattern not found: ${pattern}`);
  }
  return text.replaceAll(matcher, replacement);
}

function replaceInfoPlistValue(text, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
  if (!pattern.test(text)) {
    throw new Error(`Info.plist key not found: ${key}`);
  }
  return text.replace(pattern, `$1${value}$3`);
}

function updateAndroidPackageDeclaration(path, packageName) {
  if (!existsSync(path)) {
    return;
  }

  const text = readText(path);
  writeText(path, replaceOne(text, /^package\s+.+$/m, `package ${packageName}`));
}

function sanitizeFileName(value) {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-');
}

function sha256ForPath(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return null;
  }
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
