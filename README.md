# Perri & Noah — Wedding Planner App

A real, deployable web app for the Cochin & Bleustein families.
Live updates across all phones. No app store required.

---

## What you get

- Full wedding planner: vendors, guests, payments, timeline, checklist
- Media & Reviews: share band videos, photos — everyone rates & comments
- Ideas & Chat: group messaging for the whole family
- Activity feed with notifications (red badges on tabs)
- Parents-only financial view (Perri & Noah see no money details)
- Real-time sync: one person adds something, everyone sees it instantly
- Works on any phone browser — can be "installed" to home screen

---

## Setup (takes about 20 minutes, completely free)

### Step 1 — Create a free Supabase database

1. Go to **https://supabase.com** and click "Start your project" (free)
2. Sign up and create a new project
   - Name it: `perri-noah-wedding`
   - Choose a strong database password (save it somewhere)
   - Pick region: **US East** (closest to New York)
3. Wait ~2 minutes for your project to launch

### Step 2 — Set up the database tables

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `src/supabase.js` in this folder
4. Copy everything inside the backticks of `export const SETUP_SQL = \`...\``
5. Paste it into the SQL Editor and click **Run**
6. You should see "Success. No rows returned" — that's correct!

### Step 3 — Get your API credentials

1. In Supabase, click **Settings** (gear icon) → **API**
2. Copy your **Project URL** (looks like: `https://abcdefgh.supabase.co`)
3. Copy your **anon public** key (long string starting with `eyJ...`)

### Step 4 — Add credentials to the app

Create a file called `.env` in this folder (same level as `package.json`):

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace the values with your actual URL and key from Step 3.

### Step 5 — Deploy to Vercel (free hosting)

1. Go to **https://vercel.com** and sign up (free, use GitHub login)
2. Click **Add New → Project**
3. Click **Upload** (you don't need GitHub)
4. Zip this entire folder and upload it
5. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **Deploy**
7. In ~1 minute you'll get a URL like: `https://perri-noah-wedding.vercel.app`

**That's your app URL.** Share it with everyone in the family.

---

## How family members use it on their phones

### iPhone
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow pointing up)
3. Tap **Add to Home Screen**
4. Tap **Add**
→ The app now appears on their home screen like a regular app

### Android
1. Open the app URL in Chrome
2. Tap the **three dots** menu (⋮)
3. Tap **Add to Home screen**
4. Tap **Add**
→ Same result — app icon on home screen

---

## Viewer access

Everyone selects their name when they open the app:
- **Cochin family** — sees everything including all financial details
- **Bleustein family** — sees everything including all financial details
- **Perri** — sees all planning features, NO financial details
- **Noah** — sees all planning features, NO financial details

The app remembers who you are on your device between visits.

---

## Developer notes

**Tech stack:**
- React 18 + Vite (frontend)
- Supabase (PostgreSQL database + real-time subscriptions)
- Vercel (hosting + CDN)
- Pure CSS (no UI library — fast, mobile-optimized)

**Real-time:** Uses Supabase Realtime (WebSockets) — changes appear on all devices within ~1 second.

**File uploads for media:** Currently supports YouTube/Vimeo/Google Drive links. To add direct file upload, you'd need to enable Supabase Storage (also free) — ask your developer.

**Cost:** $0/month on free tiers (Supabase free = 500MB database, Vercel free = unlimited deployments).

---

## Need help?

If you get stuck on any step, a developer can complete this setup in under 30 minutes. The code is production-ready.
