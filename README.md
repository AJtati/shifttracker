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
```

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
