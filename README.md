# Ping Logger

Expo SDK 55 utility app for continuous URL pinging with JSONL session logs and Android foreground-service execution.

## Bun workflow

Install dependencies:

```bash
bun install
```

Start the dev server:

```bash
bun run start
```

Useful Bun-first commands:

```bash
bun run lint
bunx tsc --noEmit
bunx expo-doctor
bunx expo prebuild
bunx expo run:android
```

## Notes

- The repo is standardized on Bun. Use `bun`, `bun run`, and `bunx` instead of `npm`, `npx`, or Yarn.
- Expo CLI is available through `bunx expo ...`, so no global `expo` install is required.
- If you want to reset the starter scaffold utility, use `bun run reset-project`.
