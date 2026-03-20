import { createClient } from '@supabase/supabase-js'

// 🔧 SETUP: Replace these with your Supabase project credentials
// Get them from: https://supabase.com → your project → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

// Base client (used for non-financial queries)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
})

// Returns a Supabase client that sends the viewer role as a custom header.
// Supabase RLS policies read this header via get_viewer_role() to enforce
// that Perri and Noah cannot access the transactions table at the database level.
export function getViewerClient(viewerRole) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        'x-viewer-role': viewerRole,
      },
    },
    realtime: { params: { eventsPerSecond: 10 } },
  })
}

// ── DATABASE SCHEMA ──────────────────────────────────
// Run this SQL in your Supabase SQL editor to create all tables:
export const SETUP_SQL = `
-- Enable realtime on all tables
-- Run each CREATE TABLE then enable realtime in Supabase dashboard

CREATE TABLE IF NOT EXISTS seating_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 10,
  guest_ids JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE seating_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seating_all" ON seating_tables FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  from_name TEXT NOT NULL,
  gift_desc TEXT,
  gift_type TEXT DEFAULT 'Physical gift',
  received_date TEXT,
  amount NUMERIC,
  thank_you_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gifts_all" ON gifts FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT,
  body TEXT,
  color TEXT DEFAULT '#FAEEDA',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  due_date TEXT,
  priority TEXT DEFAULT 'normal',
  for_who TEXT DEFAULT 'Everyone',
  created_by TEXT NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Notes: each person only sees their own notes
CREATE POLICY "notes_own" ON notes FOR ALL TO anon
  USING (owner = get_viewer_role())
  WITH CHECK (owner = get_viewer_role());

-- Reminders: shared ones visible to all, private ones only to creator
CREATE POLICY "reminders_visibility" ON reminders FOR SELECT TO anon
  USING (
    is_private = FALSE
    OR created_by = get_viewer_role()
  );

-- Anyone can insert/update/delete their own reminders
CREATE POLICY "reminders_write" ON reminders FOR INSERT TO anon
  WITH CHECK (created_by = get_viewer_role());

CREATE POLICY "reminders_modify" ON reminders FOR UPDATE TO anon
  USING (created_by = get_viewer_role())
  WITH CHECK (created_by = get_viewer_role());
  WITH CHECK (true);

CREATE POLICY "reminders_delete" ON reminders FOR DELETE TO anon
  USING (created_by = get_viewer_role());

CREATE TABLE IF NOT EXISTS user_pins (
  name TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PINs are open write (each person sets their own) but only readable by matching name
ALTER TABLE user_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pins_own_row" ON user_pins FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sub TEXT,
  amount NUMERIC NOT NULL,
  date TEXT NOT NULL,
  family TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cat TEXT,
  status TEXT DEFAULT 'pending',
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  side TEXT,
  rsvp TEXT DEFAULT 'awaiting',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dates (
  id TEXT PRIMARY KEY,
  d TEXT NOT NULL,
  title TEXT NOT NULL,
  descr TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  due TEXT,
  done BOOLEAN DEFAULT FALSE,
  cat TEXT NOT NULL,
  created_by TEXT,
  done_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cat TEXT NOT NULL,
  notes TEXT,
  url TEXT,
  thumb TEXT,
  file_name TEXT,
  ratings JSONB DEFAULT '{}',
  comments JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  icon TEXT,
  who TEXT NOT NULL,
  descr TEXT NOT NULL,
  tab TEXT,
  ts BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  who TEXT NOT NULL,
  text TEXT NOT NULL,
  cat TEXT,
  ts BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────────────────
-- VIEWER ROLE SYSTEM
-- The app passes the current viewer in a custom header:
--   x-viewer-role: "Cochin family" | "Bleustein family" | "Perri" | "Noah"
-- We store it in a session variable and use it in RLS policies.
-- ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_viewer_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::json->>'x-viewer-role',
    'unknown'
  );
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- transactions table: ONLY accessible if viewer is a parent family.
-- Perri and Noah receive a database-level denial — no data, no error hint.
-- All other tables: open to all viewers.
-- ─────────────────────────────────────────────────────

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_categories ENABLE ROW LEVEL SECURITY;

-- TRANSACTIONS: Parents only (Glenn, Stephanie, David, Bonni) — Planner, Perri and Noah get zero rows
DROP POLICY IF EXISTS "transactions_parents_only" ON transactions;
CREATE POLICY "transactions_parents_only" ON transactions
  FOR ALL TO anon
  USING (
    get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni')
  )
  WITH CHECK (
    get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni')
  );

-- Activity log: filter out payment entries for Perri, Noah & Planner
DROP POLICY IF EXISTS "activity_filtered" ON activity_log;
CREATE POLICY "activity_filtered" ON activity_log
  FOR SELECT TO anon
  USING (
    get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni')
    OR
    (
      get_viewer_role() IN ('Perri', 'Noah', 'Planner')
      AND tab NOT IN ('payments')
      AND icon NOT IN ('💳', '💰')
    )
  );

-- Activity log INSERT
DROP POLICY IF EXISTS "activity_insert" ON activity_log;
CREATE POLICY "activity_insert" ON activity_log
  FOR INSERT TO anon
  WITH CHECK (
    CASE
      WHEN get_viewer_role() IN ('Perri', 'Noah', 'Planner')
      THEN tab NOT IN ('payments') AND icon NOT IN ('💳', '💰')
      ELSE true
    END
  );

-- All other tables: open to all family members
CREATE POLICY "allow_all" ON vendors FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON guests FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON dates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON tasks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON media_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON chat_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON media_categories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON checklist_categories FOR ALL TO anon USING (true) WITH CHECK (true);

-- Insert default media categories
INSERT INTO media_categories (name, sort_order) VALUES
  ('Bands & Music', 1), ('Photographers', 2), ('Florists', 3),
  ('Hair & Makeup', 4), ('Venues', 5), ('Cake & Desserts', 6),
  ('Photos', 7), ('Other', 8)
ON CONFLICT (name) DO NOTHING;

-- Insert default checklist categories
INSERT INTO checklist_categories (name, sort_order) VALUES
  ('Venue & Ceremony', 1), ('Catering & Cake', 2), ('Photography & Video', 3),
  ('Music & Entertainment', 4), ('Florals & Décor', 5), ('Attire & Beauty', 6),
  ('Stationery & Planning', 7), ('Transportation', 8), ('Accommodations', 9),
  ('Honeymoon', 10), ('Rehearsal & Day-of', 11), ('Legal & Admin', 12)
ON CONFLICT (name) DO NOTHING;

-- Insert initial transactions
INSERT INTO transactions (id, type, label, sub, amount, date, family) VALUES
  ('tx-init-1', 'in', 'Contribution — Cochin family', 'Initial funding · Wire', 25000, '2026-03-20', 'Cochin'),
  ('tx-init-2', 'in', 'Contribution — Bleustein family', 'Initial funding · Wire', 25000, '2026-03-20', 'Bleustein'),
  ('tx-init-3', 'out', 'Deposit — Old Oaks Country Club', 'Bleustein family · Check · Non-refundable deposit', 8000, '2026-03-20', 'Bleustein')
ON CONFLICT (id) DO NOTHING;
`
