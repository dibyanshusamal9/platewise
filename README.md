# Platewise

AI meal tracking. Describe a meal in plain English. Gemini estimates calories and macros, and the meal is saved without you typing any numbers.

**Stack:** React 19 · TanStack Start (file routing + server functions) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth + RLS) · Gemini API · Recharts · TanStack Query

## Run it locally

**Prerequisites:** Node 22+ and a free [Supabase](https://supabase.com) project.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the database.** In the Supabase dashboard, open **SQL Editor → New query**. Paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates `users`, `daily_goals` and `meals`, plus Row Level Security policies and a trigger that adds a `users` row whenever someone signs up.

3. **Configure auth.** Go to **Authentication → Sign In / Providers** and make sure **Email** is enabled. For local testing you can switch off **Confirm email** so new accounts can sign in straight away.

4. **Gemini:** nothing to set up on the server. Each user adds their own free key from [Google AI Studio](https://aistudio.google.com/apikey) inside the app (see [Bring your own Gemini key](#bring-your-own-gemini-key)).

5. **Add environment variables.** Copy the example file to `.env` in the project root:

   ```bash
   cp .env.example .env
   ```

   | Variable | Where to find it | Exposed to browser? |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project Settings → API (or the **Connect** button) | Yes (public by design) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page. Use the publishable key (`sb_publishable_…`) or the legacy `anon` key | Yes (protected by RLS) |
   | `GEMINI_MODEL` *(optional)* | e.g. `gemini-3.5-flash` | No. Defaults to the `gemini-flash-latest` alias |

6. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, create an account, paste your Gemini key when asked, and set your daily targets under **Settings**.

**Other scripts:** `npm run typecheck`, `npm run build` (writes `.output/`), and `npm start` (runs the production server and reads `.env` if present).

## Deploy the web app

The build uses [Nitro](https://nitro.build), so `.output/` runs anywhere Node runs. Nitro also auto-detects Vercel and Netlify. On the host, set the same variables as in `.env`, plus the `ANDROID_*` ones below. The deployed **https URL** is what the Android app loads.

## Android app

The app is a [Capacitor](https://capacitorjs.com) shell (`android/`) that loads the deployed site. There are two update channels:

| What changed | How it reaches phones | What you do |
|---|---|---|
| Anything in `src/`: UI, features, the Gemini prompt | The service worker detects the new deploy and shows **"A new version is ready → Reload"**. No store, no APK. | Deploy the web app. |
| The native shell: app icon, Capacitor plugins, Android config | The app checks the latest GitHub Release on launch and on resume. It shows **Update available (v1.0 → v1.1)** with your release notes, and **Download / Later / Don't show again**. Users can also tap **Settings → Check for updates**. | Push a tag (below). |
| A breaking change old shells can't handle | Shells below `ANDROID_MIN_VERSION` get a blocking **Update required** screen. | Raise `ANDROID_MIN_VERSION` on the server. |

### One-time setup

1. **Create a signing key and keep it safe.** Every update must be signed with the same key, or Android refuses to install it over the old app. Run this once (Java is already on your machine) and back the file up outside the repo:

   ```bash
   keytool -genkeypair -v -keystore platewise-release.jks -alias platewise -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Push the project to GitHub** (a public repo, so phones can download the APK). In **Settings → Secrets and variables → Actions**, add:
   - Variable `CAP_SERVER_URL`: your deployed https URL
   - Secret `ANDROID_KEYSTORE_BASE64`: the output of `base64 -w0 platewise-release.jks` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("platewise-release.jks"))`)
   - Secrets `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`platewise`) and `ANDROID_KEY_PASSWORD`

3. On the web host, set `ANDROID_RELEASES_REPO=<you>/<repo>`.

### Shipping a new APK

```bash
git tag v1.1.0
```

```bash
git push origin v1.1.0
```

[`.github/workflows/android-release.yml`](.github/workflows/android-release.yml) builds and signs the APK in the cloud (no Android Studio needed) and publishes it as a GitHub Release. Edit the release notes on GitHub if you like; they appear in the in-app dialog. Use `MAJOR.MINOR.PATCH` versions with minor and patch below 100, because the build turns them into Android's always-increasing `versionCode`.

### Local development (optional, needs Android Studio)

```bash
npm run dev
```

```bash
npm run mobile:sync
```

```bash
npm run mobile:open
```

The emulator reaches your dev server at `http://10.0.2.2:3000` (the default). To preview the update dialogs in a desktop browser, open `http://localhost:3000/?simulate-android=1.0.0`. This works only in dev builds.

`npm run icons` regenerates every icon and splash screen from `assets/icon.svg`.

> **Trade-off to know:** loading the live site means updates are instant, but the app needs a connection; without one it shows a "You're offline" screen. Capacitor labels `server.url` as intended for development. It works well for direct APK distribution, but Google Play reviewers sometimes push back on apps that are mostly a website.

## How meal logging works

```
SmartMealInput ──logMeal()──▶ server function (POST /_serverFn/…)
                                 │ 1. requireUser middleware: verifies the Supabase JWT
                                 │ 2. estimateNutrition(): Gemini, JSON mode + response schema
                                 │ 3. Zod validation; totals recomputed from per-item values
                                 │ 4. insert into meals as the user (RLS applies)
                              ◀──┘ returns the saved row → dashboard queries invalidate
```

- Each request is made with the signed-in user's own Gemini key (see below). The prompts and Gemini code live only in `src/server/nutrition-ai.server.ts`; the `.server.ts` suffix makes TanStack Start refuse to bundle that file for the client.
- Server functions are public HTTP endpoints, so each one checks the caller's Supabase access token. Anonymous or forged tokens are rejected before Gemini is called.
- No service-role key is used anywhere. The server writes with the user's own JWT, so the same RLS policies apply as in the browser.
- Input that isn't food ("hello!") is rejected with Gemini's explanation, and nothing is saved.

### Bring your own Gemini key

Every user connects their own free Gemini API key, so usage and quota are theirs and the app owner pays nothing for AI.

- **First run:** after signing in, the Today page shows **Connect your Gemini API key** with three steps (open AI Studio, create a key, paste it). **Check & save** verifies the key with Google before saving. The check reads model info only, so it costs no tokens.
- **Where it lives:** only on that device, in the browser storage for that account. It is sent over HTTPS in an `X-Gemini-Key` header with each meal request, used for that one Gemini call, and never stored, cached or logged by the server, or written to the database.
- **Clear errors:** a rejected or revoked key, or an exhausted quota, shows a specific message with an **Open key settings** link, and is not retried.
- **Manage it:** Settings → **Gemini API key** to replace or remove it.
- **Trade-offs:** the key is per device, so users enter it once on their phone and once on the web. Like anything in browser storage, it is readable by scripts on this site, so the app renders no third-party or user-supplied HTML. The `checkGeminiKey` endpoint requires sign-in, so it can't be used anonymously to test stolen keys.

### Scan from plate

Tap **Scan plate** to take a photo, or use the gallery button to pick **up to 4 photos at once**. On a computer you can also paste or drag photos in. With several photos, choose **One meal** (e.g. plate + drink, or two angles: one combined estimate) or **One meal per photo** (each becomes its own meal). Optionally add a note for what the camera can't see ("2 rotis", "no ghee", "ate half"); the note overrides what Gemini sees. A photo of a **nutrition facts label** works too: Gemini reads the per-serving values, and the note can say how many servings.

- The phone shrinks the photo to at most 1280 px (a 4–8 MB photo becomes roughly 150–400 KB) and fixes its rotation before upload.
- The full photo is used only for the estimate and is never stored. Each meal keeps just a ~10 KB thumbnail in `meals.photo_thumb`, which is protected by the same RLS rules as the meal.
- If the photo is too dark or blurry, or shows no food, the app explains why and keeps the photo attached so you can retry or add a note.
- **Already set up?** Re-run `supabase/schema.sql` to add the `input_type` and `photo_thumb` columns. It's safe to re-run.
- **Android:** this needs no new APK. The app uses the system camera through the WebView, so it reaches installed phones with a normal web deploy.

The system prompt and the JSON schema Gemini must follow are in [`src/server/nutrition-ai.server.ts`](src/server/nutrition-ai.server.ts) (`NUTRITION_SYSTEM_PROMPT`).

## Saffron, the AI coach

The **Saffron** tab is a chat with a nutrition coach that knows your data (it uses your own Gemini key):

- **Plans meals and portions** around your targets, what you've eaten today and the last 7 days ("You have 640 kcal and 38 g protein left today").
- **Explains the calories in photos**: send up to 4 photos and it breaks the meal down item by item.
- **Consults, then acts on a tap.** When it suggests a change, it shows a card with an **Apply** button: *log a meal*, *edit a meal* (the card shows the real meal and before → after values, taken from your log rather than the AI's wording) or *update your targets*. Nothing changes until you tap Apply; you can also Dismiss.
- **Remembers key facts** you tell it (diet, allergies, schedule, goals), shown as "Remembered: …" chips. See, add or delete them in **Settings → What Saffron remembers**. Ask it to forget something and it will.
- The conversation is saved in your account, so it follows you across devices. Photos are analysed then discarded; only small thumbnails are kept.

Safety: the coach isn't a doctor. It won't suggest targets below 1,200/1,500 kcal or losing more than ~1 kg a week, and it responds with care (and suggests professional support) to signs of disordered eating. Every proposal is validated on the server and again before it's applied, and all writes go through Row Level Security as you.

**Already set up?** Re-run `supabase/schema.sql` to add the `user_memories` and `chat_messages` tables (safe to re-run).

## Project layout

```
supabase/schema.sql              tables, RLS, triggers
capacitor.config.ts              Android shell → loads CAP_SERVER_URL
android/                         generated Android project (version + signing read from env)
pwa/sw.template.js               service worker; build stamps a new BUILD_ID into it every deploy
public/                          manifest, icons, offline page
.github/workflows/               tag → signed APK → GitHub Release
src/
  routes/                        TanStack file routes
    __root.tsx                   document shell, QueryClient, AuthProvider → <App>
    index.tsx                    Today: SmartMealInput + Dashboard
    weekly.tsx                   WeeklyReport
    goals.tsx                    GoalsSetup
    api/app-version.ts           latest APK version + notes (from GitHub Releases)
  components/
    App.tsx                      app shell: auth gate, header, desktop nav, mobile tab bar
    UpdateNotices.tsx            reload toast, update dialog, "Update required", Check for updates
    SmartMealInput.tsx           the one-box AI logger: type it or scan your plate (with Undo)
    Dashboard.tsx                calorie ring, remaining, deficit/surplus, macro meters
    WeeklyReport.tsx             7-day metrics (vs current targets), bar chart, macro split, editable timeline
    Coach.tsx                    Saffron chat: messages, photo questions, Apply/Dismiss action cards
    MemorySettings.tsx           what Saffron remembers (view, add, delete)
    PhotoAttach.tsx              shared camera/gallery (multi-select), paste, drop and previews
    RichText.tsx                 injection-safe formatting for AI replies
    MealTimeline.tsx             meal rows with inline edit (+ AI re-estimate) and delete
    GoalsSetup.tsx               Settings page: targets + TDEE calculator, Gemini key, app updates
    GeminiKeySettings.tsx        bring-your-own Gemini key: first-run setup and settings card
    AuthScreen.tsx, ui.tsx, Logo.tsx
  server/
    meals.functions.ts           logMeal / logMealFromPhoto / estimateMeal + auth middleware
    meals.server.ts              server-only insert helper
    coach.functions.ts           sendCoachMessage server function
    coach.server.ts              Saffron prompt, context from your data, proposal validation, memory
    middleware.ts                sign-in check + per-user Gemini key, shared by all server functions
    schemas.ts                   shared photo validation (1–4 photos, size limits)
    nutrition-ai.server.ts       Gemini prompts (text + photo), schema, validation
    supabase.server.ts           per-request, user-scoped Supabase client
  lib/
    nutrition.ts                 date keys, aggregation, goal versioning, TDEE math
    queries.ts                   TanStack Query hooks (reads + mutations)
    updates.ts                   update store: service worker + native-shell version checks
    gemini-key.ts                per-user, on-device Gemini key store
    image.ts                     on-device photo resize, rotation fix and thumbnail
    coach.ts                     Saffron action types + validation (shared by server and app)
    coach-queries.ts             chat, memory and Apply hooks
    auth.tsx, supabase.ts, database.types.ts
```

## Design notes

- **Reports use your current targets.** Each save writes a `daily_goals` row for today (keeping a history), but the dashboard and the whole weekly report always score every day against your **latest** TDEE and calorie target, so changing them recalculates averages, deficit and days-on-target straight away.
- **Days follow the user's local calendar.** Meals are stored as `timestamptz`, and "today" and the 7-day window are calculated in the browser's time zone.
- **Target vs TDEE.** *Remaining* is measured against your calorie target. *Deficit/surplus* is measured against TDEE (maintenance). If you set them equal, the two numbers match.
