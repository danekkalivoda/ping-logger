# ping-logger — Project Notes

- When the user asks to release, ship, build a distributable app, APK, or iOS `.app`, use the local skill at `.codex/skills/ping-logger-release/SKILL.md`.
- Default release target is `android-apk`. Only use `ios-app` when the user explicitly asks for an iOS `.app`; the workflow produces an unsigned `.app` bundle plus a `.zip` for sharing.
