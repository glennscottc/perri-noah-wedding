-- ============================================================
-- PERRI & NOAH WEDDING APP — DATABASE SETUP
-- Paste this entire file into Supabase SQL Editor and click Run
-- ============================================================

-- ── TABLES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seating_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 10,
  guest_ids JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS user_pins (
  name TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
  link_type TEXT,
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
  link_type TEXT,
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

-- ── VIEWER ROLE FUNCTION ────────────────────────────────────
-- Reads the x-viewer-role header the app sends with every request.
-- Used by Row Level Security policies below.

CREATE OR REPLACE FUNCTION get_viewer_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::json->>'x-viewer-role',
    'unknown'
  );
$$ LANGUAGE sql STABLE;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE seating_tables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_categories ENABLE ROW LEVEL SECURITY;

-- Open access tables (all family members)
CREATE POLICY "seating_all"  ON seating_tables      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "gifts_all"    ON gifts                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "pins_all"     ON user_pins            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_v"  ON vendors              FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_g"  ON guests               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_d"  ON dates                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_t"  ON tasks                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_m"  ON media_items          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_c"  ON chat_messages        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_mc" ON media_categories     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_cc" ON checklist_categories FOR ALL TO anon USING (true) WITH CHECK (true);

-- Notes: each person only sees their own
CREATE POLICY "notes_own" ON notes FOR ALL TO anon
  USING (owner = get_viewer_role())
  WITH CHECK (owner = get_viewer_role());

-- Reminders: shared ones visible to all, private only to creator
CREATE POLICY "reminders_select" ON reminders FOR SELECT TO anon
  USING (is_private = FALSE OR created_by = get_viewer_role());

CREATE POLICY "reminders_insert" ON reminders FOR INSERT TO anon
  WITH CHECK (created_by = get_viewer_role());

CREATE POLICY "reminders_update" ON reminders FOR UPDATE TO anon
  USING (created_by = get_viewer_role())
  WITH CHECK (created_by = get_viewer_role());

CREATE POLICY "reminders_delete" ON reminders FOR DELETE TO anon
  USING (created_by = get_viewer_role());

-- Transactions: parents only (Glenn, Stephanie, David, Bonni)
-- Perri, Noah, and Planner get zero rows at the database level
DROP POLICY IF EXISTS "transactions_parents_only" ON transactions;
CREATE POLICY "transactions_parents_only" ON transactions
  FOR ALL TO anon
  USING (get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni'))
  WITH CHECK (get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni'));

-- Activity log: filter payment entries for non-financial users
DROP POLICY IF EXISTS "activity_filtered" ON activity_log;
CREATE POLICY "activity_filtered" ON activity_log
  FOR SELECT TO anon
  USING (
    get_viewer_role() IN ('Glenn', 'Stephanie', 'David', 'Bonni')
    OR (
      get_viewer_role() IN ('Perri', 'Noah', 'Planner')
      AND tab NOT IN ('payments')
      AND icon NOT IN ('💳', '💰')
    )
  );

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

-- ── DEFAULT DATA ────────────────────────────────────────────

INSERT INTO media_categories (name, sort_order) VALUES
  ('Bands & Music', 1), ('Photographers', 2), ('Florists', 3),
  ('Hair & Makeup', 4), ('Venues', 5), ('Cake & Desserts', 6),
  ('Photos', 7), ('Other', 8)
ON CONFLICT (name) DO NOTHING;

INSERT INTO checklist_categories (name, sort_order) VALUES
  ('Venue & Ceremony', 1), ('Catering & Cake', 2), ('Photography & Video', 3),
  ('Music & Entertainment', 4), ('Florals & Décor', 5), ('Attire & Beauty', 6),
  ('Stationery & Planning', 7), ('Transportation', 8), ('Accommodations', 9),
  ('Honeymoon', 10), ('Rehearsal & Day-of', 11), ('Legal & Admin', 12)
ON CONFLICT (name) DO NOTHING;

-- Starting contributions and Old Oaks deposit
INSERT INTO transactions (id, type, label, sub, amount, date, family) VALUES
  ('tx-init-1', 'in',  'Contribution — Cochin family',    'Initial funding · Wire',                          25000, '2026-03-20', 'Cochin'),
  ('tx-init-2', 'in',  'Contribution — Bleustein family', 'Initial funding · Wire',                          25000, '2026-03-20', 'Bleustein'),
  ('tx-init-3', 'out', 'Deposit — Old Oaks Country Club', 'Bleustein family · Check · Non-refundable deposit', 8000, '2026-03-20', 'Bleustein')
ON CONFLICT (id) DO NOTHING;

-- ── REALTIME ────────────────────────────────────────────────
-- After running this SQL, go to:
-- Supabase Dashboard → Database → Replication
-- and enable realtime for all tables listed above
-- (or the app will still work, just without live updates)
