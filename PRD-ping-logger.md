# PRD: Ping Logger

*Pracovní název. Malá utilitární aplikace pro kontinuální pingání URL a ukládání logů na zařízení.*

---

## 1. Přehled a cíl

Single-purpose Android (a potenciálně iOS) aplikace. Uživatel zadá URL, spustí pingání, vidí log v reálném čase. Pingování běží i při minimalizaci díky foreground service s perzistentní notifikací. Každý start→stop cyklus je jedna **session** uložená jako samostatný soubor přístupný ze zařízení (sdílet e-mailem, přenést přes USB, atd.).

**Nemá to být:** produkt v App Store, multi-user nástroj, cloudová služba.
**Má to být:** APK, který pošlu někomu nebo si nainstaluju sám, a který spolehlivě dělá svou jednu věc.

## 2. Cílová platforma a distribuce

- **Primárně:** Android 8.0 (API 26) a vyšší
- **Sekundárně:** iOS — není v MVP, stack a architektura ale zůstávají kompatibilní
- **Distribuce:** APK soubor, žádný obchod
- **Build:** EAS Build — `eas build -p android --profile preview` → APK ke stažení

## 3. Technologický stack

| Vrstva | Technologie | Poznámka |
|---|---|---|
| Framework | **Expo SDK 50+** + Dev Client | Ne Expo Go — potřebujeme native moduly pro foreground service |
| Jazyk | TypeScript | |
| UI komponenty | **Gluestack UI v5** (alpha) | Copy-paste komponenty do `components/ui/*` |
| Styling engine | **NativeWind v5** (Tailwind CSS v4) | Doporučeno pro v5. Alternativa: UniWind (Expo-only) |
| State | Zustand nebo React Context | Stačí lehký přístup |
| HTTP | `fetch` | Žádná externí knihovna není potřeba |
| Filesystem | `expo-file-system` | |
| Notifikace + foreground service | **`@notifee/react-native`** | Prvotřídní podpora Android foreground service, lepší než pure `expo-notifications` |
| Perzistence preferencí | `AsyncStorage` (`@react-native-async-storage/async-storage`) | Naposledy zadaná URL, interval |
| Sdílení souborů | `expo-sharing` | Share sheet pro session soubor |

### 3.1 Požadavky prostředí (z Gluestack v5 docs)

| Package | Supported Versions |
|---|---|
| expo | >= 50 |
| react-native | >= 0.72.5 |
| node | > 16 |

> **Pozor:** Gluestack v5 je v době psaní v **alpha** (publish tag `@alpha`). Pro stabilní produkci zvažte v4, ale pro malou utilitní app je v5 v pohodě.

## 4. Setup projektu — krok za krokem

### 4.1 Vytvoření Expo projektu

```bash
# TypeScript template, managed workflow
npx create-expo-app@latest ping-logger --template blank-typescript
cd ping-logger
```

> **Bez mezer v názvu složky!** Gluestack v5 + NativeWind má známý bug, kdy cesta s mezerami způsobí, že build zůstane stát na `tailwindcss(ios) rebuilding...`.

### 4.2 Inicializace Gluestack v5

```bash
npx gluestack-ui@alpha init --nativewind-v5
```

Co tenhle příkaz udělá:

- vytvoří `components/ui/` složku a do ní `GluestackUIProvider`
- nainstaluje **core komponenty** automaticky: `icon`, `overlay`, `toast`
- přidá/upraví: `metro.config.js`, `babel.config.js`, `global.css`, `tsconfig.json`, `tailwind.config.js`, entry file
- vygeneruje `gluestack-ui.config.json` v rootu
- nainstaluje peer dependencies (`nativewind@^5.0.0-preview.x`, `react-native-css`, `tailwindcss@v4`, `@tailwindcss/postcss`, `lightningcss@1.30.1`)

**Volby styling enginu při initu:**

- `--nativewind-v5` — NativeWind v5 + Tailwind v4 (doporučené pro nový projekt)
- `--nativewind` — NativeWind v4 + Tailwind v3 (zpětná kompatibilita)
- `--uniwind` — UniWind + Tailwind v4, **Expo-only**, bez PostCSS build stepu (jednodušší, ale omezené)

### 4.3 Instalace komponent potřebných pro Ping Logger

Každou spouštějte samostatně (CLI zvládá závislosti):

```bash
# Typography & layout
npx gluestack-ui@alpha add heading
npx gluestack-ui@alpha add text
npx gluestack-ui@alpha add box
npx gluestack-ui@alpha add vstack
npx gluestack-ui@alpha add hstack
npx gluestack-ui@alpha add divider

# Forms (hlavní interakce)
npx gluestack-ui@alpha add button
npx gluestack-ui@alpha add input
npx gluestack-ui@alpha add form-control
npx gluestack-ui@alpha add pressable

# Feedback & stav
npx gluestack-ui@alpha add badge
npx gluestack-ui@alpha add spinner
npx gluestack-ui@alpha add alert

# Data display
npx gluestack-ui@alpha add card

# (Už nainstalované při init, jen pro jistotu)
# - icon
# - toast
```

**Zkratka — instalace všech v jedné dávce:**

```bash
npx gluestack-ui@alpha add --all
```

> Stáhne vše (~30 komponent), ale přidá to jen pár souborů navíc. Pro single-purpose app je rychlejší než vyjmenovávat po jednom.

### 4.4 Instalace dalších závislostí

```bash
# Filesystem, sharing, notifikace, persistence
npx expo install expo-file-system expo-sharing @react-native-async-storage/async-storage

# Notifee pro Android foreground service
npm install @notifee/react-native --legacy-peer-deps

# State management
npm install zustand --legacy-peer-deps
```

> Flag `--legacy-peer-deps` řeší občasné peer dependency konflikty s NativeWind v5 alpha.

### 4.5 Build & run

```bash
# Dev Client (potřebujeme kvůli @notifee a foreground service)
npx expo prebuild --clean
npx expo run:android

# Produkční APK
eas build -p android --profile preview
```

## 5. Gluestack v5 — import patterny

Všechny komponenty se importují z lokální `components/ui/*` cesty. Nejde o import z `@gluestack-ui/*` package — to je copy-paste model à la shadcn.

```tsx
// Typography
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

// Layout
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Divider } from '@/components/ui/divider';

// Forms
import {
  Button,
  ButtonText,
  ButtonSpinner,
  ButtonIcon,
  ButtonGroup,
} from '@/components/ui/button';

import {
  Input,
  InputField,
  InputSlot,
  InputIcon,
} from '@/components/ui/input';

import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
} from '@/components/ui/form-control';

import { Pressable } from '@/components/ui/pressable';

// Feedback
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertIcon, AlertText } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
```

### 5.1 Příklad použití — URL input + Start tlačítko

```tsx
<VStack space="md" className="p-4">
  <FormControl isInvalid={!isValidUrl}>
    <FormControlLabel>
      <FormControlLabelText>URL to ping</FormControlLabelText>
    </FormControlLabel>
    <Input variant="outline" size="lg">
      <InputField
        placeholder="https://example.com/health"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
    </Input>
    <FormControlError>
      <FormControlErrorText>Enter a valid URL.</FormControlErrorText>
    </FormControlError>
  </FormControl>

  <Button
    size="lg"
    action={isRunning ? 'negative' : 'primary'}
    onPress={toggleSession}
  >
    {isRunning && <ButtonSpinner />}
    <ButtonText>{isRunning ? 'Stop' : 'Start Requesting'}</ButtonText>
  </Button>

  <HStack space="sm" className="items-center">
    <Badge action={isRunning ? 'success' : 'muted'}>
      <BadgeText>{isRunning ? 'RUNNING' : 'IDLE'}</BadgeText>
    </Badge>
    <Text size="sm">{requestCount} requests · {errorCount} errors</Text>
  </HStack>
</VStack>
```

### 5.2 Přehled komponent a jejich rolí v aplikaci

| Komponenta | CLI příkaz | Použití v appce |
|---|---|---|
| Button | `add button` | Start / Stop, akce v history |
| Input | `add input` | URL pole, volitelný interval |
| FormControl | `add form-control` | Label + error wrapping pro URL |
| Badge | `add badge` | Status (IDLE / RUNNING / ERROR) |
| Text | `add text` | Labely, log řádky |
| Heading | `add heading` | Nadpisy obrazovek |
| VStack / HStack | `add vstack`, `add hstack` | Layout |
| Box | `add box` | Kontejnery, monospace log wrapper |
| Card | `add card` | Wrap aktivní session, položky history |
| Divider | `add divider` | Oddělovače |
| Spinner | `add spinner` | Loading při startu session |
| Alert | `add alert` | Chyby (invalid URL, network fail) |
| Pressable | `add pressable` | History list items |
| Icon | (auto) | Ikonky (stop, share, delete) |
| Toast | (auto) | "Session saved", "Export successful" |

## 6. Uživatelské scénáře

### 6.1 Start a průběh
1. Uživatel otevře aplikaci, vidí URL input a tlačítko **Start Requesting**
2. Zadá URL (např. `https://example.com/health`)
3. Klikne na **Start Requesting**
4. Tlačítko se přepne na **Stop**, pod ním začne růst log
5. V notifikační liště naskočí perzistentní notifikace: *Pinging example.com · Started 14:30 · Elapsed 0m 5s*

### 6.2 Minimalizace
1. Během běžící session uživatel minimalizuje app
2. Foreground service s notifikací pokračuje v pingání
3. Notifikace se aktualizuje (uplynulý čas)
4. Když systém službu zabije (extrémní battery saver, OEM killer), je to akceptovatelné — session zůstane uložená do bodu, kdy byla zabita

### 6.3 Stop
1. Uživatel klikne **Stop** — buď v aplikaci, nebo v notifikaci (action button)
2. Pingání se zastaví, notifikace zmizí
3. Do souboru se zapíše patička se shrnutím session
4. Soubor zůstane v `Documents/PingLogger/sessions/`
5. UI se vrátí do výchozího stavu (URL input zůstane předvyplněný)

### 6.4 Přístup k historii
1. Seznam uložených session souborů v aplikaci
2. Klik na položku → detail + tlačítko **Share** (systémový share sheet)
3. Alternativně **Export to Downloads** pro přesun do veřejné složky

## 7. Obrazovky

### 7.1 Home / Active session
- **FormControl + Input** — URL, validace na non-empty, auto-prefix `https://` pokud chybí schéma
- **Input** (číselný, default `5000` ms) — interval, skrytý pod "Advanced"
- **Button** — `Start Requesting` ↔ `Stop` podle stavu
- **HStack se Status Badge** — `IDLE` / `RUNNING`, počítadlo requestů, počet chyb
- **Box** s monospace `Text` — scrollovatelný log view, auto-scroll, posledních ~500 řádků

### 7.2 History
- Seznam session souborů (sestupně podle data) jako `Card` komponenty
- Každá položka: URL, start time, délka session, počet requestů, success/error ratio
- Klik → detail (plný log, share, export)

> V první verzi stačí history screen v základní podobě. Plnohodnotný detail s filtry může přijít později.

## 8. Funkční požadavky

### FR-1 — Ping loop
- HTTP **GET** na zadanou URL v intervalu `interval_ms` (default 5000)
- Timeout jednoho requestu: 10 s
- Pro každý request se do session souboru appenduje jeden řádek (viz § 10)
- Při ztrátě sítě se chyba loguje a loop pokračuje — **bez pozastavení**

### FR-2 — Live log mirror
- Session soubor je single source of truth
- UI udržuje in-memory buffer posledních N řádků (N ≈ 500), který je zrcadlem posledních zápisů
- Každý nový zápis emituje event → re-render log view → auto-scroll

### FR-3 — Session lifecycle
- **Start**: vytvoří se nový soubor `sessions/session-YYYY-MM-DD_HH-mm-ss.jsonl`, zapíše se hlavička
- **Run**: appendují se řádky typu `ping`
- **Stop**: zapíše se patička se součty; soubor se uzavře

### FR-4 — Foreground service (Android)
- Při Start se spustí foreground service s perzistentní notifikací
- Notifikace:
  - **Title:** `Pinging <host>`
  - **Body:** `Started HH:mm · Elapsed Xm Ys`
  - **Subtitle / third line:** plná URL
  - **Action button:** `Stop`
- Update notifikace min. každých 5 s
- Klik na Stop action → stejný efekt jako Stop v aplikaci

### FR-5 — Perzistence preferencí
- Naposledy zadaná URL a interval se ukládají přes `AsyncStorage`
- Při příštím spuštění app předvyplní

### FR-6 — Sdílení a export
- Z history nebo z dokončené session lze:
  - **Share** přes systémový share sheet (`expo-sharing`)
  - **Export to Downloads** přes Storage Access Framework (Android 10+)

### FR-7 — Resilience
- Pokud je app při startu session již v běhu (nedokončená session po crashi), nabídneme uživateli *Resume* nebo *Close as crashed* volbu
- Pokud systém zabije foreground service, session zůstane jako *incomplete* (v patičce se doplní `end = null` a flag `abnormal_termination: true`)

## 9. Architektura a struktura projektu

```
ping-logger/
├── app/                         # expo-router nebo jednoduchý root
│   ├── _layout.tsx              # GluestackUIProvider wrapper
│   ├── index.tsx                # Home / active session
│   └── history/
│       ├── index.tsx            # Seznam sessions
│       └── [file].tsx           # Detail session
├── components/
│   ├── ui/                      # Gluestack v5 copy-paste components (auto)
│   │   ├── button/
│   │   ├── input/
│   │   ├── ...
│   └── app/                     # Vlastní komponenty
│       ├── LogView.tsx          # Monospace scrollovatelný log
│       ├── StatusBadge.tsx
│       └── SessionCard.tsx
├── lib/
│   ├── pinger.ts                # HTTP loop, foreground service hook
│   ├── storage.ts               # expo-file-system wrappery
│   ├── sessions.ts              # Session lifecycle (start/stop/load)
│   ├── notifications.ts         # Notifee config pro foreground service
│   └── prefs.ts                 # AsyncStorage wrapper
├── store/
│   └── session.ts               # Zustand store — current session state
├── global.css                   # Tailwind v4 entry (z Gluestack initu)
├── tailwind.config.js           # (automaticky)
├── metro.config.js              # withNativewind (automaticky)
├── babel.config.js              # (automaticky)
├── gluestack-ui.config.json     # (automaticky)
└── app.json / app.config.ts     # Expo config — permissions, plugins
```

## 10. Datový model

### Session file (JSONL)

`sessions/session-2026-04-20_14-30-15.jsonl`

**Hlavička** (první řádek):
```json
{"type":"header","url":"https://example.com","start":"2026-04-20T14:30:15.000Z","interval_ms":5000,"device":"Pixel 7","app_version":"0.1.0"}
```

**Průběh** (N řádků):
```json
{"type":"ping","ts":"2026-04-20T14:30:15.123Z","status":200,"latency_ms":142}
{"type":"ping","ts":"2026-04-20T14:30:20.005Z","status":0,"latency_ms":10000,"error":"Network request timed out"}
```

**Patička** (při Stop):
```json
{"type":"footer","end":"2026-04-20T14:45:33.987Z","duration_s":918,"total":183,"success":180,"error":3,"avg_latency_ms":156}
```

> **Proč JSONL:** snadné appendování (`fileSystem.writeAsStringAsync` s příznakem append), strojově parsovatelné, ale čitelné i bez toolů.

## 11. Notifikace a background execution

### 11.1 Android foreground service notification
- Kanál: `ping_session` (priorita LOW, bez zvuku, `foregroundServiceType: 'dataSync'`)
- Non-dismissible dokud běží session
- Aktualizuje uplynulý čas
- Action button **Stop** — broadcast / deeplink do handleru, který zastaví session

### 11.2 Implementace přes Notifee

```ts
import notifee, { AndroidForegroundServiceType } from '@notifee/react-native';

async function startPingNotification(url: string, startedAt: Date) {
  const channelId = await notifee.createChannel({
    id: 'ping_session',
    name: 'Ping Session',
    importance: 2, // LOW
  });

  await notifee.displayNotification({
    id: 'ping',
    title: `Pinging ${new URL(url).host}`,
    body: `Started ${startedAt.toLocaleTimeString()} · Elapsed 0m 0s`,
    android: {
      channelId,
      asForegroundService: true,
      foregroundServiceType: [AndroidForegroundServiceType.DATA_SYNC],
      ongoing: true,
      actions: [{ title: 'Stop', pressAction: { id: 'stop-ping' } }],
    },
  });
}

// Registrace foreground service runner (pingovací smyčka)
notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    // ← Zde běží naše ping loop, dokud není explicitně zastavena
    runPingLoop();
  });
});
```

### 11.3 Realita na Androidu
- Android 8.0+ striktně omezuje background work → **foreground service je nutný**
- Doze mode / App Standby mohou požadavky zbrzdit → akceptovatelné, spec neslibuje ms přesnost
- OEM battery optimizations (Samsung, Xiaomi, Huawei) mohou service přesto zabít → uživatel musí v settings povolit "unrestricted battery usage"
- **Očekávané chování dle zadání:** app běží dokud systém nezabije, nebo do kliknutí na Stop (čisté ukončení)

## 12. Oprávnění (Android)

V `app.json` / `app.config.ts`:

```json
{
  "expo": {
    "android": {
      "permissions": [
        "INTERNET",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_DATA_SYNC",
        "POST_NOTIFICATIONS",
        "WAKE_LOCK"
      ]
    },
    "plugins": [
      ["@notifee/react-native", {}]
    ]
  }
}
```

- `INTERNET` — HTTP requesty
- `FOREGROUND_SERVICE` — foreground service
- `FOREGROUND_SERVICE_DATA_SYNC` (API 34+) — typ služby
- `POST_NOTIFICATIONS` (API 33+) — zobrazit notifikaci (vyžádat runtime)
- `WAKE_LOCK` — držet CPU přes interval
- `RECEIVE_BOOT_COMPLETED` — **není nutné**, session se po bootu neobnovuje

## 13. Nefunkční požadavky

- **Velikost APK:** < 50 MB (Gluestack v5 + NativeWind + Notifee + Expo základ)
- **Startup time:** < 2 s na střední Android
- **RAM footprint:** < 150 MB při běžící session
- **Bezpečnost:** low priority per zadání. HTTPS není vynucováno, uživatel si zadá co chce.
- **I18n:** MVP jedna lokalizace (EN nebo CZ)

## 14. Out of scope (MVP)

- Autentifikace / přihlášení
- Cloud sync sessions
- Grafy latencí, statistiky uvnitř app (jen raw log)
- POST / custom headers — jen GET v MVP
- Automatic re-start po bootu zařízení
- iOS background mode (BGTaskScheduler nebo alternativy) — odložit do v2
- Parallelní pingání více URL

## 15. Otevřené otázky

1. **Default interval?** Návrh: 5000 ms, konfigurovatelné v UI.
2. **Max délka session?** Omezit velikost souboru (např. rotovat po 10 MB)?
3. **UI pro history** — plnohodnotný seznam v MVP, nebo zatím jen "share last session"?
4. **Request method** — jen GET, nebo konfigurovatelně GET/HEAD/POST?
5. **Co dělat při ztrátě sítě?** Logovat chybu a pokračovat (aktuální návrh), nebo pozastavit?
6. **Volba styling enginu** — `nativewind-v5` (Tailwind v4, ostré), nebo `uniwind` (jednodušší, ale méně komunitních zdrojů)?

## 16. Milníky

**M1 — Skeleton (1 den)**
Expo projekt + Gluestack v5 init + NativeWind v5. Home screen s `FormControl` + `Input` + `Button`. Mock log v `Box` s `Text`.

**M2 — Core loop (2 dny)**
HTTP pinger, zápis do JSONL souboru přes `expo-file-system`, live mirror do log view, Start/Stop v rámci single session. Zustand store pro current state.

**M3 — Background (2–3 dny)**
Notifee foreground service + perzistentní notifikace, elapsed counter, Stop z notifikace, správa runtime permission pro notifikace.

**M4 — Persistence & sharing (1 den)**
History obrazovka se seznamem session `Card` komponent, share sheet (`expo-sharing`), poslední URL v `AsyncStorage`.

**M5 — Polish + EAS build (0.5 dne)**
Ikony, splash screen, APK build přes EAS, distribuce.

**Celkem: ~7 člověkodní.**

## 17. Známé problémy a tipy (Gluestack v5)

Z oficiálních docs na v5.gluestack.io:

- **Expo zaseknuté na `tailwindcss(ios) rebuilding...`** → název složky projektu obsahuje mezery. Přejmenujte (`Ping Logger` → `ping-logger`).
- **Peer dependency errors** při `npm install` → použijte `--legacy-peer-deps`.
- **NativeWind v5 build errors s `lightningcss`** → v `package.json` pinněte `lightningcss` na `1.30.1` v sekcích `overrides` a `resolutions`, pak clean install.
- **v5 nepodporuje Next.js** (není relevantní pro nás — jen Expo).
- **UniWind varování:** nepodporován pro monorepo setupy.

## 18. Užitečné zdroje

- **Gluestack v5 docs** — https://v5.gluestack.io/ui/docs
- **Quick start** — https://v5.gluestack.io/ui/docs/home/overview/quick-start
- **Installation** — https://v5.gluestack.io/ui/docs/home/getting-started/installation
- **CLI reference** — https://v5.gluestack.io/ui/docs/home/getting-started/cli
- **Všechny komponenty** — https://v5.gluestack.io/ui/docs/components/all-components
- **Kitchensink demo app** — https://v5.gluestack.io/ui/docs/apps/kitchensink-app
- **Notifee Android foreground service** — https://notifee.app/react-native/docs/android/foreground-service
- **Expo EAS Build APK profile** — https://docs.expo.dev/build-reference/apk/
