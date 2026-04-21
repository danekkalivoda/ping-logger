---
name: ping-logger-release
description: Release workflow for the local ping-logger project. Use when the user asks to release, ship, build a distributable app, create an APK, produce an iOS .app bundle, bump versions, sync package or bundle identifiers, or prepare this app for sending to someone.
user-invocable: true
---

# Ping Logger Release

Use this skill only inside the `ping-logger` repository.

## Default target

- Default to `android-apk`.
- Use `ios-app` only if the user explicitly asks for an iOS `.app`.
- For iOS, produce both the `.app` bundle and a `.zip` wrapper so the result is easy to send.

## Required inputs

- If the user gives an explicit version, pass it through with `--version x.y.z`.
- Otherwise default to `--bump patch`.
- Reuse the configured app identifiers from `.codex/release.json` unless the user explicitly asks to change them.

## Workflow

1. Read `.codex/release.json`, `package.json`, and `app.json`.
2. Run the release script:
   - Android: `bun run release:android -- --bump patch`
   - iOS app: `bun run release:ios:app -- --bump patch`
3. Prefer `--version`, `--build-number`, `--app-id`, `--ios-bundle-id`, or `--android-application-id` only when the user asks for those changes.
4. Report:
   - final semantic version
   - build number / version code
   - artifact path in `dist/releases/`
   - any identifier mismatch or placeholder identifier warning

## Validation

- Keep the script defaults unless the user asks to skip checks.
- The script already runs `bunx tsc --noEmit` and `bun run lint` before building.
- If the build fails, surface the exact failing step and do not claim the release completed.

## Project-specific notes

- This app is Android-first. The PRD and current runtime behavior are aligned around APK distribution.
- The current default identifiers are still placeholder values (`com.anonymous.pinglogger`). Warn when releasing with them, but do not silently invent a new identifier.
- The iOS workflow builds an unsigned Release bundle. Make it clear that it is not App Store/TestFlight output and may require signing or re-signing before installation on real devices.
