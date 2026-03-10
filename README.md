# Shift Rota Tracker

Production-style Next.js + Firebase app for personal shift tracking.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Firebase Authentication (email/password)
- Cloud Firestore (`users/{uid}` + `users/{uid}/entries/{entryId}`)

## Features (MVP)

- Signup, login, logout, forgot password
- Dashboard with today/next shift cards and quick actions
- Weekly rota view
- Monthly calendar view
- List view with filters
- Add/Edit/Delete entry (shift, leave, holiday, off)
- Profile + preferences (default view, week start, time format, timezone)
- Firestore Security Rules and index definitions

## Project Structure

```text
src/
  app/
    (protected)/
      dashboard/
      rota/
      entry/
      profile/
    login/
    signup/
    forgot-password/
    providers/
  components/
    common/
    layout/
  features/
    auth/
    entries/
    user/
  hooks/
  services/firebase/
  types/
  utils/
```

## Environment Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill all Firebase values in `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_ENABLE_PUSH_REMINDERS=
```

`NEXT_PUBLIC_APP_URL` should be your deployed app URL, for example `https://shiftracker.web.app`.
`NEXT_PUBLIC_ENABLE_PUSH_REMINDERS` defaults to enabled. Set it to `false` to force free on-device local reminders only.

3. Install and run:

```bash
npm install
npm run dev
```

## iOS App (Capacitor)

This project can be shipped as an iOS app with Capacitor.

1. Prepare iOS project once:

```bash
npm run ios:add
```

2. Build web + sync into iOS app:

```bash
npm run ios:sync
```

3. Open in Xcode and run/archive:

```bash
npm run ios:open
```

Notes:
- Keep Firebase Web config in `.env.local` (same values used by web app).
- In Firebase Authentication -> Settings -> Authorized domains, ensure `localhost` is present for Capacitor WebView auth flows.

## Android App (Mobile + Android TV)

This repo is configured with two Android flavors:

- `mobile`: standard Android phones/tablets
- `tv`: Android TV build (`LEANBACK_LAUNCHER` enabled)

Firebase + TV note:
- If `google-services.json` does not include a Firebase Android client for `com.ajithsuryathati.shifttracker.tv`, the TV flavor automatically reuses `com.ajithsuryathati.shifttracker` so push-enabled features still work.
- To publish TV as a separate package (`.tv` suffix), add a matching Firebase Android app/client for `com.ajithsuryathati.shifttracker.tv` in Firebase and refresh `android/app/google-services.json`.

1. Prepare Android project once:

```bash
npm run android:add
```

2. Build web + sync native Android files:

```bash
npm run android:sync
```

3. Open Android Studio:

```bash
npm run android:open
```

4. Build APKs from CLI:

```bash
# Mobile APKs
npm run android:apk:mobile:debug
npm run android:apk:mobile:release

# Android TV APKs
npm run android:apk:tv:debug
npm run android:apk:tv:release
```

APK output folders:

- `android/app/build/outputs/apk/mobile/debug/`
- `android/app/build/outputs/apk/mobile/release/`
- `android/app/build/outputs/apk/tv/debug/`
- `android/app/build/outputs/apk/tv/release/`

Notification notes:

- Android 13+ requires runtime notification permission (already handled in app code).
- Android TV support depends on device/launcher behavior; install the `tv` APK on TV to receive app notifications there.
- Push reminders are now event-driven via Firebase task queue functions (scheduled only when user preferences/entries/tokens change), instead of a global every-minute scanner.

## Firestore Rules

Rules are in `firestore.rules` and enforce:

- Auth required for all reads/writes
- Users can only access their own `users/{uid}` path
- Entry type and field validation

Deploy rules and indexes with Firebase CLI:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Notes

- Firebase SDK usage is isolated to service modules.
- UI components call service abstractions via hooks/context.
- If Firebase env vars are missing, the app shows an in-app setup warning.

## Authentication Setup (Email)

This app now supports:
- signup with verification email
- email/password login (blocked until email is verified)
- forgot-password email reset flow

Required Firebase Console settings:

1. Authentication -> Sign-in method
- enable `Email/Password`

2. Authentication -> Settings -> Authorized domains
- add your domains (for example `shiftracker.web.app`)
- keep `localhost` for local development

3. Authentication -> Templates
- configure `Email address verification` template
- configure `Password reset` template
- set template action URL to your app domain

4. Sender email address
- authentication emails are sent by Firebase template sender settings, not by app code
- to send from `noreply@shiftracker.web.app`, configure the sender in Firebase Authentication templates/domain settings for your project
