import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, getViewerClient } from './supabase'
import PinLogin, { SignOutButton } from './PinLogin'
import EmailImport from './EmailImport'

// ── PEOPLE & ROLES ────────────────────────────────────
const WEDDING_DATE = new Date('2027-10-16')

// Every person in the app — name, role label, family, avatar colors, initials
const PEOPLE = {
  'Perri':     { label: 'Perri',     role: 'Bride',            family: 'Cochin',    avatar: ['#FBEAF0', '#72243E'], initials: 'P'  },
  'Noah':      { label: 'Noah',      role: 'Groom',            family: 'Bleustein', avatar: ['#E6F1FB', '#0C447C'], initials: 'N'  },
  'Glenn':     { label: 'Glenn',     role: "Bride's Dad",      family: 'Cochin',    avatar: ['#EEEDFE', '#3C3489'], initials: 'GC' },
  'Stephanie': { label: 'Stephanie', role: "Bride's Mom",      family: 'Cochin',    avatar: ['#E1F5EE', '#085041'], initials: 'SC' },
  'Bonni':     { label: 'Bonni',     role: "Groom's Mom",      family: 'Bleustein', avatar: ['#EAF3DE', '#27500A'], initials: 'BB' },
  'David':     { label: 'David',     role: "Groom's Dad",      family: 'Bleustein', avatar: ['#FAEEDA', '#633806'], initials: 'DB' },
  'Planner':   { label: 'Planner',   role: 'Wedding Planner',  family: 'External',  avatar: ['#EDF4F4', '#1B5E5E'], initials: 'WP' },
}

// Financial access: only parents (Cochin & Bleustein families)
const PARENTS_PEOPLE = ['Glenn', 'Stephanie', 'Bonni', 'David']
const COUPLE_PEOPLE  = ['Perri', 'Noah']
const PLANNER_PEOPLE = ['Planner']  // External — no financials, no private notes
const ALL_PEOPLE     = Object.keys(PEOPLE)

// Legacy family-level avatar map for chat messages logged before personalization
const AVATARS = Object.fromEntries(
  ALL_PEOPLE.map(name => [name, PEOPLE[name].avatar])
)

const G_AVATARS = [['#EEEDFE','#3C3489'],['#E1F5EE','#085041'],['#FAECE7','#712B13'],['#FAEEDA','#633806'],['#E6F1FB','#0C447C'],['#FCEBEB','#791F1F'],['#EAF3DE','#27500A']]

// Short aliases
const PARENTS = PARENTS_PEOPLE
const COUPLE  = COUPLE_PEOPLE

// ── FINANCIAL GUARD ───────────────────────────────────
// Planner and couple never see financials
const NON_FINANCIAL = [...COUPLE_PEOPLE, ...PLANNER_PEOPLE]

function assertParents(viewer) {
  if (NON_FINANCIAL.includes(viewer)) {
    throw new Error('Financial data is not available for this user.')
  }
}

// Family label helpers
function familyLabel(familyKey) {
  return familyKey === 'Cochin' ? 'Cochin family (Bride\'s)' : 'Bleustein family (Groom\'s)'
}

// Who paid label from form value
function paidByLabel(who) {
  return familyLabel(who)
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
const esc = s => String(s || '')
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = ts => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtMoney = n => '$' + Number(n).toLocaleString()

const DEF_TASKS = {
  'Venue & Ceremony': ['Book ceremony venue','Book reception venue (Old Oaks ✓)','Confirm ceremony time','Arrange officiant','Plan ceremony layout & seating','Schedule venue walkthrough'],
  'Catering & Cake': ['Confirm menu with Old Oaks','Finalize dietary needs','Order wedding cake','Plan cocktail hour','Confirm vendor meals (7 days prior)','Choose bar package & signature cocktail'],
  'Photography & Video': ['Book photographer','Book videographer','Create shot list','Schedule engagement photos','Confirm arrival times'],
  'Music & Entertainment': ['Book band or DJ','Ceremony music list','Cocktail hour playlist','Reception playlist & do-not-play list','Confirm first dance song','Confirm parent dances'],
  'Florals & Décor': ['Book florist','Choose bridal bouquet','Plan centerpieces','Order boutonnieres','Plan ceremony arch florals','Confirm décor approved by Old Oaks GM'],
  'Attire & Beauty': ['Purchase wedding dress','Schedule fittings','Book hair stylist','Book makeup artist','Schedule hair & makeup trial','Buy wedding rings'],
  'Stationery & Planning': ['Send save-the-dates','Send invitations','Set up wedding website','Create seating chart','Order menus & place cards'],
  'Transportation': ['Book car for couple','Arrange guest shuttles','Confirm valet with Old Oaks (optional)'],
  'Accommodations': ['Reserve hotel room blocks','Book bridal suite','Arrange welcome bags for out-of-town guests'],
  'Honeymoon': ['Choose destination','Book flights','Book hotel','Apply for/renew passports','Arrange travel insurance'],
  'Rehearsal & Day-of': ['Book rehearsal dinner venue','Send rehearsal dinner invites','Create day-of timeline','Assign wedding party duties','Prepare vendor tip envelopes'],
  'Legal & Admin': ['Apply for marriage license','Confirm NY marriage license requirements','Review & sign all vendor contracts'],
}

const FIXED_DATES = [
  { id: 'fixed-1', d: '2027-10-11', title: 'Final guest count due to Old Oaks', descr: 'Minimum 5 days before wedding — required by contract' },
  { id: 'fixed-2', d: '2027-10-02', title: 'Outside vendors submit proof of insurance', descr: 'Must contact Old Oaks GM at least 7 days before event' },
  { id: 'fixed-3', d: '2027-10-16', title: 'Wedding day — Perri & Noah', descr: 'Old Oaks Country Club · Ceremony & reception' },
]

// ── STYLES ────────────────────────────────────────────
const S = {
  app: { maxWidth: 680, margin: '0 auto', paddingBottom: 100 },

  // Header — rich gradient with texture
  header: {
    position: 'relative',
    textAlign: 'center',
    padding: '2.25rem 1rem 1.75rem',
    background: 'linear-gradient(165deg, #FCF0F2 0%, #FDF9F5 40%, #F5F0FA 80%, #EEF4FA 100%)',
    borderBottom: '1px solid rgba(196,105,122,0.12)',
    overflow: 'hidden',
  },
  h1: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: 'var(--rose-dark)',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    lineHeight: 1.1,
  },
  sub: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 },
  countdown: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 12, padding: '6px 20px',
    borderRadius: 30, background: 'rgba(255,255,255,0.9)',
    color: 'var(--rose-dark)', fontSize: 13, fontWeight: 700,
    border: '1px solid rgba(196,105,122,0.2)',
    boxShadow: '0 2px 12px rgba(196,105,122,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
    backdropFilter: 'blur(10px)',
    letterSpacing: '-0.01em',
  },

  // Nav
  nav: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    padding: '0 1rem',
    background: 'var(--warm-white)',
  },
  navBtn: (active) => ({
    position: 'relative',
    padding: '11px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    color: active ? 'var(--rose-dark)' : 'var(--text-tertiary)',
    borderBottom: active ? '2.5px solid var(--rose)' : '2.5px solid transparent',
    fontWeight: active ? 700 : 400,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    letterSpacing: active ? '-0.01em' : '0.01em',
    transition: 'color 0.15s',
  }),
  badge: {
    position: 'absolute', top: 5, right: 3,
    minWidth: 16, height: 16,
    background: 'linear-gradient(135deg, #E8525A, #C4697A)',
    color: 'white', borderRadius: 8,
    fontSize: 9, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 3px', boxShadow: '0 1px 4px rgba(228,82,90,0.4)',
  },

  section: { padding: '0 1rem' },

  // Metric cards — premium look
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: '1.5rem' },
  metricCard: {
    background: 'white',
    borderRadius: 'var(--r-lg)',
    padding: '1rem',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-xs)',
    transition: 'box-shadow 0.2s',
  },
  metricLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7 },
  metricValue: { fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 },
  metricSub: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 },
  pbWrap: { background: 'var(--border)', borderRadius: 6, height: 5, overflow: 'hidden', marginTop: 8 },
  pb: (w, color='var(--rose)') => ({
    height: '100%', borderRadius: 6,
    background: `linear-gradient(90deg, ${color}, ${color}BB)`,
    width: w + '%',
    transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
  }),

  // Buttons
  addBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px',
    borderRadius: 'var(--r-md)',
    border: '1.5px solid var(--border-strong)',
    background: 'white',
    color: 'var(--text-secondary)',
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer', marginBottom: '1rem',
    boxShadow: 'var(--shadow-xs)',
    transition: 'all 0.18s',
    letterSpacing: '-0.01em',
  },
  saveBtn: {
    display: 'inline-flex', alignItems: 'center',
    padding: '10px 22px',
    borderRadius: 'var(--r-md)',
    border: 'none',
    background: 'linear-gradient(135deg, #D4788A 0%, #C4697A 100%)',
    color: 'white',
    fontSize: 13, fontWeight: 700,
    cursor: 'pointer', marginRight: 8,
    boxShadow: 'var(--shadow-rose)',
    transition: 'all 0.2s',
    letterSpacing: '-0.01em',
  },
  cancelBtn: {
    display: 'inline-flex', alignItems: 'center',
    padding: '10px 18px',
    borderRadius: 'var(--r-md)',
    border: '1.5px solid var(--border-strong)',
    background: 'white',
    color: 'var(--text-secondary)',
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
  },

  // Form
  formBox: {
    background: 'linear-gradient(135deg, #FEFCF9 0%, #FDF7F1 100%)',
    borderRadius: 'var(--r-xl)',
    padding: '1.5rem',
    marginBottom: '1.25rem',
    border: '1.5px solid rgba(196,105,122,0.12)',
    boxShadow: '0 2px 16px rgba(196,105,122,0.06)',
  },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  formLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' },
  formFull: { gridColumn: '1 / -1' },

  // Empty states
  empty: {
    padding: '3rem 2rem', textAlign: 'center',
    background: 'linear-gradient(135deg, var(--rose-light) 0%, var(--warm-white) 100%)',
    borderRadius: 'var(--r-xl)',
    border: '1.5px dashed rgba(196,105,122,0.25)',
    color: 'var(--text-secondary)',
    fontSize: 14, lineHeight: 1.7,
    margin: '0.5rem 0',
  },

  sectionTitle: { fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 14 },

  // Category tabs
  catTabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.25rem' },
  catTab: (active) => ({
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
    border: '1.5px solid ' + (active ? 'var(--rose)' : 'var(--border-strong)'),
    background: active ? 'linear-gradient(135deg, #D4788A, #C4697A)' : 'white',
    color: active ? 'white' : 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: active ? 'var(--shadow-rose)' : 'none',
    letterSpacing: active ? '-0.01em' : '0',
  }),

  // Status badges
  badge2: (type) => {
    const map = {
      paid:      ['#E8F5EE','#1E6B3F','#5EC48A'],
      pending:   ['#FEF4E4','#7C4A03','#F0A840'],
      deposit:   ['#EBF2FA','#1E3A7E','#6CA0E8'],
      overdue:   ['#FDEAEA','#7C1F1F','#E06060'],
      confirmed: ['#E8F5EE','#1E6B3F','#5EC48A'],
      awaiting:  ['#FEF4E4','#7C4A03','#F0A840'],
      declined:  ['#FDEAEA','#7C1F1F','#E06060'],
    }
    const [bg, c, dot] = map[type] || ['#F5F3EF','#78716C','#ADA49D']
    return {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 10,
      fontSize: 11, fontWeight: 700,
      background: bg, color: c, letterSpacing: '0.01em',
    }
  },

  syncBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 0', fontSize: 11 },
  roleBar: { display: 'flex', gap: 6, justifyContent: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', padding: '0 1rem' },
  roleBtn: (active) => ({ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--rose)' : 'var(--border-strong)'), background: active ? 'var(--rose)' : 'white', color: active ? 'white' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }),
}

// ── COMPONENTS ────────────────────────────────────────
function Spinner() {
  return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</div>
}

function SyncBar({ status }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (!isOnline) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'white', background: '#9B3A3A', borderBottom: '1px solid #7C1F1F' }}>
      <span>📵</span> No internet — changes won't save until you reconnect
    </div>
  )

  const color = status === 'saved' ? '#4A9B6F' : status === 'saving' ? '#B8956A' : '#9B3A3A'
  const label = { saved: 'Live · synced across all phones', saving: 'Saving…', error: 'Save failed — check your connection' }[status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 0', fontSize: 11, color: 'var(--text-tertiary)', background: status === 'error' ? '#FEF0F0' : 'linear-gradient(to right, #FFFCF8, #FDF9F5)', borderBottom: '1px solid rgba(196,105,122,0.08)', transition: 'background 0.3s' }}>
      <div className={status === 'saved' ? 'live-dot' : ''} style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, animation: status === 'saved' ? undefined : 'none' }} />
      <span style={{ color: status === 'error' ? '#9B3A3A' : 'var(--text-tertiary)', fontWeight: status === 'saved' ? 400 : 500, letterSpacing: '0.02em' }}>{label}</span>
    </div>
  )
}

function MetricCard({ label, value, sub, progress, progressColor }) {
  return (
    <div style={S.metricCard}>
      <div style={S.metricLabel}>{label}</div>
      <div style={S.metricValue}>{value}</div>
      {progress != null && <div style={S.pbWrap}><div style={S.pb(progress, progressColor || '#534AB7')} /></div>}
      {sub && <div style={S.metricSub}>{sub}</div>}
    </div>
  )
}

function FormField({ label, children, full }) {
  return (
    <div style={full ? S.formFull : {}}>
      <div style={S.formLabel}>{label}</div>
      {children}
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────
export default function App() {
  const [viewer, setViewerState] = useState(null)  // null = not logged in
  const [activeTab, setActiveTab] = useState('overview')
  const [syncStatus, setSyncStatus] = useState('saved')
  const [loading, setLoading] = useState(true)

  // Data state
  const [transactions, setTransactions] = useState([])
  const [vendors, setVendors] = useState([])
  const [guests, setGuests] = useState([])
  const [dates, setDates] = useState([])
  const [tasks, setTasks] = useState([])
  const [mediaItems, setMediaItems] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [mediaCats, setMediaCats] = useState(['Bands & Music','Photographers','Florists','Hair & Makeup','Venues','Cake & Desserts','Photos','Other'])
  const [clCats, setClCats] = useState(Object.keys(DEF_TASKS))
  const [notes, setNotes] = useState([])
  const [reminders, setReminders] = useState([])
  const [gifts, setGifts] = useState([])
  const [tables, setTables] = useState([])
  const [readTimestamps, setReadTimestamps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pn-read-ts') || '{}') } catch { return {} }
  })

     const [unreadCounts, setUnreadCounts] = useState({})
  const isParents = PARENTS.includes(viewer)

  // Data is loaded by handleLogin() after PIN verification

  async function loadAll(currentViewer) {
    setLoading(true)
    setLoadError(false)
    const isParentsViewer = PARENTS.includes(currentViewer)
    const isNonFinancial = NON_FINANCIAL.includes(currentViewer)

    // If Supabase hasn't been configured yet, show a clear message
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
    if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      setLoadError('setup')
      setLoading(false)
      return
    }

    const db = getViewerClient(currentViewer)
    try {
      const queries = [
        db.from('vendors').select('*').order('created_at'),
        db.from('guests').select('*').order('created_at'),
        db.from('dates').select('*').order('d'),
        db.from('tasks').select('*').order('created_at'),
        db.from('media_items').select('*').order('created_at'),
        db.from('activity_log').select('*').order('ts', { ascending: false }).limit(200),
        db.from('chat_messages').select('*').order('ts'),
        db.from('media_categories').select('*').order('sort_order'),
        db.from('checklist_categories').select('*').order('sort_order'),
        db.from('notes').select('*').eq('owner', currentViewer).order('updated_at', { ascending: false }),
        db.from('reminders').select('*').order('due_date'),
        db.from('gifts').select('*').order('created_at'),
        db.from('seating_tables').select('*').order('sort_order'),
      ]

      const txPromise = isParentsViewer && !isNonFinancial
        ? db.from('transactions').select('*').order('date', { ascending: false })
        : Promise.resolve({ data: null })

      const [txRes, vRes, gRes, dRes, tRes, mRes, aRes, cRes, mcRes, ccRes, nRes, rRes, gfRes, tbRes] = await Promise.all([txPromise, ...queries])

      if (isParentsViewer && !isNonFinancial && txRes.data) {
        setTransactions(txRes.data)
      } else {
        setTransactions([])
      }

      if (vRes.data) setVendors(vRes.data)
      if (gRes.data) setGuests(gRes.data)
      if (dRes.data) setDates(dRes.data)
      if (mRes.data) setMediaItems(mRes.data)
      if (aRes.data) {
        const filteredActivity = isNonFinancial
          ? aRes.data.filter(a => a.tab !== 'payments' && a.icon !== '💳' && a.icon !== '💰')
          : aRes.data
        setActivityLog(filteredActivity)
        computeUnread(filteredActivity, currentViewer)
      }
      if (cRes.data) setChatMessages(cRes.data)
      if (mcRes.data?.length) setMediaCats(mcRes.data.map(r => r.name))
      if (ccRes.data?.length) setClCats(ccRes.data.map(r => r.name))
      if (nRes.data) setNotes(nRes.data)
      if (rRes.data) setReminders(rRes.data)
      if (gfRes.data) setGifts(gfRes.data)
      if (tbRes.data) setTables(tbRes.data)
      if (tRes.data && tRes.data.length === 0) await seedDefaultTasks(db)
      else if (tRes.data) setTasks(tRes.data)
      setSyncStatus('saved')
    } catch (e) {
      console.error('Load error:', e)
      setSyncStatus('error')
      // Distinguish offline vs real error
      if (!navigator.onLine) {
        setLoadError('offline')
      } else {
        setLoadError('error')
      }
    }
    setLoading(false)
  }

  async function seedDefaultTasks(db = supabase) {
    const allTasks = []
    Object.entries(DEF_TASKS).forEach(([cat, taskList]) => {
      taskList.forEach(task => allTasks.push({ id: uid(), task, due: '', done: cat === 'Venue & Ceremony' && task.includes('Old Oaks'), cat, created_by: 'system' }))
    })
    const { data } = await db.from('tasks').insert(allTasks).select()
    if (data) setTasks(data)
  }

  function setupRealtime(currentViewer) {
    const isParentsViewer = PARENTS.includes(currentViewer)
    const channel = supabase.channel('wedding-realtime')

    // Transactions realtime: ONLY subscribed for parents
    if (isParentsViewer) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        const db = getViewerClient(currentViewer)
        db.from('transactions').select('*').order('date', { ascending: false })
          .then(r => r.data && setTransactions(r.data))
      })
    }

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => supabase.from('vendors').select('*').order('created_at').then(r => r.data && setVendors(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => supabase.from('guests').select('*').order('created_at').then(r => r.data && setGuests(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dates' }, () => supabase.from('dates').select('*').order('d').then(r => r.data && setDates(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => supabase.from('tasks').select('*').order('created_at').then(r => r.data && setTasks(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_items' }, () => supabase.from('media_items').select('*').order('created_at').then(r => r.data && setMediaItems(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => {
        const db = getViewerClient(currentViewer)
        const isNonFin = NON_FINANCIAL.includes(currentViewer)
        db.from('activity_log').select('*').order('ts', { ascending: false }).limit(200)
          .then(r => {
            if (r.data) {
              const filtered = isNonFin
                ? r.data.filter(a => a.tab !== 'payments' && a.icon !== '💳' && a.icon !== '💰')
                : r.data
              setActivityLog(filtered)
              computeUnread(filtered, currentViewer)
            }
          })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seating_tables' }, () => supabase.from('seating_tables').select('*').order('sort_order').then(r => r.data && setTables(r.data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => {
        const db2 = getViewerClient(currentViewer)
        db2.from('notes').select('*').eq('owner', currentViewer).order('updated_at', { ascending: false }).then(r => r.data && setNotes(r.data))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }

  function computeUnread(log, currentViewer = viewer) {
    const ts = JSON.parse(localStorage.getItem('pn-read-ts') || '{}')
    const isNonFin = NON_FINANCIAL.includes(currentViewer)
    const counts = {}
    log.forEach(a => {
      // Non-financial users never see payment badges — not even a count
      if (isNonFin && (a.tab === 'payments' || a.icon === '💳' || a.icon === '💰')) return
      if (a.ts > (ts[a.tab] || 0)) counts[a.tab] = (counts[a.tab] || 0) + 1
    })
    counts.activity = Object.values(counts).reduce((s, v) => s + v, 0)
    setUnreadCounts(counts)
  }

  function markTabRead(tab) {
    const now = Date.now()
    const newTs = { ...readTimestamps, [tab]: now }
    setReadTimestamps(newTs)
    localStorage.setItem('pn-read-ts', JSON.stringify(newTs))
    setUnreadCounts(prev => { const n = { ...prev }; delete n[tab]; n.activity = Math.max(0, (n.activity || 0) - (prev[tab] || 0)); return n })
  }

  function markAllRead() {
    const now = Date.now()
    // Never include 'payments' tab for non-financial users — it doesn't exist for them
    const tabs = isParents
      ? ['vendors','payments','guests','timeline','checklist','media','ideas','notes','gifts','seating']
      : ['vendors','guests','timeline','checklist','media','ideas','notes','gifts','seating']
    const newTs = {}
    tabs.forEach(t => newTs[t] = now)
    localStorage.setItem('pn-read-ts', JSON.stringify(newTs))
    setReadTimestamps(newTs)
    setUnreadCounts({})
  }

  async function logActivity(icon, who, descr, tab) {
    // Never log financial activity for non-financial users — extra safety net
    if (NON_FINANCIAL.includes(viewer) && (tab === 'payments' || icon === '💳' || icon === '💰')) return
    await supabase.from('activity_log').insert([{ id: uid(), icon, who, descr, tab, ts: Date.now() }])
  }

  // setViewer is only used internally now — login handled by PinLogin component
  function setViewer(v) {
    setViewerState(v)
    localStorage.setItem('pn-viewer', v)
    // Wipe financial state immediately for ANY non-financial viewer
    if (NON_FINANCIAL.includes(v)) {
      setTransactions([])
    }
    loadAll(v)
  }

  function showTab(tab) {
    setActiveTab(tab)
    markTabRead(tab)
  }

  const daysLeft = Math.ceil((WEDDING_DATE - new Date().setHours(0,0,0,0)) / 86400000)
  const confirmedGuests = guests.filter(g => g.rsvp === 'confirmed').length
  const doneTasks = tasks.filter(t => t.done).length
  const totalContrib = transactions.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0)
  const totalPaidOut = transactions.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0)
  const balance = totalContrib - totalPaidOut

  const [showSearch, setShowSearch] = useState(false)
  const [showEmailImport, setShowEmailImport] = useState(false)
  const [showPlannerShare, setShowPlannerShare] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [hoveredTab, setHoveredTab] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)

  // ── PIN LOGIN GATE ───────────────────────────────────
  function handleLogin(name) {
    // Hard-wipe financial state BEFORE loading — for non-financial users
    // this ensures transactions are never in memory even during the load
    if (NON_FINANCIAL.includes(name)) {
      setTransactions([])
    }
    setViewerState(name)
    loadAll(name)
    setupRealtime(name)
  }

  function handleSignOut() {
    // Clear localStorage so the app doesn't auto-login next time
    localStorage.removeItem('pn-viewer')
    localStorage.removeItem('pn-read-ts')
    localStorage.removeItem('pn-session-valid')
    setViewerState(null)
    setLoadError(false)
    setNotes([])
    setReminders([])
    setGifts([])
    setTables([])
    setTransactions([])
    setVendors([])
    setGuests([])
    setDates([])
    setTasks([])
    setMediaItems([])
    setActivityLog([])
    setChatMessages([])
  }

  // Show PIN login screen if not authenticated
  if (!viewer) {
    return <PinLogin onLogin={handleLogin} />
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #FCF0F3 0%, #FDF9F5 40%, #F5F0FA 75%, #EEF3FA 100%)', padding: '2rem' }}>
      <div style={{ fontSize: 44, marginBottom: 14, filter: 'drop-shadow(0 4px 12px rgba(196,105,122,0.3))' }}>💍</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#8B3A47', fontFamily: "'Cormorant Garamond', Georgia, serif", marginBottom: 6, letterSpacing: '-0.02em' }}>Perri &amp; Noah</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>Wedding Planner</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#C4697A', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.5 }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )

  // Error screens — shown when connection fails
  if (loadError) {
    const screens = {
      offline: {
        icon: '📵',
        title: 'No internet connection',
        message: 'The app needs internet to load your wedding data. Connect to wifi or mobile data, then tap Retry.',
        action: 'Retry',
      },
      setup: {
        icon: '⚙️',
        title: 'App not configured yet',
        message: 'The Supabase database credentials haven\'t been added yet. Follow the setup instructions in the README to connect your database.',
        action: null,
      },
      error: {
        icon: '🔌',
        title: 'Couldn\'t connect',
        message: 'There was a problem reaching the database. Check your internet connection and try again. If the problem continues, the service may be temporarily unavailable.',
        action: 'Retry',
      },
    }
    const screen = screens[loadError] || screens.error
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #F9EEF0, #FAF8F5)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{screen.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#8B3A47', fontFamily: 'Georgia, serif', marginBottom: 10 }}>{screen.title}</div>
        <div style={{ fontSize: 14, color: '#78716C', lineHeight: 1.7, maxWidth: 320, marginBottom: 24 }}>{screen.message}</div>
        {screen.action && (
          <button
            onClick={() => { setLoadError(false); loadAll(viewer) }}
            style={{ padding: '12px 32px', borderRadius: 14, border: 'none', background: '#C4697A', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 12px rgba(196,105,122,0.3)' }}
          >
            {screen.action}
          </button>
        )}
        <button
          onClick={() => {
            // Force clear everything including localStorage then reload
            localStorage.removeItem('pn-viewer')
            localStorage.removeItem('pn-read-ts')
            localStorage.removeItem('pn-session-valid')
            window.location.reload()
          }}
          style={{ marginTop: 14, padding: '8px 20px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'white', color: '#78716C', fontSize: 13, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    )
  }

  const person = PEOPLE[viewer] || {}

  return (
    <div style={S.app}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        {/* Radial glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 90% at 50% -10%, rgba(196,105,122,0.09) 0%, transparent 70%)', pointerEvents: 'none' }} />
        {/* Animated petals */}
        <div style={{ position: 'absolute', top: 10, left: 18, fontSize: 22, opacity: 0.2, animation: 'floatPetal 4s ease-in-out infinite' }}>🌸</div>
        <div style={{ position: 'absolute', top: 5, left: '32%', fontSize: 12, opacity: 0.12, animation: 'floatPetal 5s ease-in-out 1.2s infinite' }}>✿</div>
        <div style={{ position: 'absolute', bottom: 10, right: 18, fontSize: 18, opacity: 0.18, animation: 'floatPetal 3.8s ease-in-out 0.6s infinite' }}>🌸</div>
        <div style={{ position: 'absolute', bottom: 8, left: '22%', fontSize: 14, opacity: 0.12, animation: 'floatPetal 4.5s ease-in-out 1.8s infinite' }}>🌿</div>

        <div style={{ position: 'relative' }}>
          {/* Ring icon */}
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: '1.5px solid rgba(196,105,122,0.18)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 16px rgba(196,105,122,0.12), inset 0 1px 0 white' }}>
            💍
          </div>
          <div style={S.h1}>Perri &amp; Noah</div>
          <div style={S.sub}>Saturday · October 16, 2027 · Old Oaks Country Club</div>
          <div style={S.countdown}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'var(--rose-dark)' }}>{daysLeft}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>days away</span>
          </div>
        </div>

        {/* Action buttons — compact pill row */}
        <div style={{ position: 'absolute', top: 14, right: 10, display: 'flex', gap: 5 }}>
          {[
            { icon: '?', fn: () => setShowHelp(true), title: 'Help', fw: 800 },
            { icon: '🔍', fn: () => setShowSearch(true), title: 'Search' },
            { icon: '📤', fn: () => setShowPlannerShare(true), title: 'Share with planner' },
            { icon: '📧', fn: () => setShowEmailImport(true), title: 'Import from email' },
          ].map(({ icon, fn, title, fw }) => (
            <button key={title} onClick={fn} title={title} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(196,105,122,0.14)', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: fw || 400, backdropFilter: 'blur(8px)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', transition: 'all 0.15s', color: 'var(--rose-dark)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(196,105,122,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.06)' }}
            >{icon}</button>
          ))}
        </div>
      </div>

      {/* HELP MODAL */}
      {showHelp && <HelpModal viewer={viewer} isParents={isParents} onClose={() => setShowHelp(false)} onNavigate={(tab) => { setShowHelp(false); showTab(tab) }} />}

      {/* EMAIL IMPORT MODAL */}
      {showEmailImport && <EmailImport viewer={viewer} guests={guests} onNavigate={(tab) => { setShowEmailImport(false); showTab(tab) }} onClose={() => setShowEmailImport(false)} />}

      {/* PLANNER SHARE MODAL */}
      {showPlannerShare && (
        <PlannerShare
          vendors={vendors}
          guests={guests}
          tasks={tasks}
          dates={dates}
          reminders={reminders}
          isParents={isParents}
          onClose={() => setShowPlannerShare(false)}
        />
      )}

      {/* GLOBAL SEARCH OVERLAY */}
      {showSearch && <SearchOverlay isParents={isParents} viewer={viewer} vendors={vendors} guests={guests} tasks={tasks} dates={dates} mediaItems={mediaItems} chatMessages={chatMessages} transactions={transactions} notes={notes} reminders={reminders} gifts={gifts} onClose={() => setShowSearch(false)} onNavigate={(tab) => { setShowSearch(false); showTab(tab) }} />}

      {/* ── VIEWER BAR ── */}
      <div style={{ background: 'linear-gradient(to right, #FFFCF8, #FDF9F5)', borderBottom: '1px solid rgba(196,105,122,0.08)', padding: '8px 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, ' + (person.avatar?.[0] || '#F9EEF0') + ', ' + (person.avatar?.[1] || '#C4697A') + '33)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: person.avatar?.[1] || 'var(--rose)', border: '2px solid ' + (person.avatar?.[1] || 'var(--rose)') + '44', flexShrink: 0 }}>
            {viewer.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Hi {viewer}! 👋</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>
              {person.role}{COUPLE.includes(viewer) ? ' · 🔒 Financial info hidden' : ''}{PLANNER_PEOPLE.includes(viewer) ? ' · 🔒 External access' : ''}
            </div>
          </div>
        </div>
        <SignOutButton onSignOut={handleSignOut} />
      </div>

      <SyncBar status={syncStatus} />

      {/* ── NAV TABS ── */}
      <div style={{ ...S.nav, scrollbarWidth: 'none' }}>
        {[
          ['overview','🏠 Home'],['activity','📋 Activity'],['ideas','💬 Chat'],
          ['vendors','🏪 Vendors'],
          ...(isParents ? [['payments','💳 Payments']] : []),
          ['guests','👤 Guests'],['seating','🪑 Seating'],['timeline','📅 Timeline'],
          ['checklist','✅ Tasks'],['notes','📝 Notes'],['gifts','🎁 Gifts'],['media','🎬 Media']
        ].map(([tab, label]) => {
          const today = new Date(); today.setHours(0,0,0,0)
          const dueSoon = tab === 'notes' && reminders.some(r => {
            if (!r.due_date || r.done) return false
            return (new Date(r.due_date + 'T00:00:00') - today) <= 3 * 86400000
          })
          const tip = TAB_TOOLTIPS[tab]
          return (
            <div key={tab} style={{ position: 'relative', flexShrink: 0 }}
              onMouseEnter={() => setHoveredTab(tab)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <button style={S.navBtn(activeTab === tab)} onClick={() => showTab(tab)}>
                {label}
                {unreadCounts[tab] > 0 && <span style={S.badge}>{unreadCounts[tab] > 9 ? '9+' : unreadCounts[tab]}</span>}
                {dueSoon && !unreadCounts[tab] && <span style={{ ...S.badge, background: '#B8956A', display: 'flex' }}>!</span>}
              </button>
              {/* Tooltip on hover */}
              {hoveredTab === tab && tip && (
                <div style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginTop: 6, zIndex: 50,
                  background: '#1C1917', color: 'white',
                  borderRadius: 10, padding: '10px 14px',
                  fontSize: 12, lineHeight: 1.5,
                  width: 200, textAlign: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                  pointerEvents: 'none',
                  whiteSpace: 'normal',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 13 }}>{tip.title}</div>
                  <div style={{ opacity: 0.8 }}>{tip.desc}</div>
                  {/* Arrow */}
                  <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, background: '#1C1917', borderRadius: 2, rotate: '45deg' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="tab-content" key={activeTab}>
        {activeTab === 'overview' && <OverviewTab {...{ isParents, balance, totalPaidOut, transactions, confirmedGuests, guests, doneTasks, tasks, daysLeft, showTab }} />}
        {activeTab === 'activity' && <ActivityTab {...{ activityLog, markAllRead }} />}
        {activeTab === 'ideas' && <IdeasTab {...{ viewer, chatMessages, logActivity, setSyncStatus }} />}
        {activeTab === 'vendors' && <VendorsTab {...{ isParents, vendors, setVendors, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'payments' && isParents && <PaymentsTab {...{ transactions, setTransactions, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'guests' && <GuestsTab {...{ guests, setGuests, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'seating' && <SeatingChartTab {...{ guests, tables, setTables, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'timeline' && <TimelineTab {...{ dates, setDates, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'checklist' && <ChecklistTab {...{ tasks, setTasks, clCats, setClCats, viewer, logActivity, setSyncStatus }} />}
        {activeTab === 'notes' && <NotesTab {...{ viewer, notes, setNotes, reminders, setReminders, logActivity, setSyncStatus }} />}
        {activeTab === 'gifts' && <GiftTrackerTab {...{ viewer, gifts, setGifts, guests, logActivity, setSyncStatus }} />}
        {activeTab === 'media' && <MediaTab {...{ mediaItems, setMediaItems, mediaCats, setMediaCats, viewer, logActivity, setSyncStatus }} />}
      </div>

      {/* ── FLOATING QUICK ADD BUTTON ── */}
      <QuickAddFAB
        fabOpen={fabOpen}
        setFabOpen={setFabOpen}
        viewer={viewer}
        clCats={clCats}
        guests={guests}
        setGuests={setGuests}
        tasks={tasks}
        setTasks={setTasks}
        vendors={vendors}
        setVendors={setVendors}
        reminders={reminders}
        setReminders={setReminders}
        chatMessages={chatMessages}
        logActivity={logActivity}
        setSyncStatus={setSyncStatus}
        showTab={showTab}
      />
    </div>
  )
}

// ── QUICK ADD FAB ─────────────────────────────────────
function QuickAddFAB({ fabOpen, setFabOpen, viewer, clCats, guests, setGuests, tasks, setTasks, vendors, setVendors, reminders, setReminders, logActivity, setSyncStatus, showTab }) {
  const [activeForm, setActiveForm] = useState(null) // 'chat'|'task'|'reminder'|'vendor'|'guest'
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [chatText, setChatText] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskCat, setTaskCat] = useState(clCats[0] || '')
  const [taskDue, setTaskDue] = useState('')
  const [reminderText, setReminderText] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderPriority, setReminderPriority] = useState('normal')
  const [vendorName, setVendorName] = useState('')
  const [vendorCat, setVendorCat] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestSide, setGuestSide] = useState("Bride's family")

  const inputRef = useRef(null)

  useEffect(() => {
    if (activeForm) setTimeout(() => inputRef.current?.focus(), 80)
  }, [activeForm])

  useEffect(() => {
    if (!fabOpen) setActiveForm(null)
  }, [fabOpen])

  function openForm(type) {
    setActiveForm(type)
    setSaved(false)
    // Reset all fields
    setChatText(''); setTaskText(''); setTaskDue(''); setTaskCat(clCats[0] || '')
    setReminderText(''); setReminderDate(''); setReminderPriority('normal')
    setVendorName(''); setVendorCat(''); setVendorPhone('')
    setGuestName(''); setGuestSide("Bride's family")
  }

  function close() { setFabOpen(false); setActiveForm(null); setSaved(false) }

  async function submit() {
    if (saving) return
    setSaving(true)
    setSyncStatus('saving')
    try {
      switch (activeForm) {
        case 'chat':
          if (!chatText.trim()) break
          await supabase.from('chat_messages').insert([{ id: uid(), who: viewer, text: chatText.trim(), cat: '', ts: Date.now() }])
          await logActivity('💬', viewer, 'sent a message', 'ideas')
          break
        case 'task':
          if (!taskText.trim()) break
          const { data: td } = await supabase.from('tasks').insert([{ id: uid(), task: taskText.trim(), cat: taskCat || clCats[0] || 'General', due: taskDue || null, done: false, created_by: viewer }]).select()
          if (td) setTasks(prev => [...prev, ...td])
          await logActivity('📝', viewer, 'added task: ' + taskText, 'checklist')
          break
        case 'reminder':
          if (!reminderText.trim()) break
          const { data: rd } = await supabase.from('reminders').insert([{ id: uid(), text: reminderText.trim(), due_date: reminderDate || null, priority: reminderPriority, for_who: 'Everyone', created_by: viewer, is_private: false, done: false }]).select()
          if (rd) setReminders(prev => [...prev, ...rd].sort((a,b) => (a.due_date||'9999') > (b.due_date||'9999') ? 1 : -1))
          await logActivity('🔔', viewer, 'added a reminder: ' + reminderText, 'notes')
          break
        case 'vendor':
          if (!vendorName.trim()) break
          const { data: vd } = await supabase.from('vendors').insert([{ id: uid(), name: vendorName.trim(), cat: vendorCat, phone: vendorPhone, email: '', address: '', contact_name: '', status: 'pending', notes: '', created_by: viewer }]).select()
          if (vd) setVendors(prev => [...prev, ...vd])
          await logActivity('🏪', viewer, 'added vendor: ' + vendorName, 'vendors')
          break
        case 'guest':
          if (!guestName.trim()) break
          const { data: gd } = await supabase.from('guests').insert([{ id: uid(), name: guestName.trim(), side: guestSide, rsvp: 'awaiting', created_by: viewer }]).select()
          if (gd) setGuests(prev => [...prev, ...gd])
          await logActivity('👤', viewer, 'added guest: ' + guestName, 'guests')
          break
      }
      setSyncStatus('saved')
      setSaved(true)
      setTimeout(() => { close(); showTab(formToTab[activeForm]) }, 900)
    } catch(e) {
      console.error(e)
      setSyncStatus('error')
    }
    setSaving(false)
  }

  const formToTab = { chat: 'ideas', task: 'checklist', reminder: 'notes', vendor: 'vendors', guest: 'guests' }

  const FAB_ITEMS = [
    { type: 'chat',     icon: '💬', label: 'Message',  color: '#C4697A' },
    { type: 'task',     icon: '✅', label: 'Task',     color: '#4A9B6F' },
    { type: 'reminder', icon: '🔔', label: 'Reminder', color: '#B8956A' },
    { type: 'vendor',   icon: '🏪', label: 'Vendor',   color: '#2C6B8B' },
    { type: 'guest',    icon: '👤', label: 'Guest',    color: '#7B4B8B' },
  ]

  return (
    <>
      {/* Backdrop when FAB open */}
      {fabOpen && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* Quick form sheet */}
      {fabOpen && activeForm && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 2rem)', maxWidth: 480, zIndex: 92, background: 'white', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: '1.25rem', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease' }}>
          {/* Form header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: FAB_ITEMS.find(f=>f.type===activeForm)?.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {FAB_ITEMS.find(f=>f.type===activeForm)?.icon}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Quick add {FAB_ITEMS.find(f=>f.type===activeForm)?.label.toLowerCase()}</div>
          </div>

          {/* ── CHAT FORM ── */}
          {activeForm === 'chat' && (
            <textarea ref={inputRef} value={chatText} onChange={e=>setChatText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="Share an idea, thought, or question with everyone…" rows={3} style={{ width:'100%', resize:'none', fontSize:15, lineHeight:1.5, marginBottom:12 }} />
          )}

          {/* ── TASK FORM ── */}
          {activeForm === 'task' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
              <input ref={inputRef} value={taskText} onChange={e=>setTaskText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="What needs to be done?" style={{ fontSize:15 }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Category</div>
                  <select value={taskCat} onChange={e=>setTaskCat(e.target.value)} style={{ fontSize:13 }}>
                    {clCats.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Due date</div>
                  <input type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)} style={{ fontSize:13 }} />
                </div>
              </div>
            </div>
          )}

          {/* ── REMINDER FORM ── */}
          {activeForm === 'reminder' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
              <input ref={inputRef} value={reminderText} onChange={e=>setReminderText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="What's the reminder?" style={{ fontSize:15 }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Due date</div>
                  <input type="date" value={reminderDate} onChange={e=>setReminderDate(e.target.value)} style={{ fontSize:13 }} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Priority</div>
                  <select value={reminderPriority} onChange={e=>setReminderPriority(e.target.value)} style={{ fontSize:13 }}>
                    <option value="high">🔴 High</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="low">🟢 Low</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── VENDOR FORM ── */}
          {activeForm === 'vendor' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
              <input ref={inputRef} value={vendorName} onChange={e=>setVendorName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="Vendor name" style={{ fontSize:15 }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Category</div>
                  <select value={vendorCat} onChange={e=>setVendorCat(e.target.value)} style={{ fontSize:13 }}>
                    {['','Venue','Florals','Photography','Videography','Bands & Music','Catering','Hair & Makeup','Cake & Desserts','Transportation','Other'].map(c=><option key={c} value={c}>{c||'—'}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Phone</div>
                  <input type="tel" value={vendorPhone} onChange={e=>setVendorPhone(e.target.value)} placeholder="Optional" style={{ fontSize:13 }} />
                </div>
              </div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>You can add more details (email, address, notes) in the Vendors tab.</div>
            </div>
          )}

          {/* ── GUEST FORM ── */}
          {activeForm === 'guest' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
              <input ref={inputRef} value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="Guest name (e.g. John & Jane Smith)" style={{ fontSize:15 }} />
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Side</div>
                <select value={guestSide} onChange={e=>setGuestSide(e.target.value)} style={{ fontSize:14 }}>
                  {["Bride's family","Groom's family","Friends of couple"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={submit}
            disabled={saving || saved}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background: saved ? 'linear-gradient(135deg, #5EC48A, #4A9B6F)' : `linear-gradient(135deg, ${FAB_ITEMS.find(f=>f.type===activeForm)?.color || '#D4788A'}DD, ${FAB_ITEMS.find(f=>f.type===activeForm)?.color || '#C4697A'})`, color:'white', fontSize:15, fontWeight:700, cursor: saving||saved ? 'default' : 'pointer', transition:'background 0.2s', boxShadow: saved ? '0 2px 8px rgba(74,155,111,0.3)' : '0 2px 12px rgba(0,0,0,0.15)' }}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving…' : `Save ${FAB_ITEMS.find(f=>f.type===activeForm)?.label}`}
          </button>
        </div>
      )}

      {/* Fan-out action buttons */}
      {fabOpen && !activeForm && FAB_ITEMS.map((item, i) => {
        const angle = -90 - (i * 40)
        const rad = (angle * Math.PI) / 180
        const r = 76
        const x = Math.cos(rad) * r
        const y = Math.sin(rad) * r
        return (
          <div key={item.type} onClick={() => openForm(item.type)} style={{ position:'fixed', bottom: `calc(28px + ${-y}px)`, right: `calc(20px + ${-x}px)`, zIndex:91, display:'flex', alignItems:'center', gap:8, cursor:'pointer', animation:`fanOut 0.2s ease ${i*0.04}s both` }}>
            {/* Label pill */}
            <div style={{ background:'#1C1917', color:'white', fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20, whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>{item.label}</div>
            {/* Icon circle */}
            <div style={{ width:46, height:46, borderRadius:'50%', background:item.color, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:`0 3px 12px ${item.color}55`, flexShrink:0 }}>{item.icon}</div>
          </div>
        )
      })}

      {/* Main FAB button */}
      <button
        onClick={() => { if (activeForm) { close() } else { setFabOpen(f => !f) } }}
        style={{ position:'fixed', bottom:24, right:20, width:54, height:54, borderRadius:'50%', background: fabOpen ? '#1C1917' : 'var(--rose)', border:'none', color:'white', fontSize: fabOpen ? 22 : 26, fontWeight:700, cursor:'pointer', zIndex:93, boxShadow: fabOpen ? '0 4px 20px rgba(0,0,0,0.35)' : '0 4px 20px rgba(196,105,122,0.5)', transition:'all 0.2s ease', transform: fabOpen ? 'rotate(45deg)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}
        title="Quick add"
      >
        +
      </button>

      <style>{`
        @keyframes fanOut { from { opacity:0; transform:scale(0.6); } to { opacity:1; transform:scale(1); } }
        @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </>
  )
}

// ── TAB TOOLTIPS ──────────────────────────────────────
const TAB_TOOLTIPS = {
  overview:  { title: 'Overview', desc: 'Your wedding dashboard — countdown, key stats, and quick links.' },
  activity:  { title: 'Activity Feed', desc: 'Everything that happens in the app, in real time. See who added what.' },
  ideas:     { title: 'Ideas & Chat', desc: 'Group chat for the whole family. Long-press any message to save it.' },
  vendors:   { title: 'Vendors', desc: 'Add vendors, view contact details, and access the quick-dial contact sheet.' },
  payments:  { title: 'Payments', desc: 'Log payments, track contributions, and see the family budget split.' },
  guests:    { title: 'Guest List', desc: 'Track RSVPs. Tap the status to update someone directly in the list.' },
  seating:   { title: 'Seating Chart', desc: 'Drag guests onto tables. Use the dropdown on mobile to assign.' },
  timeline:  { title: 'Timeline', desc: 'Planning milestones and key contract deadlines — all in one place.' },
  checklist: { title: 'Checklist', desc: 'Wedding to-do list by category. Tap any task to mark it done.' },
  notes:     { title: 'Notes & Reminders', desc: 'My Notes are private to you. Reminders can be shared or private.' },
  gifts:     { title: 'Gift Tracker', desc: 'Log gifts and track thank-you notes. Filter by pending or sent.' },
  media:     { title: 'Media & Reviews', desc: 'Share videos and photos of vendors. Rate and comment together.' },
}

// ── HELP MODAL ────────────────────────────────────────
const HELP_SECTIONS = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting started',
    items: [
      { q: 'How do I sign in?', a: 'Tap your name on the login screen and enter your 4-digit PIN. First time? You\'ll be asked to create one. Your device remembers you after that.' },
      { q: 'Is my data shared with everyone?', a: 'Yes — all planning data syncs live across everyone\'s phones. The only exceptions: My Notes are private to you, private Reminders are only visible to you, and financials are only visible to parents (Glenn, Stephanie, David, Bonni).' },
      { q: 'How do I install this on my phone?', a: 'On iPhone: open the app URL in Safari, tap the Share button (box with arrow), then "Add to Home Screen." On Android: open in Chrome, tap the three dots menu, then "Add to Home Screen."' },
    ]
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Ideas & Chat',
    items: [
      { q: 'How do I send a message?', a: 'Type in the input bar at the bottom and tap the ↑ button or press Enter. You can tag messages with a category (Venue, Florals, etc.) using the pills above the input.' },
      { q: 'How do I save an important message?', a: 'Long-press (hold) any bubble for half a second. A sheet will slide up — choose a category, add an optional note, then tap Save. Find saved ideas in the 🔖 Saved tab.' },
      { q: 'Can I edit a saved idea?', a: 'Yes — go to 🔖 Saved, find the card, and tap the ✏️ icon. You can change the category or update your note at any time.' },
    ]
  },
  {
    id: 'vendors',
    icon: '🏪',
    title: 'Vendors',
    items: [
      { q: 'How do I add a vendor?', a: 'Tap "+ Add vendor" and fill in the name, category, contact name, phone, email, and address. These details will appear in the contact sheet.' },
      { q: 'What is the Contact Sheet?', a: 'Tap "📞 Contact Sheet" at the top of the Vendors tab to see every vendor as a quick-dial card. Tap a phone number to call, email to open mail, or address to open Maps.' },
      { q: 'Can I import a vendor from an email?', a: 'Yes — tap 📧 in the header, paste the email, and Claude will extract the vendor details automatically and suggest adding them.' },
    ]
  },
  {
    id: 'guests',
    icon: '👤',
    title: 'Guest List',
    items: [
      { q: 'How do I update an RSVP?', a: 'Find the guest in the list and tap the coloured status badge on the right — it\'s a dropdown. Change it directly to Confirmed, Awaiting, or Declined without opening any form.' },
      { q: 'How do I filter the guest list?', a: 'Use the filter pills at the top — All, ✓ Confirmed, ⏳ Awaiting, ✗ Declined — to see a specific group.' },
    ]
  },
  {
    id: 'seating',
    icon: '🪑',
    title: 'Seating Chart',
    items: [
      { q: 'How do I assign guests to tables?', a: 'On desktop: drag a guest chip from the Unassigned pool and drop it on any table card. On mobile: use the "+ Assign a guest…" dropdown at the bottom of each table.' },
      { q: 'How do I move a guest to a different table?', a: 'Drag their chip from one table card onto another. Or tap × on their chip to return them to unassigned, then reassign.' },
      { q: 'What is Auto-assign?', a: 'Tap "⚡ Auto-assign unassigned" to distribute all unassigned guests evenly across tables with available capacity. You can rearrange from there.' },
    ]
  },
  {
    id: 'checklist',
    icon: '✅',
    title: 'Checklist',
    items: [
      { q: 'How do I check off a task?', a: 'Tap anywhere on the task row — the whole row is tappable. It turns green and moves to the done state. Tap again to uncheck.' },
      { q: 'How do I add a custom task?', a: 'Tap "+ Add task," type the task name, optionally set a due date, and choose a category. It appears in that category immediately.' },
      { q: 'Can I add a new category?', a: 'Yes — tap "+ Add category" and type a name. It appears as a new pill in the tab bar.' },
    ]
  },
  {
    id: 'notes',
    icon: '📝',
    title: 'Notes & Reminders',
    items: [
      { q: 'What is the difference between Notes and Reminders?', a: 'My Notes are completely private — only you can see them. Reminders can be shared with everyone or set to private. Shared reminders show up for the whole group.' },
      { q: 'How do I create a private reminder?', a: 'Tap "+ Add reminder," then tap "🔒 Private" in the toggle at the top of the form. Only you will see it — it\'s blocked at the database level for everyone else.' },
      { q: 'What triggers the orange ! badge on the Notes tab?', a: 'When any shared reminder has a due date within 3 days, the badge appears to alert the whole group.' },
    ]
  },
  {
    id: 'gifts',
    icon: '🎁',
    title: 'Gift Tracker',
    items: [
      { q: 'How do I log a gift?', a: 'Tap "+ Log gift," type the name (the guest list auto-suggests names), describe the gift, set the type (cash, physical, etc.), and optionally enter an amount.' },
      { q: 'How do I mark a thank-you note as sent?', a: 'Tap the circle on the left of any gift row. It turns green and the row fades. The progress bar at the top tracks your completion.' },
    ]
  },
  {
    id: 'media',
    icon: '🎬',
    title: 'Media & Reviews',
    items: [
      { q: 'How do I search for wedding photos?', a: 'Tap "🔍 Search photos" in the Media tab to search thousands of free professional wedding photos from Unsplash. Tap any photo to save it directly to a category.' },
      { q: 'How do I add a video or link?', a: 'Tap "+ Paste a link" in the Media tab and paste a YouTube, Vimeo, Google Photos, or Google Drive link. Add a title and tap "Add to board."' },
      { q: 'How do I add a photo?', a: 'Use the same form and choose the Photos category. Tap the file upload field to pick a photo from your phone. It shows a preview before you save.' },
      { q: 'How do I rate a vendor?', a: 'Open the Media tab, find the vendor\'s card, and tap the stars. Make sure you\'re signed in as yourself first — ratings are tracked per person.' },
    ]
  },
  {
    id: 'search',
    icon: '🔍',
    title: 'Search & header buttons',
    items: [
      { q: 'What does 🔍 search?', a: 'Everything — vendors, guests, tasks, chat messages, notes, reminders, gifts, media, and payments (parents only). Type at least 2 characters and matching results appear instantly.' },
      { q: 'What is 📤?', a: 'The planner share button. Tap it to copy the app link or generate a full status email to send to your wedding planner.' },
      { q: 'What is 📧?', a: 'Email import — paste any email and the app reads it, extracts vendor info, RSVPs, deadlines, or booking confirmations, and adds them to the right tab automatically. Works on any phone without any setup.' },
    ]
  },
]

function HelpModal({ viewer, isParents, onClose, onNavigate }) {
  const [searchQ, setSearchQ] = useState('')
  const [openSection, setOpenSection] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80) }, [])
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const q = searchQ.toLowerCase().trim()

  // Flatten all items for search
  const allItems = HELP_SECTIONS.flatMap(s =>
    s.items.map(item => ({ ...item, sectionIcon: s.icon, sectionTitle: s.title, sectionId: s.id }))
  )

  const searchResults = q.length >= 2
    ? allItems.filter(item =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      )
    : []

  function highlight(text) {
    if (!q || q.length < 2) return text
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#F9EEF0', color: '#8B3A47', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 1rem 1rem', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 580, background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', marginBottom: '2rem' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #8B3A47, #C4697A)', padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>Help & Guide</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>Perri & Noah Wedding Planner</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', opacity: 0.8, lineHeight: 1 }}>×</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 12, fontSize: 15, color: 'var(--text-tertiary)' }}>🔍</span>
            <input
              ref={searchRef}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search help topics… e.g. 'save a message', 'add a guest'"
              style={{ width: '100%', paddingLeft: 36, borderRadius: 10, fontSize: 14 }}
            />
            {searchQ && <button onClick={() => setSearchQ('')} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-tertiary)' }}>×</button>}
          </div>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 140px)' }}>

          {/* Search results */}
          {q.length >= 2 && (
            <div style={{ padding: '12px 16px' }}>
              {searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  No results for "{searchQ}" — try different words
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </div>
                  {searchResults.map((item, i) => (
                    <div key={i} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 8, boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{item.sectionIcon}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{item.sectionTitle}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>{highlight(item.q)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{highlight(item.a)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Section list when not searching */}
          {q.length < 2 && (
            <div style={{ padding: '8px 0' }}>
              {/* Quick tips bar */}
              <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--border)', background: '#FEF9F5' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rose-dark)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Quick tips</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['💬', 'Long-press a chat bubble to save it'],
                    ['🔍', 'Search searches everything at once'],
                    ['📧', 'Paste emails to auto-import them'],
                    ['📤', 'Share updates with your planner'],
                    ['🔒', 'Private notes are only visible to you'],
                    ['✅', 'Tap any task row to check it off'],
                  ].map(([icon, tip]) => (
                    <div key={tip} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <span style={{ flexShrink: 0 }}>{icon}</span><span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sections as accordion */}
              {HELP_SECTIONS.map(section => {
                const isOpen = openSection === section.id
                return (
                  <div key={section.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setOpenSection(isOpen ? null : section.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: isOpen ? '#FEF9F5' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{section.icon}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{section.title}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 400 }}>{section.items.length} tips</span>
                      <span style={{ fontSize: 14, color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginLeft: 4 }}>›</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 16px 14px', background: '#FEF9F5' }}>
                        {section.items.map((item, i) => (
                          <div key={i} style={{ marginBottom: i < section.items.length - 1 ? 14 : 0, paddingBottom: i < section.items.length - 1 ? 14 : 0, borderBottom: i < section.items.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', gap: 6 }}>
                              <span style={{ color: 'var(--rose)', flexShrink: 0 }}>Q</span>
                              {item.q}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 18 }}>{item.a}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Footer */}
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                All data syncs live across all devices 💍<br />
                Questions? Ask in the Ideas & Chat tab — someone will see it.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PLANNER SHARE ─────────────────────────────────────
function PlannerShare({ vendors, guests, tasks, dates, reminders, isParents, onClose }) {
  const [copied, setCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  const today = new Date(); today.setHours(0,0,0,0)
  const FIXED_DATES_LOCAL = [
    { d: '2027-10-11', title: 'Final guest count due to Old Oaks' },
    { d: '2027-10-02', title: 'Outside vendors submit proof of insurance' },
    { d: '2027-10-16', title: 'Wedding day — Perri & Noah' },
  ]

  const confirmedGuests = guests.filter(g => g.rsvp === 'confirmed').length
  const doneTasks = tasks.filter(t => t.done).length
  const upcomingDates = [...dates, ...FIXED_DATES_LOCAL]
    .sort((a,b) => a.d.localeCompare(b.d))
    .filter(d => new Date(d.d + 'T00:00:00') >= today)
    .slice(0, 6)
  const activeReminders = reminders.filter(r => !r.done && !r.is_private).slice(0, 5)
  const bookedVendors = vendors.filter(v => v.status === 'deposit' || v.status === 'paid')
  const pendingVendors = vendors.filter(v => v.status === 'pending')

  // Build the plain-text email summary
  const appUrl = window.location.href.split('?')[0]
  const emailBody = `Hi,

Here's a quick status update for Perri & Noah's wedding — October 16, 2027, Old Oaks Country Club.

──────────────────────────────
GUEST COUNT
──────────────────────────────
Confirmed: ${confirmedGuests} of ${guests.length} invited

──────────────────────────────
UPCOMING DATES
──────────────────────────────
${upcomingDates.map(d => `${fmtDate(d.d)} — ${d.title}`).join('\n')}

──────────────────────────────
VENDORS CONFIRMED
──────────────────────────────
${[{ name: 'Old Oaks Country Club', cat: 'Venue', contact_name: 'Iwona Sterk', phone: '914-683-6000', email: 'iwona.sterk@oldoaks.com' }, ...bookedVendors].map(v => `${v.name}${v.cat ? ` (${v.cat})` : ''}${v.contact_name ? ` — ${v.contact_name}` : ''}${v.phone ? ` · ${v.phone}` : ''}`).join('\n')}

──────────────────────────────
VENDORS PENDING DECISION
──────────────────────────────
${pendingVendors.length ? pendingVendors.map(v => `${v.name}${v.cat ? ` (${v.cat})` : ''}`).join('\n') : 'None at this time'}

──────────────────────────────
ACTIVE REMINDERS
──────────────────────────────
${activeReminders.length ? activeReminders.map(r => `• ${r.text}${r.due_date ? ` — due ${fmtDate(r.due_date)}` : ''}`).join('\n') : 'No active reminders'}

──────────────────────────────
PLANNING PROGRESS
──────────────────────────────
Checklist: ${doneTasks} of ${tasks.length} tasks complete (${tasks.length ? Math.round(doneTasks/tasks.length*100) : 0}%)

──────────────────────────────
APP ACCESS
──────────────────────────────
The full planning app is available at:
${appUrl}

Sign in as "Planner" with the PIN we shared with you. You'll have access to the vendor list, guest list, timeline, checklist, media board, and group chat.

Best,
Perri & Noah Wedding Team`

  function copyEmail() {
    navigator.clipboard.writeText(emailBody).then(() => {
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 2500)
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const S2 = {
    section: { marginBottom: '1.25rem' },
    sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
    chip: (color) => ({ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: color[0], color: color[1], fontWeight: 600 }),
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 1rem', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', marginBottom: '2rem' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1B5E5E, #2E8B8B)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>📤 Share with wedding planner</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Current status summary + app access</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', opacity: 0.8, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '1.25rem' }}>

          {/* App access section */}
          <div style={{ background: '#EDF4F4', border: '1px solid #A8D4D4', borderRadius: 12, padding: '12px 14px', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1B5E5E', marginBottom: 6 }}>🔑 Planner app access</div>
            <div style={{ fontSize: 13, color: '#2E5E5E', lineHeight: 1.6, marginBottom: 10 }}>
              Your planner signs in as <strong>"Planner"</strong> using the PIN you share with them. They'll see everything except financial details — vendors, guests, timeline, checklist, chat, and media.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copyLink} style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: copied ? '#4A9B6F' : '#1B5E5E', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
                {copied ? '✓ Copied!' : '🔗 Copy app link'}
              </button>
            </div>
          </div>

          {/* Status snapshot */}
          <div style={S2.section}>
            <div style={S2.sectionLabel}>Status snapshot</div>
            <div style={S2.row}><span style={{ color: 'var(--text-secondary)' }}>Guest count</span><span style={{ fontWeight: 600 }}>{confirmedGuests} confirmed of {guests.length}</span></div>
            <div style={S2.row}><span style={{ color: 'var(--text-secondary)' }}>Checklist</span><span style={{ fontWeight: 600 }}>{doneTasks}/{tasks.length} tasks done</span></div>
            <div style={S2.row}><span style={{ color: 'var(--text-secondary)' }}>Vendors booked</span><span style={{ fontWeight: 600 }}>{bookedVendors.length + 1} (inc. Old Oaks)</span></div>
            <div style={{ ...S2.row, borderBottom: 'none' }}><span style={{ color: 'var(--text-secondary)' }}>Pending decisions</span><span style={{ fontWeight: 600 }}>{pendingVendors.length} vendors</span></div>
          </div>

          {/* Upcoming dates */}
          <div style={S2.section}>
            <div style={S2.sectionLabel}>Next key dates</div>
            {upcomingDates.slice(0, 4).map((d, i) => {
              const daysAway = Math.ceil((new Date(d.d + 'T00:00:00') - today) / 86400000)
              const isWedding = d.d === '2027-10-16'
              return (
                <div key={i} style={{ ...S2.row, borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isWedding ? 'var(--rose-dark)' : 'var(--text-primary)' }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(d.d)}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: isWedding ? 'var(--rose-light)' : 'var(--bg-secondary)', color: isWedding ? 'var(--rose-dark)' : 'var(--text-secondary)', fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{daysAway}d</span>
                </div>
              )
            })}
          </div>

          {/* Active reminders */}
          {activeReminders.length > 0 && (
            <div style={S2.section}>
              <div style={S2.sectionLabel}>Active reminders</div>
              {activeReminders.map((r, i) => (
                <div key={r.id} style={{ ...S2.row, borderBottom: i < activeReminders.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{r.text}</span>
                  {r.due_date && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{fmtDate(r.due_date)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Email summary */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '12px 14px', marginBottom: '1rem' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>📧 Full email summary</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
              Copy a complete status email to send to your planner — includes all vendors, dates, guests, reminders, and app access instructions.
            </div>
            <button onClick={copyEmail} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: emailCopied ? '#EBF7F0' : 'white', color: emailCopied ? '#2D6A4F' : 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
              {emailCopied ? '✓ Copied to clipboard!' : '📋 Copy email summary'}
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
            Paste into any email app · Financial details are never included
          </div>
        </div>
      </div>
    </div>
  )
}

// ── GLOBAL SEARCH ─────────────────────────────────────
function SearchOverlay({ isParents, viewer, vendors, guests, tasks, dates, mediaItems, chatMessages, transactions, notes, reminders, gifts, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const q = query.toLowerCase().trim()

  const results = q.length < 2 ? [] : [
    // Vendors
    ...vendors
      .filter(v => v.name?.toLowerCase().includes(q) || v.cat?.toLowerCase().includes(q) || v.notes?.toLowerCase().includes(q) || v.contact_name?.toLowerCase().includes(q) || v.phone?.includes(q) || v.email?.toLowerCase().includes(q))
      .map(v => ({ type: 'Vendor', icon: '🏪', title: v.name, sub: [v.cat, v.contact_name, v.phone].filter(Boolean).join(' · '), tab: 'vendors', badge: v.status })),

    // Guests
    ...guests
      .filter(g => g.name?.toLowerCase().includes(q) || g.side?.toLowerCase().includes(q))
      .map(g => ({ type: 'Guest', icon: '👤', title: g.name, sub: g.side + ' · ' + g.rsvp, tab: 'guests' })),

    // Tasks
    ...tasks
      .filter(t => t.task?.toLowerCase().includes(q) || t.cat?.toLowerCase().includes(q))
      .map(t => ({ type: 'Task', icon: t.done ? '✅' : '📝', title: t.task, sub: t.cat + (t.done ? ' · Done' : ''), tab: 'checklist' })),

    // Timeline dates
    ...dates
      .filter(d => d.title?.toLowerCase().includes(q) || d.descr?.toLowerCase().includes(q))
      .map(d => ({ type: 'Date', icon: '📅', title: d.title, sub: fmtDate(d.d), tab: 'timeline' })),

    // Media
    ...mediaItems
      .filter(m => m.title?.toLowerCase().includes(q) || m.cat?.toLowerCase().includes(q) || m.notes?.toLowerCase().includes(q))
      .map(m => ({ type: 'Media', icon: '🎬', title: m.title, sub: m.cat + (m.notes ? ' · ' + m.notes : ''), tab: 'media' })),

    // Chat messages
    ...chatMessages
      .filter(m => m.text?.toLowerCase().includes(q) || m.who?.toLowerCase().includes(q))
      .map(m => ({ type: 'Chat', icon: '💬', title: m.text.slice(0, 80) + (m.text.length > 80 ? '…' : ''), sub: m.who + ' · ' + new Date(m.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), tab: 'ideas' })),

    // Notes (personal)
    ...(notes || [])
      .filter(n => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q))
      .map(n => ({ type: 'Note', icon: '📝', title: n.title || n.body?.slice(0,50), sub: n.body ? n.body.slice(0,60) + '…' : '', tab: 'notes' })),

    // Reminders
    ...(reminders || [])
      .filter(r => r.text?.toLowerCase().includes(q) && (!r.is_private || r.created_by === viewer))
      .map(r => ({ type: 'Reminder', icon: '🔔', title: r.text, sub: (r.due_date ? fmtDate(r.due_date) : 'No date') + ' · ' + r.priority, tab: 'notes' })),

    // Gifts
    ...(gifts || [])
      .filter(g => g.from_name?.toLowerCase().includes(q) || g.gift_desc?.toLowerCase().includes(q))
      .map(g => ({ type: 'Gift', icon: '🎁', title: g.from_name, sub: [g.gift_desc, g.gift_type, g.thank_you_sent ? '✉️ Sent' : '📬 Pending'].filter(Boolean).join(' · '), tab: 'gifts' })),

    // Payments (parents only)
    ...(isParents ? (transactions || [])
      .filter(t => t.label?.toLowerCase().includes(q) || t.sub?.toLowerCase().includes(q))
      .map(t => ({ type: 'Payment', icon: t.type === 'in' ? '💰' : '💳', title: t.label, sub: fmtMoney(t.amount) + ' · ' + fmtDate(t.date), tab: 'payments' }))
    : []),
  ]

  const highlight = (text) => {
    if (!q || !text) return text
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#EEEDFE', color: '#3C3489', borderRadius: 3, padding: '0 2px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  const typeColors = {
    Note: ['#FAEEDA', '#633806'], Reminder: ['#EAF3DE', '#27500A'],
    Task: ['#FAEEDA', '#633806'], Date: ['#EEEDFE', '#3C3489'],
    Media: ['#FAECE7', '#712B13'], Chat: ['#E1F5EE', '#085041'],
    Payment: ['#FCEBEB', '#791F1F'], Gift: ['#E6F1FB', '#0C447C'],
    Vendor: ['#E6F1FB', '#0C447C'], Guest: ['#EAF3DE', '#27500A'],
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        padding: '60px 1rem 1rem',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'white', borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        maxHeight: 'calc(100vh - 80px)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Search input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: '0.5px solid var(--border)',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search vendors, guests, tasks, chat, media…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 16, background: 'transparent',
              color: 'var(--text-primary)',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, padding: 0 }}>×</button>
          )}
          <button onClick={onClose} style={{ background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '0.5px solid var(--border)' }}>
            Cancel
          </button>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {q.length < 2 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Type at least 2 characters to search across everything
            </div>
          )}

          {q.length >= 2 && results.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              No results for "<strong>{query}</strong>"
            </div>
          )}

          {results.length > 0 && (
            <>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
              {results.map((r, i) => {
                const [bg, tc] = typeColors[r.type] || ['#f5f5f3', '#666']
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate(r.tab)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '12px 16px',
                      border: 'none', background: 'none', cursor: 'pointer',
                      textAlign: 'left', borderBottom: '0.5px solid var(--border)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ fontSize: 20, flexShrink: 0, width: 32, textAlign: 'center' }}>{r.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {highlight(r.title)}
                      </div>
                      {r.sub && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {highlight(r.sub)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: bg, color: tc, fontWeight: 500 }}>{r.type}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>→</span>
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── OVERVIEW ──────────────────────────────────────────
function OverviewTab({ isParents, balance, totalPaidOut, transactions, confirmedGuests, guests, doneTasks, tasks, daysLeft, showTab }) {
  const guestPct = guests.length ? Math.round(confirmedGuests / guests.length * 100) : 0
  const taskPct = tasks.length ? Math.round(doneTasks / tasks.length * 100) : 0
  const pendingTasks = tasks.filter(t => !t.done).length

  return (
    <div style={S.section}>

      {/* Hero countdown */}
      <div style={{ background: 'linear-gradient(145deg, #6B2335 0%, #9B3A4A 30%, #C4697A 70%, #D9949E 100%)', borderRadius: 24, padding: '1.75rem 1.5rem', marginBottom: '1rem', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(107,35,53,0.3), 0 2px 8px rgba(196,105,122,0.2)' }}>
        <div style={{ position: 'absolute', top: -15, right: -15, fontSize: 90, opacity: 0.1 }}>💍</div>
        <div style={{ position: 'absolute', bottom: -10, left: -10, fontSize: 70, opacity: 0.08 }}>🌸</div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)', pointerEvents: 'none', borderRadius: 24 }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 6 }}>The Big Day</div>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 4, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{daysLeft}</div>
        <div style={{ fontSize: 15, opacity: 0.9, fontWeight: 500 }}>days until the wedding</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Saturday, October 16, 2027 · Old Oaks Country Club</div>
      </div>

      {/* Stats row */}
      <div style={S.grid}>
        {isParents && (
          <div style={{ ...S.metricCard, borderLeft: '4px solid var(--gold)', background: 'linear-gradient(135deg, #FFFCF5, white)' }}>
            <div style={S.metricLabel}>Budget</div>
            <div style={{ ...S.metricValue, color: '#5C3D00', fontSize: 18 }}>{fmtMoney(balance)}</div>
            <div style={S.metricSub}>{fmtMoney(totalPaidOut)} paid out</div>
          </div>
        )}
        <div style={{ ...S.metricCard, borderLeft: '4px solid var(--sage)', background: 'linear-gradient(135deg, #F5FCF6, white)' }}>
          <div style={S.metricLabel}>Guests</div>
          <div style={S.metricValue}>{confirmedGuests}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>/{guests.length}</span></div>
          <div style={S.pbWrap}><div style={S.pb(guestPct, 'var(--sage)')} /></div>
          <div style={S.metricSub}>{guestPct}% confirmed</div>
        </div>
        <div style={{ ...S.metricCard, borderLeft: '4px solid var(--rose)', background: 'linear-gradient(135deg, #FEF0F2, white)' }}>
          <div style={S.metricLabel}>Tasks</div>
          <div style={S.metricValue}>{doneTasks}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>/{tasks.length}</span></div>
          <div style={S.pbWrap}><div style={S.pb(taskPct, 'var(--rose)')} /></div>
          <div style={S.metricSub}>{taskPct}% complete</div>
        </div>
      </div>

      {/* Old Oaks reminder — parents only */}
      {isParents && (
        <div style={{ background: 'var(--gold-light)', border: '1px solid #D4B483', borderRadius: 'var(--r-lg)', padding: '12px 16px', fontSize: 13, color: '#5C3D00', marginBottom: '1rem', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>📋 Old Oaks reminders</div>
          Final guest count 5 days before · Outside vendors need insurance 7 days prior · Cancellation within 120 days = 50% owed
        </div>
      )}

      {/* Quick actions */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>Jump to</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { icon: '💬', label: 'Group Chat', sub: 'Share ideas with everyone', tab: 'ideas', color: '#F9EEF0', border: '#E8B4BC' },
          { icon: '✅', label: 'Task List', sub: pendingTasks > 0 ? `${pendingTasks} task${pendingTasks !== 1 ? 's' : ''} remaining` : '🎉 All done!', tab: 'checklist', color: '#EBF7F0', border: '#B8DCCA' },
          { icon: '👤', label: 'Guest List', sub: guests.length === 0 ? 'Add your first guest' : `${confirmedGuests} confirmed`, tab: 'guests', color: '#EBF0FA', border: '#B8C8E8' },
          { icon: '🏪', label: 'Vendors', sub: 'Contact sheet & status', tab: 'vendors', color: '#F7F0E6', border: '#D4B483' },
        ].map(({ icon, label, sub, tab, color, border }) => (
          <button key={tab} onClick={() => showTab(tab)}
            style={{ background: color, border: `1px solid ${border}`, borderRadius: 'var(--r-xl)', padding: '16px', textAlign: 'left', cursor: 'pointer', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s', boxShadow: 'var(--shadow-xs)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
          >
            <div style={{ fontSize: 28, marginBottom: 8, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3, letterSpacing: '-0.01em' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{sub}</div>
          </button>
        ))}
      </div>

      {/* Tip */}
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', padding: '0.75rem 0 0.5rem', lineHeight: 1.6 }}>
        Tap <strong style={{ color: 'var(--rose)' }}>➕</strong> anywhere to quickly add a message, task, or reminder ·
        All changes sync live to everyone's phones ✨
      </div>
    </div>
  )
}

// ── ACTIVITY ──────────────────────────────────────────
function ActivityTab({ activityLog, markAllRead }) {
  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={S.sectionTitle}>Activity feed</div>
        <button style={{ ...S.addBtn, marginBottom: 0 }} onClick={markAllRead}>Mark all read</button>
      </div>
      {!activityLog.length
        ? (
          <div style={{ ...S.empty, padding: '2.5rem 1.5rem' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No activity yet</div>
            <div style={{ fontSize: 13 }}>When anyone adds a vendor, guest, task, or message, it will show up here in real time.</div>
          </div>
        )
        : activityLog.map((a, i) => {
          const [bg, tc] = AVATARS[a.who] || ['#F5F3EF', '#78716C']
          const ini = a.who?.slice(0, 2).toUpperCase() || '?'
          return (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < activityLog.length - 1 ? '1px solid rgba(196,105,122,0.06)' : 'none', alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${bg}, ${bg}CC)`, color: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, boxShadow: `0 2px 6px ${tc}22` }}>{ini}</div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.who}</span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{a.descr}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{fmtTime(a.ts)}</div>
              </div>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg, #FEF0F2, #FDF5F0)', border: '1px solid rgba(196,105,122,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{a.icon}</div>
            </div>
          )
        })
      }
    </div>
  )
}

// ── IDEAS & CHAT ──────────────────────────────────────
const CHAT_CATS = ['Bands & Music','Venue','Florals','Photography','Catering','Attire','Honeymoon','General']

// Consecutive messages from the same sender get grouped — only the last shows the avatar
function groupMessages(msgs) {
  const groups = []
  let lastDate = null
  let lastWho = null

  msgs.forEach((m, i) => {
    const d = new Date(m.ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (d !== lastDate) {
      groups.push({ type: 'divider', label: d, id: 'div-' + i })
      lastDate = d
      lastWho = null
    }
    const next = msgs[i + 1]
    const isLast = !next || next.who !== m.who ||
      new Date(next.ts).toLocaleDateString() !== new Date(m.ts).toLocaleDateString()
    groups.push({ ...m, type: 'msg', showAvatar: isLast, showName: lastWho !== m.who })
    lastWho = m.who
  })
  return groups
}

function IdeasTab({ viewer, chatMessages, logActivity, setSyncStatus }) {
  const [text, setText] = useState('')
  const [cat, setCat] = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [activeView, setActiveView] = useState('chat')
  const [savedItems, setSavedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pn-saved-msgs') || '[]') } catch { return [] }
  })
  const [saveSheet, setSaveSheet] = useState(null)
  const [saveCat, setSaveCat] = useState(CHAT_CATS[0])
  const [saveNote, setSaveNote] = useState('')
  const [savedCatFilter, setSavedCatFilter] = useState('All')
  const [sending, setSending] = useState(false)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const isFirstRender = useRef(true)
  const longPressTimer = useRef(null)

  // Jump to bottom on open
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [])

  // Smooth scroll when new messages arrive
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const el = bodyRef.current; if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140)
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chatMessages])

  function persistSaved(items) {
    setSavedItems(items)
    localStorage.setItem('pn-saved-msgs', JSON.stringify(items))
  }

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    await supabase.from('chat_messages').insert([{ id: uid(), who: viewer, text: trimmed, cat, ts: Date.now() }])
    await logActivity('💬', viewer, 'sent a message' + (cat ? ' in ' + cat : ''), 'ideas')
    setSyncStatus('saved')
    setSending(false)
    setTimeout(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }), 80)
  }

  function openSaveSheet(msg) { setSaveSheet(msg); setSaveCat(msg.cat || CHAT_CATS[0]); setSaveNote('') }
  function confirmSave() {
    if (!saveSheet || savedItems.find(s => s.msgId === saveSheet.id)) { setSaveSheet(null); return }
    persistSaved([{ id: uid(), msgId: saveSheet.id, who: saveSheet.who, text: saveSheet.text, originalCat: saveSheet.cat, savedCat: saveCat, note: saveNote.trim(), savedBy: viewer, savedAt: Date.now(), ts: saveSheet.ts }, ...savedItems])
    setSaveSheet(null)
  }
  function unsave(msgId) { persistSaved(savedItems.filter(s => s.msgId !== msgId)) }
  function isSaved(msgId) { return savedItems.some(s => s.msgId === msgId) }

  function startLongPress(msg) { longPressTimer.current = setTimeout(() => openSaveSheet(msg), 480) }
  function cancelLongPress() { clearTimeout(longPressTimer.current) }

  const person = PEOPLE[viewer] || {}
  const [myBg, myTc] = person.avatar || ['#C4697A', 'white']
  const grouped = groupMessages(chatMessages)
  const savedCats = ['All', ...Array.from(new Set(savedItems.map(s => s.savedCat)))]
  const filteredSaved = savedCatFilter === 'All' ? savedItems : savedItems.filter(s => s.savedCat === savedCatFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: 440, position: 'relative', background: 'white' }}>

      {/* ── HEADER BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'white' }}>
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 3, gap: 1 }}>
          {[['chat','Chat'],['saved','🔖 Saved']].map(([v, label]) => (
            <button key={v} onClick={() => setActiveView(v)} style={{ padding: '5px 14px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeView === v ? 'white' : 'transparent', color: activeView === v ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: activeView === v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
              {label}
              {v === 'saved' && savedItems.length > 0 && <span style={{ marginLeft: 4, background: 'var(--rose)', color: 'white', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{savedItems.length}</span>}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {activeView === 'chat' ? 'Hold a message to save it 🔖' : 'Your saved ideas'}
        </div>
      </div>

      {/* ── CHAT VIEW ── */}
      {activeView === 'chat' && <>
        {/* Messages area */}
        <div ref={bodyRef} onScroll={() => { const el = bodyRef.current; if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80) }} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 4px', WebkitOverflowScrolling: 'touch' }}>
          {!chatMessages.length
            ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Start the conversation</div>
                <div style={{ fontSize: 13 }}>Share ideas, thoughts, and inspiration with the whole family.</div>
              </div>
            )
            : grouped.map((item) => {
              if (item.type === 'divider') return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  {item.label}
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )

              const mine = item.who === viewer
              const [avBg, avTc] = AVATARS[item.who] || ['#F5F3EF', '#78716C']
              const ini = item.who?.slice(0, 2).toUpperCase() || '?'
              const timeStr = new Date(item.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              const saved = isSaved(item.id)

              return (
                <div
                  key={item.id}
                  style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, marginBottom: item.showAvatar ? 12 : 3, animation: 'msgIn 0.2s ease' }}
                  onMouseDown={() => startLongPress(item)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(item)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  {/* Avatar — only on last in group */}
                  <div style={{ width: 28, flexShrink: 0 }}>
                    {!mine && item.showAvatar && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: avBg, color: avTc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{ini}</div>
                    )}
                  </div>

                  {/* Bubble + meta */}
                  <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {/* Sender name — first in group, others only */}
                    {!mine && item.showName && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, marginLeft: 12 }}>{item.who}</div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      padding: '9px 14px',
                      borderRadius: mine
                        ? `18px 18px ${item.showAvatar ? '4px' : '18px'} 18px`
                        : `18px 18px 18px ${item.showAvatar ? '4px' : '18px'}`,
                      background: mine ? 'linear-gradient(135deg, #D4788A, #C4697A)' : 'var(--bg-secondary)',
                      color: mine ? 'white' : 'var(--text-primary)',
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                      boxShadow: mine ? '0 2px 12px rgba(196,105,122,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
                      position: 'relative',
                    }}>
                      {/* Category tag inside bubble */}
                      {item.cat && (
                        <div style={{ fontSize: 10, fontWeight: 600, opacity: mine ? 0.75 : 0.6, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{item.cat}</div>
                      )}
                      {item.text}
                    </div>

                    {/* Time + bookmark row — only on last in group */}
                    {item.showAvatar && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '0 2px' }}>
                        <button
                          onClick={e => { e.stopPropagation(); saved ? unsave(item.id) : openSaveSheet(item) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: saved ? 1 : 0.25, padding: 0, lineHeight: 1, transition: 'opacity 0.15s' }}
                          title={saved ? 'Saved' : 'Save idea'}
                        >🔖</button>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {mine ? timeStr : timeStr}
                        </span>
                        {/* iMessage-style delivered checkmarks for your own messages */}
                        {mine && (
                          <span style={{ fontSize: 10, color: 'var(--rose)', fontWeight: 600 }}>✓✓</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          }
          <div id="chat-anchor" />
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}
            style={{ position: 'absolute', bottom: 84, right: 16, width: 32, height: 32, borderRadius: '50%', background: 'var(--rose)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 10px rgba(196,105,122,0.4)', zIndex: 10 }}>↓</button>
        )}

        {/* ── INPUT BAR — iMessage style ── */}
        <div style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--border)', padding: '8px 10px', paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
          {/* Tag row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 7, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none', flexWrap: 'nowrap', paddingBottom: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>Tag:</span>
            {['', ...CHAT_CATS].map(c => (
              <button key={c} onClick={() => setCat(c)} style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid ' + (cat === c ? 'var(--rose)' : 'var(--border-strong)'), background: cat === c ? 'var(--rose)' : 'white', color: cat === c ? 'white' : 'var(--text-secondary)', fontSize: 11, fontWeight: cat === c ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.12s' }}>{c || 'None'}</button>
            ))}
          </div>

          {/* Input row — exactly like iMessage */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {/* Viewer avatar */}
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: myBg, color: myTc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginBottom: 2, border: '1.5px solid white', boxShadow: '0 0 0 1.5px var(--rose)' }}>
              {viewer.slice(0, 2).toUpperCase()}
            </div>

            {/* Text input with expand */}
            <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 22, border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'flex-end', padding: '1px 4px 1px 14px', transition: 'border-color 0.15s', gap: 4 }}>
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                onFocus={e => e.target.closest('div').style.borderColor = 'var(--rose)'}
                onBlur={e => e.target.closest('div').style.borderColor = 'var(--border-strong)'}
                placeholder="Message…"
                rows={1}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, lineHeight: 1.45, resize: 'none', padding: '7px 0', color: 'var(--text-primary)', maxHeight: 100, overflow: 'auto', scrollbarWidth: 'none', fontFamily: 'inherit' }}
              />
            </div>

            {/* Send button — rose filled when has text, grey ring when empty */}
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: text.trim() ? 'linear-gradient(135deg, #D4788A, #C4697A)' : 'var(--bg-secondary)',
                border: '1.5px solid ' + (text.trim() ? 'var(--rose)' : 'var(--border-strong)'),
                cursor: text.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                boxShadow: text.trim() ? '0 3px 14px rgba(196,105,122,0.4)' : 'none',
              }}
            >
              {/* Arrow up icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke={text.trim() ? 'white' : 'var(--text-tertiary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </>}

      {/* ── SAVED VIEW ── */}
      {activeView === 'saved' && (
        <SavedBoard
          savedItems={savedItems}
          savedCatFilter={savedCatFilter}
          setSavedCatFilter={setSavedCatFilter}
          savedCats={savedCats}
          onUnsave={unsave}
          onUpdateNote={(id, note) => {
            const updated = savedItems.map(s => s.id === id ? { ...s, note } : s)
            persistSaved(updated)
          }}
          onUpdateCat={(id, cat) => {
            const updated = savedItems.map(s => s.id === id ? { ...s, savedCat: cat } : s)
            persistSaved(updated)
          }}
          viewer={viewer}
        />
      )}

      {/* ── SAVE SHEET ── */}
      {saveSheet && (
        <div onClick={e => e.target === e.currentTarget && setSaveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', background: 'white', borderRadius: '24px 24px 0 0', padding: '1.25rem 1.25rem 2rem', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}>
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 2, margin: '0 auto 1.25rem' }} />

            {/* Quoted message */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 12, marginBottom: '1.25rem', borderLeft: '3px solid var(--rose)' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💬</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rose-dark)', marginBottom: 3 }}>{saveSheet.who}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{saveSheet.text.slice(0, 120)}{saveSheet.text.length > 120 ? '…' : ''}"
                </div>
              </div>
            </div>

            {/* Category */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>Save to category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
              {CHAT_CATS.map(c => {
                const catIcons = { 'Bands & Music':'🎵', 'Venue':'🏛', 'Florals':'🌸', 'Photography':'📷', 'Catering':'🍽', 'Attire':'👗', 'Honeymoon':'✈️', 'General':'📌' }
                const active = saveCat === c
                return (
                  <button key={c} onClick={() => setSaveCat(c)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 20, border: '1px solid ' + (active ? 'var(--rose)' : 'var(--border-strong)'), background: active ? 'var(--rose-light)' : 'white', color: active ? 'var(--rose-dark)' : 'var(--text-secondary)', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? '0 2px 8px rgba(196,105,122,0.2)' : 'none' }}>
                    <span>{catIcons[c] || '📌'}</span>{c}
                  </button>
                )
              })}
            </div>

            {/* Note */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>Add a note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <textarea
              value={saveNote}
              onChange={e => setSaveNote(e.target.value)}
              placeholder="e.g. Ask Stephanie about this · Follow up before booking · Share with florist…"
              rows={2}
              style={{ width: '100%', marginBottom: '1.25rem', resize: 'none', lineHeight: 1.5 }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmSave} style={{ flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: 'var(--rose)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 12px rgba(196,105,122,0.35)', letterSpacing: '-0.01em' }}>
                🔖 Save idea
              </button>
              <button onClick={() => setSaveSheet(null)} style={{ padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes msgIn { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

// ── SAVED BOARD ───────────────────────────────────────
const CAT_META = {
  'Bands & Music': { icon: '🎵', color: ['#FEF3E2','#7C4A03'] },
  'Venue':         { icon: '🏛',  color: ['#EBF0FA','#1E3A6E'] },
  'Florals':       { icon: '🌸',  color: ['#F9EEF0','#8B3A47'] },
  'Photography':   { icon: '📷',  color: ['#EBF0FA','#1E3A6E'] },
  'Catering':      { icon: '🍽',  color: ['#FAECE7','#712B13'] },
  'Attire':        { icon: '👗',  color: ['#EBF7F0','#2D6A4F'] },
  'Honeymoon':     { icon: '✈️',  color: ['#FBEAEA','#7C1F1F'] },
  'General':       { icon: '📌',  color: ['#F5F3EF','#6B5E52'] },
}

function SavedBoard({ savedItems, savedCatFilter, setSavedCatFilter, savedCats, onUnsave, onUpdateNote, onUpdateCat, viewer }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date') // 'date' | 'cat' | 'who'
  const [editingId, setEditingId] = useState(null)
  const [editNote, setEditNote] = useState('')
  const [editCat, setEditCat] = useState('')

  const filtered = savedItems
    .filter(s => savedCatFilter === 'All' || s.savedCat === savedCatFilter)
    .filter(s => !search || s.text.toLowerCase().includes(search.toLowerCase()) || s.note?.toLowerCase().includes(search.toLowerCase()) || s.who?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'cat') return (a.savedCat || '').localeCompare(b.savedCat || '')
      if (sortBy === 'who') return (a.who || '').localeCompare(b.who || '')
      return b.savedAt - a.savedAt
    })

  function startEdit(s) {
    setEditingId(s.id)
    setEditNote(s.note || '')
    setEditCat(s.savedCat)
  }

  function saveEdit(id) {
    onUpdateNote(id, editNote)
    onUpdateCat(id, editCat)
    setEditingId(null)
  }

  // Group by category for the board view
  const grouped = sortBy === 'cat'
    ? CHAT_CATS.filter(c => filtered.some(s => s.savedCat === c)).map(c => ({ cat: c, items: filtered.filter(s => s.savedCat === c) }))
    : [{ cat: null, items: filtered }]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-tertiary)' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search saved ideas…"
            style={{ paddingLeft: 30, fontSize: 13 }}
          />
        </div>
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 12, padding: '8px 10px', width: 'auto', borderRadius: 10, color: 'var(--text-secondary)' }}>
          <option value="date">Newest first</option>
          <option value="cat">By category</option>
          <option value="who">By person</option>
        </select>
      </div>

      {/* Category filter pills */}
      {savedItems.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
          {savedCats.map(c => {
            const meta = CAT_META[c]
            const active = savedCatFilter === c
            const count = savedItems.filter(s => s.savedCat === c).length
            return (
              <button key={c} onClick={() => setSavedCatFilter(c)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (active ? 'var(--rose)' : 'var(--border-strong)'), background: active ? 'var(--rose)' : 'white', color: active ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? '0 2px 6px rgba(196,105,122,0.2)' : 'none' }}>
                {meta?.icon && <span>{meta.icon}</span>}
                {c === 'All' ? 'All' : c}
                {c !== 'All' && <span style={{ opacity: 0.7, fontSize: 10 }}>·{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Stats bar */}
      {savedItems.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
          {filtered.length} saved idea{filtered.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}
          {savedCatFilter !== 'All' ? ` in ${savedCatFilter}` : ''}
        </div>
      )}

      {/* Empty state */}
      {!savedItems.length && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔖</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>No saved ideas yet</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Long-press any message in the chat to save it here. You can tag it by category and add your own note.</div>
        </div>
      )}

      {filtered.length === 0 && savedItems.length > 0 && (
        <div style={S.empty}>No saved ideas match your filter.</div>
      )}

      {/* Cards */}
      {grouped.map(({ cat, items }) => (
        <div key={cat || 'all'}>
          {/* Category section header (only in grouped view) */}
          {cat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }}>
              <span style={{ fontSize: 18 }}>{CAT_META[cat]?.icon}</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{cat}</div>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{items.length}</span>
            </div>
          )}

          {items.map(s => {
            const [avBg, avTc] = AVATARS[s.who] || ['#F5F3EF','#78716C']
            const meta = CAT_META[s.savedCat] || { icon: '📌', color: ['#F5F3EF','#6B5E52'] }
            const isEditing = editingId === s.id

            return (
              <div key={s.id} style={{ background: 'white', borderRadius: 'var(--r-lg)', marginBottom: 10, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', transition: 'box-shadow 0.15s' }}>

                {/* Category colour bar */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${meta.color[1]}44, ${meta.color[1]}22)`, borderBottom: `1px solid ${meta.color[1]}22` }} />

                <div style={{ padding: '12px 14px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: avBg, color: avTc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{s.who?.slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.who}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{new Date(s.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · saved {new Date(s.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: meta.color[0], color: meta.color[1], fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {meta.icon} {s.savedCat}
                      </span>
                      <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: '2px 4px', borderRadius: 6, lineHeight: 1 }} title="Edit">✏️</button>
                      <button onClick={() => onUnsave(s.msgId)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-tertiary)', padding: '2px 4px', lineHeight: 1, borderRadius: 6 }} title="Remove">×</button>
                    </div>
                  </div>

                  {/* Message text — quoted style */}
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid var(--rose-mid)', marginBottom: s.note || isEditing ? 10 : 0 }}>
                    {s.text}
                  </div>

                  {/* Note display / edit */}
                  {isEditing ? (
                    <div style={{ marginTop: 10, padding: '10px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Category</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                        {CHAT_CATS.map(c => (
                          <button key={c} onClick={() => setEditCat(c)} style={{ padding: '4px 10px', borderRadius: 14, border: '1px solid ' + (editCat === c ? 'var(--rose)' : 'var(--border-strong)'), background: editCat === c ? 'var(--rose-light)' : 'white', color: editCat === c ? 'var(--rose-dark)' : 'var(--text-secondary)', fontSize: 11, fontWeight: editCat === c ? 700 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                            {CAT_META[c]?.icon} {c}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Your note</div>
                      <textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Add context, action items, follow-ups…" rows={2} style={{ width: '100%', resize: 'none', marginBottom: 8 }} autoFocus />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(s.id)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--rose)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : s.note ? (
                    <div style={{ display: 'flex', gap: 6, padding: '8px 10px', background: 'var(--gold-light)', borderRadius: 8, marginTop: 8, border: '1px solid #D4B483' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>📌</span>
                      <div style={{ fontSize: 12, color: '#5C3D00', lineHeight: 1.5 }}>{s.note}</div>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(s)} style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      + Add a note
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}


// ── NOTES & REMINDERS ─────────────────────────────────
function NotesTab({ viewer, notes, setNotes, reminders, setReminders, logActivity, setSyncStatus }) {
  const [activeView, setActiveView] = useState('notes') // 'notes' | 'reminders'
  // Notes state
  const [editingNote, setEditingNote] = useState(null) // null=list, 'new'=new, id=editing
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteColor, setNoteColor] = useState('#FAEEDA')
  // Reminders state
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [rf, setRf] = useState({ text: '', due_date: '', priority: 'normal', for_who: 'Everyone', is_private: false })

  const NOTE_COLORS = ['#FAEEDA','#EAF3DE','#EEEDFE','#E1F5EE','#FCEBEB','#E6F1FB','#F1EFE8']
  const today = new Date(); today.setHours(0,0,0,0)

  // ── NOTES ──────────────────────────────────────────
  async function saveNote() {
    if (!noteBody.trim() && !noteTitle.trim()) return
    setSyncStatus('saving')
    if (editingNote === 'new') {
      const item = { id: uid(), owner: viewer, title: noteTitle.trim(), body: noteBody.trim(), color: noteColor, updated_at: new Date().toISOString() }
      const { data } = await supabase.from('notes').insert([item]).select()
      if (data) setNotes(prev => [data[0], ...prev])
      await logActivity('📝', viewer, 'added a note' + (noteTitle ? ': ' + noteTitle : ''), 'notes')
    } else {
      await supabase.from('notes').update({ title: noteTitle.trim(), body: noteBody.trim(), color: noteColor, updated_at: new Date().toISOString() }).eq('id', editingNote)
      setNotes(prev => prev.map(n => n.id === editingNote ? { ...n, title: noteTitle.trim(), body: noteBody.trim(), color: noteColor } : n))
    }
    setEditingNote(null); setNoteTitle(''); setNoteBody(''); setNoteColor('#FAEEDA')
    setSyncStatus('saved')
  }

  async function deleteNote(id) {
    await supabase.from('notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function openNote(n) {
    setEditingNote(n.id); setNoteTitle(n.title || ''); setNoteBody(n.body || ''); setNoteColor(n.color || '#FAEEDA')
  }

  // ── REMINDERS ──────────────────────────────────────
  async function saveReminder() {
    if (!rf.text.trim()) return
    setSyncStatus('saving')
    const item = {
      id: uid(),
      text: rf.text.trim(),
      due_date: rf.due_date || null,
      priority: rf.priority,
      for_who: rf.is_private ? viewer : rf.for_who,
      created_by: viewer,
      is_private: rf.is_private,
      done: false,
    }
    const { data } = await supabase.from('reminders').insert([item]).select()
    if (data) setReminders(prev => [...prev, data[0]].sort((a,b) => (a.due_date||'9999') > (b.due_date||'9999') ? 1 : -1))
    // Only log to activity if it's shared — private reminders stay private
    if (!rf.is_private) await logActivity('🔔', viewer, 'added a reminder: ' + rf.text, 'notes')
    setRf({ text: '', due_date: '', priority: 'normal', for_who: 'Everyone', is_private: false })
    setShowReminderForm(false)
    setSyncStatus('saved')
  }

  async function toggleReminder(id, done) {
    await supabase.from('reminders').update({ done: !done }).eq('id', id)
    setReminders(prev => prev.map(r => r.id === id ? { ...r, done: !done } : r))
  }

  async function deleteReminder(id) {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(r => r.id !== id))
  }

  function reminderStatus(r) {
    if (r.done) return { label: 'Done', color: '#1D9E75', bg: '#EAF3DE' }
    if (!r.due_date) return { label: 'No date', color: '#6b6b68', bg: '#f5f5f3' }
    const d = new Date(r.due_date + 'T00:00:00')
    const diff = Math.ceil((d - today) / 86400000)
    if (diff < 0) return { label: 'Overdue', color: '#A32D2D', bg: '#FCEBEB' }
    if (diff === 0) return { label: 'Today!', color: '#A32D2D', bg: '#FCEBEB' }
    if (diff <= 3) return { label: `In ${diff}d`, color: '#633806', bg: '#FAEEDA' }
    return { label: fmtDate(r.due_date), color: '#0C447C', bg: '#E6F1FB' }
  }

  const priorityColors = { high: ['#FCEBEB','#791F1F'], normal: ['#E6F1FB','#0C447C'], low: ['#f5f5f3','#6b6b68'] }
  const dueReminders = reminders.filter(r => !r.done && r.due_date && Math.ceil((new Date(r.due_date+'T00:00:00') - today)/86400000) <= 3)

  // ── NOTE EDITOR VIEW ────────────────────────────────
  if (editingNote !== null) {
    return (
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
          <button onClick={() => { setEditingNote(null); setNoteTitle(''); setNoteBody('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, padding: 0 }}>← Back</button>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{editingNote === 'new' ? 'New note' : 'Editing note'}</div>
          <button onClick={saveNote} style={{ ...S.saveBtn, marginBottom: 0 }}>Save</button>
        </div>
        {/* Color picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          {NOTE_COLORS.map(c => (
            <div key={c} onClick={() => setNoteColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: noteColor === c ? '2px solid #534AB7' : '1.5px solid var(--border)', cursor: 'pointer', transition: 'border 0.1s' }} />
          ))}
        </div>
        <input
          value={noteTitle}
          onChange={e => setNoteTitle(e.target.value)}
          placeholder="Title (optional)"
          style={{ width: '100%', fontSize: 16, fontWeight: 500, padding: '8px 0', border: 'none', borderBottom: '0.5px solid var(--border)', outline: 'none', background: 'transparent', marginBottom: '0.75rem', color: 'var(--text-primary)' }}
        />
        <textarea
          value={noteBody}
          onChange={e => setNoteBody(e.target.value)}
          placeholder="Write your note here…"
          autoFocus
          style={{ width: '100%', minHeight: 240, fontSize: 14, lineHeight: 1.7, padding: '8px 0', border: 'none', outline: 'none', background: 'transparent', resize: 'none', color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
      </div>
    )
  }

  return (
    <div style={S.section}>
      {/* Due-soon alert banner */}
      {dueReminders.length > 0 && (
        <div style={{ background: '#FAEEDA', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: '#633806', marginBottom: '1rem', lineHeight: 1.6 }}>
          🔔 <strong>{dueReminders.length} reminder{dueReminders.length > 1 ? 's' : ''} due soon:</strong> {dueReminders.map(r => r.text).join(' · ')}
        </div>
      )}

      {/* Toggle tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 3, gap: 2, marginBottom: '1.25rem', width: 'fit-content' }}>
        {[['notes','📝 My Notes'],['reminders','🔔 Reminders']].map(([v, label]) => (
          <button key={v} onClick={() => setActiveView(v)} style={{ padding: '6px 16px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: activeView === v ? 'white' : 'transparent', color: activeView === v ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: activeView === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
            {label}
            {v === 'reminders' && reminders.filter(r=>!r.done).length > 0 && <span style={{ marginLeft: 5, background: '#534AB7', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{reminders.filter(r=>!r.done).length}</span>}
          </button>
        ))}
      </div>

      {/* ── MY NOTES ── */}
      {activeView === 'notes' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Your personal notes — only visible to you ({viewer}).
          </div>
          <button style={S.addBtn} onClick={() => { setEditingNote('new'); setNoteTitle(''); setNoteBody(''); setNoteColor('#FAEEDA') }}>+ New note</button>
          {!notes.length
            ? <div style={S.empty}>No notes yet. Tap "+ New note" to jot something down.</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {notes.map(n => (
                  <div key={n.id} onClick={() => openNote(n)} style={{ background: n.color || '#FAEEDA', borderRadius: 12, padding: '14px', cursor: 'pointer', position: 'relative', minHeight: 100, border: '0.5px solid rgba(0,0,0,0.06)', transition: 'transform 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {n.title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1a1a18' }}>{n.title}</div>}
                    <div style={{ fontSize: 12, color: '#3a3a38', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}>{n.body}</div>
                    <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 8 }}>{n.updated_at ? new Date(n.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</div>
                    <button onClick={e => { e.stopPropagation(); deleteNote(n.id) }} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.3, padding: 2 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.3}
                    >×</button>
                  </div>
                ))}
              </div>
          }
        </>
      )}

      {/* ── REMINDERS ── */}
      {activeView === 'reminders' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Add shared reminders for the group, or private ones only you can see.
          </div>
          <button style={S.addBtn} onClick={() => setShowReminderForm(!showReminderForm)}>+ Add reminder</button>
          {showReminderForm && (
            <div style={S.formBox}>
              {/* Private / Shared toggle — prominent at the top */}
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 12, padding: 3, gap: 2, marginBottom: '1rem', width: 'fit-content' }}>
                {[false, true].map(priv => (
                  <button
                    key={String(priv)}
                    onClick={() => setRf(p => ({ ...p, is_private: priv }))}
                    style={{
                      padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                      background: rf.is_private === priv ? (priv ? '#534AB7' : 'white') : 'transparent',
                      color: rf.is_private === priv ? (priv ? 'white' : 'var(--text-primary)') : 'var(--text-secondary)',
                      boxShadow: rf.is_private === priv ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {priv ? '🔒 Private' : '👥 Shared'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: rf.is_private ? '#534AB7' : 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {rf.is_private
                  ? `Only you (${viewer}) will see this reminder.`
                  : 'This reminder will be visible to everyone in the group.'}
              </div>
              <div style={S.formGrid}>
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={S.formLabel}>Reminder</div>
                  <input value={rf.text} onChange={e=>setRf(p=>({...p,text:e.target.value}))} placeholder={rf.is_private ? "e.g. Ask Glenn about the budget" : "e.g. Call Old Oaks to confirm menu"} style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={S.formLabel}>Due date (optional)</div>
                  <input type="date" value={rf.due_date} onChange={e=>setRf(p=>({...p,due_date:e.target.value}))} style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={S.formLabel}>Priority</div>
                  <select value={rf.priority} onChange={e=>setRf(p=>({...p,priority:e.target.value}))} style={{ width: '100%' }}>
                    <option value="high">🔴 High</option>
                    <option value="normal">🔵 Normal</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>
                {/* Only show "For" when shared */}
                {!rf.is_private && (
                  <div>
                    <div style={S.formLabel}>For</div>
                    <select value={rf.for_who} onChange={e=>setRf(p=>({...p,for_who:e.target.value}))} style={{ width: '100%' }}>
                      <option value="Everyone">Everyone</option>
                      {ALL_PEOPLE.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <button style={S.saveBtn} onClick={saveReminder}>Save reminder</button>
              <button style={S.cancelBtn} onClick={() => setShowReminderForm(false)}>Cancel</button>
            </div>
          )}

          {/* Active reminders — filter private ones to owner only */}
          {reminders.filter(r => !r.done && (!r.is_private || r.created_by === viewer)).length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</div>
              {reminders.filter(r => !r.done && (!r.is_private || r.created_by === viewer)).map(r => {
                const status = reminderStatus(r)
                const [pbg, ptc] = priorityColors[r.priority] || priorityColors.normal
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div onClick={() => toggleReminder(r.id, r.done)} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #534AB7', cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{r.text}</div>
                        {r.is_private && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#EEEDFE', color: '#3C3489', fontWeight: 500, flexShrink: 0 }}>🔒 Private</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: status.bg, color: status.color, fontWeight: 500 }}>{status.label}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: pbg, color: ptc, fontWeight: 500 }}>{r.priority}</span>
                        {!r.is_private && r.for_who !== 'Everyone' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>→ {r.for_who}</span>}
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '2px 0' }}>by {r.created_by}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, opacity: 0.4, padding: 0 }}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.4}>×</button>
                  </div>
                )
              })}
            </>
          )}

          {/* Completed reminders — also filter private to owner */}
          {reminders.filter(r => r.done && (!r.is_private || r.created_by === viewer)).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</div>
              {reminders.filter(r => r.done && (!r.is_private || r.created_by === viewer)).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--border)', opacity: 0.5 }}>
                  <div onClick={() => toggleReminder(r.id, r.done)} style={{ width: 20, height: 20, borderRadius: '50%', background: '#1D9E75', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11 }}>✓</div>
                  <div style={{ flex: 1, fontSize: 13, textDecoration: 'line-through', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.text}
                    {r.is_private && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#EEEDFE', color: '#3C3489', textDecoration: 'none' }}>🔒</span>}
                  </div>
                  <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}

          {!reminders.filter(r => !r.is_private || r.created_by === viewer).length && (
            <div style={S.empty}>No reminders yet. Add one to keep everyone on track.</div>
          )}
        </>
      )}
    </div>
  )
}

// ── CONTACT CARD ──────────────────────────────────────
function ContactCard({ name, cat, contactName, phone, email, address, notes, status, isParents }) {
  const catColors = {
    'Venue': ['#E6F1FB','#0C447C'], 'Florals': ['#EAF3DE','#27500A'],
    'Photography': ['#EEEDFE','#3C3489'], 'Music': ['#FAEEDA','#633806'],
    'Catering': ['#FAECE7','#712B13'], 'Hair & Makeup': ['#FCEBEB','#791F1F'],
    'Transportation': ['#E1F5EE','#085041'],
  }
  const [cbg, ctc] = catColors[cat] || ['#f5f5f3','#6b6b68']

  return (
    <div style={{ background: 'white', borderRadius: 'var(--r-xl)', padding: '1rem 1.25rem', marginBottom: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)', transition: 'box-shadow 0.2s' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
          {contactName && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{contactName}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cat && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: cbg, color: ctc, fontWeight: 500 }}>{cat}</span>}
          {isParents && status && <span style={S.badge2(status)}>{status === 'paid' ? 'Paid in full' : status === 'deposit' ? 'Deposit paid' : status}</span>}
        </div>
      </div>

      {/* Contact details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phone && (
          <a href={`tel:${phone.replace(/\D/g,'')}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '10px 14px', background: 'white', borderRadius: 10, border: '0.5px solid var(--border)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#EEEDFE'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>📞</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 1 }}>Phone</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0C447C' }}>{phone}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tap to call</span>
          </a>
        )}

        {email && (
          <a href={`mailto:${email}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '10px 14px', background: 'white', borderRadius: 10, border: '0.5px solid var(--border)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#EEEDFE'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>✉️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 1 }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0C447C' }}>{email}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tap to email</span>
          </a>
        )}

        {address && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '10px 14px', background: 'white', borderRadius: 10, border: '0.5px solid var(--border)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#EEEDFE'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 1 }}>Address</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{address}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Maps ↗</span>
          </a>
        )}

        {notes && (
          <div style={{ padding: '8px 14px', background: 'white', borderRadius: 10, border: '0.5px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            📌 {notes}
          </div>
        )}

        {!phone && !email && !address && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>
            No contact details yet — edit this vendor to add phone, email and address.
          </div>
        )}
      </div>
    </div>
  )
}

// ── VENDORS ───────────────────────────────────────────
function VendorsTab({ isParents, vendors, setVendors, viewer, logActivity, setSyncStatus }) {
  const [viewMode, setViewMode] = useState('list') // 'list' | 'contacts'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', cat: '', status: 'pending', contact_name: '', phone: '', email: '', address: '', notes: '' })

  async function save() {
    if (!form.name) return
    setSyncStatus('saving')
    const item = { id: uid(), ...form, created_by: viewer }
    const { data } = await supabase.from('vendors').insert([item]).select()
    if (data) { setVendors(prev => [...prev, ...data]); setShowForm(false); setForm({ name: '', cat: '', status: 'pending', contact_name: '', phone: '', email: '', address: '', notes: '' }) }
    await logActivity('🏪', viewer, 'added vendor: ' + form.name, 'vendors')
    setSyncStatus('saved')
  }

  const all = [{ id: 'oo', status: 'deposit' }, ...vendors]
  return (
    <div style={S.section}>
      {isParents && (
        <div style={S.grid}>
          <MetricCard label="Total vendors" value={all.length} />
          <MetricCard label="Deposit paid" value={all.filter(v=>v.status==='deposit').length} />
          <MetricCard label="Paid in full" value={all.filter(v=>v.status==='paid').length} />
          <MetricCard label="Pending" value={all.filter(v=>v.status==='pending'||v.status==='overdue').length} />
        </div>
      )}
      {!isParents && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: 14, marginBottom: '1rem' }}>🔒 Booking status visible to family parents only.</div>}

      {/* Old Oaks Card */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.5rem', border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Old Oaks Country Club</div>
          {/* Only parents see payment status badges */}
          {isParents && <span style={S.badge2('deposit')}>Deposit paid</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          {[['Category','Venue'],['Event space','Clubhouse & Surrounding Areas'],['Contact','Iwona Sterk, GM'],['Phone','914-683-6000'],['Email','iwona.sterk@oldoaks.com']].map(([l,v]) => (
            <div key={l}><div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 500 }}>{v}</div></div>
          ))}
          {isParents && [['Deposit paid','$8,000 (non-refundable)'],['Per-guest price','$285 + 23% admin + 8.375% tax'],['Facility rental','$6,000']].map(([l,v]) => (
            <div key={l}><div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 500 }}>{v}</div></div>
          ))}
          <div style={{ gridColumn: '1/-1' }}><div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>Address</div><div style={{ fontWeight: 500 }}>3100 Purchase St., Purchase, NY 10577</div></div>
        </div>
        {[['Hors d\'oeuvres',['Spicy tuna tartare & avocado','Mini lobster rolls','Beef wellington','Mini grilled cheese & tomato soup','Chicken pot stickers','Watermelon & feta skewer','Spanakopita','Jumbo shrimp cocktail']],['Stations & Pizza',['Sushi station','Souvlaki & kebab','Street tacos','Margherita pizza','Truffle pizza','White pizza']],['Dinner',['Trio salad','Miso Chilean sea bass','Pan seared filet mignon']],['Dessert',['Mini chipwich','Fudge brownie bites','Chocolate covered strawberries','Churro bites','Donut holes']]].map(([title, items]) => (
          <div key={title} style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {items.map(item => <span key={item} style={{ fontSize: 12, padding: '3px 10px', background: 'white', border: '0.5px solid var(--border)', borderRadius: 12 }}>{item}</span>)}
            </div>
          </div>
        ))}
      </div>

      {/* View toggle — List or Contact Sheet */}
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 3, gap: 2, marginBottom: '1.25rem', width: 'fit-content' }}>
        {[['list','📋 Vendors'],['contacts','📞 Contact Sheet']].map(([v, label]) => (
          <button key={v} onClick={() => setViewMode(v)} style={{ padding: '6px 16px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: viewMode === v ? 'white' : 'transparent', color: viewMode === v ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: viewMode === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>{label}</button>
        ))}
      </div>

      {/* ── CONTACT SHEET VIEW ── */}
      {viewMode === 'contacts' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Quick-dial every vendor. Tap a phone number to call, email to open mail.
          </div>

          {/* Old Oaks — always first */}
          <ContactCard
            name="Old Oaks Country Club"
            cat="Venue"
            contactName="Iwona Sterk, GM"
            phone="914-683-6000"
            email="iwona.sterk@oldoaks.com"
            address="3100 Purchase St., Purchase, NY 10577"
            status="deposit"
            isParents={isParents}
          />

          {vendors.length === 0
            ? <div style={S.empty}>No vendors added yet. Tap "+ Add vendor" above to start building your contact list.</div>
            : vendors.map(v => (
                <ContactCard
                  key={v.id}
                  name={v.name}
                  cat={v.cat}
                  contactName={v.contact_name}
                  phone={v.phone}
                  email={v.email}
                  address={v.address}
                  notes={v.notes}
                  status={v.status}
                  isParents={isParents}
                />
              ))
          }
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (<>

      <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Add vendor</button>
      {showForm && (
        <div style={S.formBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Vendor details</div>
          <div style={S.formGrid}>
            <FormField label="Vendor name"><input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Rosewood Florist" /></FormField>
            <FormField label="Category"><input value={form.cat} onChange={e => setForm(p=>({...p,cat:e.target.value}))} placeholder="e.g. Florals" /></FormField>
            <FormField label="Contact name"><input value={form.contact_name} onChange={e => setForm(p=>({...p,contact_name:e.target.value}))} placeholder="e.g. Sarah Johnson" /></FormField>
            <FormField label="Phone"><input value={form.phone} onChange={e => setForm(p=>({...p,phone:e.target.value}))} placeholder="e.g. 914-555-1234" type="tel" /></FormField>
            <FormField label="Email"><input value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} placeholder="e.g. sarah@florist.com" type="email" /></FormField>
            <FormField label="Status">
              <select value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}>
                {['pending','deposit','paid','overdue'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Address" full><input value={form.address} onChange={e => setForm(p=>({...p,address:e.target.value}))} placeholder="e.g. 123 Main St, White Plains, NY" /></FormField>
            <FormField label="Notes" full><input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. Ask about Sunday availability" /></FormField>
          </div>
          <button style={S.saveBtn} onClick={save}>Save vendor</button>
          <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        </div>
      )}

      {vendors.length === 0 ? <div style={S.empty}>No vendors yet. Tap "+ Add vendor" to add your first one.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['Vendor','Category','Contact',...(isParents?['Status']:[])].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500, fontSize: 12, color: 'var(--text-secondary)', borderBottom: '0.5px solid var(--border)' }}>{h}</th>)}</tr></thead>
          <tbody>{vendors.map(v => (
            <tr key={v.id}>
              <td style={{ padding: 10, borderBottom: '0.5px solid var(--border)' }}>{v.name}</td>
              <td style={{ padding: 10, borderBottom: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}>{v.cat || '—'}</td>
              <td style={{ padding: 10, borderBottom: '0.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 }}>
                {v.phone ? <a href={`tel:${v.phone}`} style={{ color: '#0C447C', textDecoration: 'none' }}>{v.phone}</a> : v.notes || '—'}
              </td>
              {isParents && <td style={{ padding: 10, borderBottom: '0.5px solid var(--border)' }}><span style={S.badge2(v.status)}>{v.status === 'paid' ? 'Paid in full' : v.status === 'deposit' ? 'Deposit paid' : v.status}</span></td>}
            </tr>
          ))}</tbody>
        </table>
      )}
      </>)}
    </div>
  )
}

// ── PAYMENTS ──────────────────────────────────────────
function PaymentsTab({ transactions, setTransactions, viewer, logActivity, setSyncStatus }) {
  const [showPayForm, setShowPayForm] = useState(false)
  const [showContribForm, setShowContribForm] = useState(false)
  const [pf, setPf] = useState({ vendor: '', amount: '', date: '', who: 'Cochin', method: 'Check', notes: '' })
  const [cf, setCf] = useState({ who: 'Cochin', amount: '', date: '', notes: '' })

  const contrib = transactions.filter(t=>t.type==='in').reduce((s,t)=>s+Number(t.amount),0)
  const paidOut = transactions.filter(t=>t.type==='out').reduce((s,t)=>s+Number(t.amount),0)

  async function savePayment() {
    if (!pf.vendor || !pf.amount) return
    setSyncStatus('saving')
    const wl = { Cochin: 'Cochin family', Bleustein: 'Bleustein family' }[pf.who]
    const item = { id: uid(), type: 'out', label: 'Payment — ' + pf.vendor, sub: wl + ' · ' + pf.method + (pf.notes ? ' · ' + pf.notes : ''), amount: Number(pf.amount), date: pf.date || new Date().toISOString().split('T')[0], family: pf.who }
    const { data } = await supabase.from('transactions').insert([item]).select()
    if (data) { setTransactions(prev => [...prev, ...data]); setShowPayForm(false); setPf({ vendor:'',amount:'',date:'',who:'Cochin',method:'Check',notes:'' }) }
    await logActivity('💳', viewer, `logged a payment of ${fmtMoney(pf.amount)} to ${pf.vendor}`, 'payments')
    setSyncStatus('saved')
  }

  async function saveContrib() {
    if (!cf.amount) return
    setSyncStatus('saving')
    const wl = cf.who === 'Cochin' ? 'Cochin family' : 'Bleustein family'
    const item = { id: uid(), type: 'in', label: 'Contribution — ' + wl, sub: (cf.notes || 'Additional funding') + ' · Wire', amount: Number(cf.amount), date: cf.date || new Date().toISOString().split('T')[0], family: cf.who }
    const { data } = await supabase.from('transactions').insert([item]).select()
    if (data) { setTransactions(prev => [...prev, ...data]); setShowContribForm(false); setCf({ who:'Cochin',amount:'',date:'',notes:'' }) }
    await logActivity('💰', wl, `added a contribution of ${fmtMoney(cf.amount)}`, 'payments')
    setSyncStatus('saved')
  }

  const cochinC = transactions.filter(t=>t.type==='in'&&t.family==='Cochin').reduce((s,t)=>s+Number(t.amount),0)
  const cochinP = transactions.filter(t=>t.type==='out'&&t.family==='Cochin').reduce((s,t)=>s+Number(t.amount),0)
  const bleusteinC = transactions.filter(t=>t.type==='in'&&t.family==='Bleustein').reduce((s,t)=>s+Number(t.amount),0)
  const bleusteinP = transactions.filter(t=>t.type==='out'&&t.family==='Bleustein').reduce((s,t)=>s+Number(t.amount),0)

  return (
    <div style={S.section}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { title: 'Cochin Family', members: 'Glenn & Stephanie', side: "Bride's family", bg: '#EEEDFE', color: '#3C3489', c: cochinC, p: cochinP },
          { title: 'Bleustein Family', members: 'David & Bonni', side: "Groom's family", bg: '#E1F5EE', color: '#085041', c: bleusteinC, p: bleusteinP },
        ].map(f => (
          <div key={f.title} style={{ borderRadius: 'var(--radius-lg)', padding: '1.25rem', border: '0.5px solid var(--border)', background: f.bg }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: f.color, marginBottom: 2 }}>{f.title}</div>
            <div style={{ fontSize: 11, color: f.color, opacity: 0.7, marginBottom: 10 }}>{f.members} · {f.side}</div>
            {[['Contributed', fmtMoney(f.c)], ['Paid out', fmtMoney(f.p)]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, fontWeight: 500 }}>
              <span>Net balance</span><span>{fmtMoney(f.c - f.p)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        {[['Total contributed', fmtMoney(contrib), null],['Total paid out', fmtMoney(paidOut), '#A32D2D'],['Current balance', fmtMoney(contrib - paidOut), '#1D9E75']].map(([l, v, c]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: c || 'var(--text-primary)' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button style={S.addBtn} onClick={() => setShowPayForm(!showPayForm)}>+ Log payment</button>
        <button style={S.addBtn} onClick={() => setShowContribForm(!showContribForm)}>+ Add contribution</button>
      </div>
      {showPayForm && (
        <div style={S.formBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Log a payment</div>
          <div style={S.formGrid}>
            <FormField label="Paid to"><input value={pf.vendor} onChange={e=>setPf(p=>({...p,vendor:e.target.value}))} /></FormField>
            <FormField label="Amount ($)"><input type="number" value={pf.amount} onChange={e=>setPf(p=>({...p,amount:e.target.value}))} /></FormField>
            <FormField label="Date"><input type="date" value={pf.date} onChange={e=>setPf(p=>({...p,date:e.target.value}))} /></FormField>
            <FormField label="Paid by">
              <select value={pf.who} onChange={e=>setPf(p=>({...p,who:e.target.value}))}>
                <option value="Cochin">Glenn Cochin (Bride's Dad)</option>
                <option value="Cochin">Stephanie Cochin (Bride's Mom)</option>
                <option value="Bleustein">David Bleustein (Groom's Dad)</option>
                <option value="Bleustein">Bonni Bleustein (Groom's Mom)</option>
              </select>
            </FormField>
            <FormField label="Method"><select value={pf.method} onChange={e=>setPf(p=>({...p,method:e.target.value}))}>{['Check','Wire','Zelle','Credit card','Cash'].map(m=><option key={m}>{m}</option>)}</select></FormField>
            <FormField label="Notes"><input value={pf.notes} onChange={e=>setPf(p=>({...p,notes:e.target.value}))} /></FormField>
          </div>
          <button style={S.saveBtn} onClick={savePayment}>Save</button>
          <button style={S.cancelBtn} onClick={() => setShowPayForm(false)}>Cancel</button>
        </div>
      )}
      {showContribForm && (
        <div style={S.formBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Add a contribution</div>
          <div style={S.formGrid}>
            <FormField label="From">
              <select value={cf.who} onChange={e=>setCf(p=>({...p,who:e.target.value}))}>
                <option value="Cochin">Glenn Cochin (Bride's Dad)</option>
                <option value="Cochin">Stephanie Cochin (Bride's Mom)</option>
                <option value="Bleustein">David Bleustein (Groom's Dad)</option>
                <option value="Bleustein">Bonni Bleustein (Groom's Mom)</option>
              </select>
            </FormField>
            <FormField label="Amount ($)"><input type="number" value={cf.amount} onChange={e=>setCf(p=>({...p,amount:e.target.value}))} /></FormField>
            <FormField label="Date"><input type="date" value={cf.date} onChange={e=>setCf(p=>({...p,date:e.target.value}))} /></FormField>
            <FormField label="Notes"><input value={cf.notes} onChange={e=>setCf(p=>({...p,notes:e.target.value}))} /></FormField>
          </div>
          <button style={S.saveBtn} onClick={saveContrib}>Save</button>
          <button style={S.cancelBtn} onClick={() => setShowContribForm(false)}>Cancel</button>
        </div>
      )}
      <div style={S.sectionTitle}>Transaction history</div>
      {[...transactions].sort((a,b)=>b.date.localeCompare(a.date)).map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.type === 'in' ? '#EAF3DE' : '#FCEBEB', color: t.type === 'in' ? '#27500A' : '#791F1F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{t.type === 'in' ? '+' : '−'}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{t.label}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.sub}</div></div>
          <div style={{ fontWeight: 500, color: t.type === 'in' ? '#3B6D11' : '#A32D2D', minWidth: 80, textAlign: 'right' }}>{t.type === 'in' ? '+' : '−'}{fmtMoney(t.amount)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 65, textAlign: 'right' }}>{fmtDate(t.date)}</div>
        </div>
      ))}
    </div>
  )
}

// ── GUESTS ────────────────────────────────────────────
function GuestsTab({ guests, setGuests, viewer, logActivity, setSyncStatus }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', side: "Bride's family", rsvp: 'awaiting' })
  const [filter, setFilter] = useState('all')

  async function save() {
    if (!form.name) return
    setSyncStatus('saving')
    const { data } = await supabase.from('guests').insert([{ id: uid(), ...form, created_by: viewer }]).select()
    if (data) { setGuests(prev => [...prev, ...data]); setShowForm(false); setForm({ name:'', side:"Bride's family", rsvp:'awaiting' }) }
    await logActivity('👤', viewer, 'added guest: ' + form.name, 'guests')
    setSyncStatus('saved')
  }

  async function updateRsvp(id, rsvp) {
    await supabase.from('guests').update({ rsvp }).eq('id', id)
    setGuests(prev => prev.map(g => g.id === id ? { ...g, rsvp } : g))
    setSyncStatus('saved')
  }

  const confirmed = guests.filter(g=>g.rsvp==='confirmed').length
  const declined  = guests.filter(g=>g.rsvp==='declined').length
  const awaiting  = guests.filter(g=>g.rsvp==='awaiting').length

  const filtered = filter === 'all' ? guests
    : guests.filter(g => g.rsvp === filter)

  const RSVP_LABELS = { confirmed: 'Confirmed', awaiting: 'Awaiting', declined: 'Declined' }

  return (
    <div style={S.section}>
      {/* Stats */}
      <div style={S.grid}>
        <div style={{ ...S.metricCard, borderLeft: '4px solid var(--sage)', background: 'linear-gradient(135deg, #F5FCF6, white)' }}>
          <div style={S.metricLabel}>Confirmed</div>
          <div style={{ ...S.metricValue, color: '#2D6A4F' }}>{confirmed}</div>
          <div style={S.pbWrap}><div style={S.pb(guests.length ? Math.round(confirmed/guests.length*100) : 0, '#4A9B6F')} /></div>
        </div>
        <div style={{ ...S.metricCard, borderLeft: '3px solid var(--gold)' }}>
          <div style={S.metricLabel}>Awaiting</div>
          <div style={{ ...S.metricValue, color: '#7C4A03' }}>{awaiting}</div>
        </div>
        <div style={{ ...S.metricCard, borderLeft: '3px solid #C4697A' }}>
          <div style={S.metricLabel}>Declined</div>
          <div style={{ ...S.metricValue, color: '#7C1F1F' }}>{declined}</div>
        </div>
      </div>

      {/* Filter + add */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Add guest</button>
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 3, gap: 2 }}>
          {[['all','All'],['confirmed','✓ Confirmed'],['awaiting','⏳ Awaiting'],['declined','✗ Declined']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: filter===v ? 'white' : 'transparent', color: filter===v ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: filter===v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>{l}</button>
          ))}
        </div>
      </div>

      {showForm && (
        <div style={S.formBox}>
          <div style={S.formGrid}>
            <FormField label="Name"><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. John & Jane Smith" /></FormField>
            <FormField label="Side"><select value={form.side} onChange={e=>setForm(p=>({...p,side:e.target.value}))}>{["Bride's family","Groom's family","Friends of couple"].map(s=><option key={s}>{s}</option>)}</select></FormField>
            <FormField label="RSVP"><select value={form.rsvp} onChange={e=>setForm(p=>({...p,rsvp:e.target.value}))}><option value="awaiting">Awaiting</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></FormField>
          </div>
          <button style={S.saveBtn} onClick={save}>Save guest ✓</button>
          <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        </div>
      )}

      {!filtered.length
        ? (
          <div style={{ ...S.empty }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{filter !== 'all' ? '🔍' : '👤'}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{filter !== 'all' ? 'No guests matching this filter' : 'No guests added yet'}</div>
            {filter === 'all' && <div style={{ fontSize: 13 }}>Tap "+ Add guest" above to start your guest list.</div>}
          </div>
        )
        : filtered.map((g, i) => {
          const ini = g.name.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase()
          const [bg, tc] = G_AVATARS[guests.indexOf(g) % G_AVATARS.length]
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', marginBottom: 6, background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)', transition: 'box-shadow 0.2s' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${bg}, ${bg}DD)`, color: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, boxShadow: `0 2px 8px ${tc}22` }}>{ini}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{g.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{g.side}</div>
              </div>
              <select
                value={g.rsvp}
                onChange={e => updateRsvp(g.id, e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', width: 'auto', fontWeight: 500, background: g.rsvp === 'confirmed' ? '#EBF7F0' : g.rsvp === 'declined' ? '#FBEAEA' : '#FEF3E2', color: g.rsvp === 'confirmed' ? '#2D6A4F' : g.rsvp === 'declined' ? '#7C1F1F' : '#7C4A03', cursor: 'pointer' }}
              >
                <option value="confirmed">Confirmed</option>
                <option value="awaiting">Awaiting</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          )
        })
      }
    </div>
  )
}

// ── TIMELINE ──────────────────────────────────────────
function TimelineTab({ dates, setDates, viewer, logActivity, setSyncStatus }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ d: '', title: '', descr: '' })

  async function save() {
    if (!form.d || !form.title) return
    setSyncStatus('saving')
    const { data } = await supabase.from('dates').insert([{ id: uid(), ...form, created_by: viewer }]).select()
    if (data) { setDates(prev => [...prev, ...data].sort((a,b)=>a.d.localeCompare(b.d))); setShowForm(false); setForm({ d:'', title:'', descr:'' }) }
    await logActivity('📅', viewer, 'added a date: ' + form.title, 'timeline')
    setSyncStatus('saved')
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const all = [...dates, ...FIXED_DATES].sort((a,b)=>a.d.localeCompare(b.d))

  return (
    <div style={S.section}>
      <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Add milestone</button>
      {showForm && (
        <div style={S.formBox}>
          <div style={S.formGrid}>
            <FormField label="Date"><input type="date" value={form.d} onChange={e=>setForm(p=>({...p,d:e.target.value}))} /></FormField>
            <FormField label="Milestone"><input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} /></FormField>
            <FormField label="Notes" full><input value={form.descr} onChange={e=>setForm(p=>({...p,descr:e.target.value}))} /></FormField>
          </div>
          <button style={S.saveBtn} onClick={save}>Save guest ✓</button>
          <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        </div>
      )}
      {all.map((item, i) => {
        const dt = new Date(item.d + 'T00:00:00')
        const isPast = dt < today
        const daysAway = Math.ceil((dt - today) / 86400000)
        const isSoon = !isPast && daysAway <= 30
        const isWedding = item.id === 'fixed-3'
        const isLast = i === all.length - 1

        const dotColor = isWedding ? '#C4697A' : isPast ? '#4A9B6F' : isSoon ? '#B8956A' : 'var(--border-strong)'
        const cardBg = isWedding ? 'linear-gradient(135deg, #F9EEF0, #FAF8F5)' : isPast ? '#F5FCF8' : 'white'
        const borderColor = isWedding ? 'var(--rose-mid)' : isPast ? '#B8DCCA' : isSoon ? '#D4B483' : 'var(--border)'

        return (
          <div key={item.id} style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
            {/* Timeline spine */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
              <div style={{ width: isWedding ? 16 : 12, height: isWedding ? 16 : 12, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 14, border: isWedding ? '2px solid white' : 'none', boxShadow: isWedding ? '0 0 0 3px var(--rose-mid)' : 'none' }} />
              {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4, borderRadius: 1 }} />}
            </div>
            {/* Card */}
            <div style={{ flex: 1, background: cardBg, border: '1px solid ' + borderColor, borderRadius: 'var(--r-lg)', padding: '13px 16px', marginBottom: isLast ? 0 : 4, boxShadow: isWedding ? '0 4px 20px rgba(196,105,122,0.15)' : 'var(--shadow-xs)', transition: 'box-shadow 0.2s' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isPast ? '#4A9B6F' : isSoon ? '#B8956A' : 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>
                {isPast ? '✓ ' : isSoon ? '⏰ ' : ''}{fmtDate(item.d)}
                {!isPast && daysAway > 0 && <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>· {daysAway} days away</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: isWedding ? 700 : 600, color: isWedding ? 'var(--rose-dark)' : 'var(--text-primary)', fontFamily: isWedding ? 'Georgia, serif' : 'inherit' }}>{item.title}</div>
              {(item.descr || item.desc) && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{item.descr || item.desc}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CHECKLIST ─────────────────────────────────────────
function ChecklistTab({ tasks, setTasks, clCats, setClCats, viewer, logActivity, setSyncStatus }) {
  const [activeCat, setActiveCat] = useState(clCats[0] || '')
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [form, setForm] = useState({ task: '', due: '', cat: clCats[0] || '' })
  const [newCat, setNewCat] = useState('')

  const catTasks = tasks.filter(t => t.cat === activeCat)
  const done = catTasks.filter(t => t.done).length

  async function toggle(task) {
    const newDone = !task.done
    await supabase.from('tasks').update({ done: newDone, done_by: newDone ? viewer : null }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: newDone } : t))
    if (newDone) await logActivity('✅', viewer, 'completed: ' + task.task, 'checklist')
    setSyncStatus('saved')
  }

  async function saveTask() {
    if (!form.task) return
    setSyncStatus('saving')
    const { data } = await supabase.from('tasks').insert([{ id: uid(), ...form, done: false, created_by: viewer }]).select()
    if (data) { setTasks(prev => [...prev, ...data]); setShowForm(false); setForm({ task:'', due:'', cat: activeCat }) }
    await logActivity('📝', viewer, 'added task: ' + form.task, 'checklist')
    setSyncStatus('saved')
  }

  async function addCat() {
    if (!newCat || clCats.includes(newCat)) return
    await supabase.from('checklist_categories').insert([{ name: newCat, sort_order: clCats.length + 1 }])
    setClCats(prev => [...prev, newCat])
    setActiveCat(newCat)
    setNewCat('')
    setShowCatForm(false)
  }

  const totalTasks = tasks.length, totalDone = tasks.filter(t=>t.done).length
  const pct = totalTasks ? Math.round(totalDone/totalTasks*100) : 0

  return (
    <div style={S.section}>
      {/* Progress card */}
      <div style={{ background: 'linear-gradient(135deg, #F9EEF0, #FAF8F5)', border: '1px solid var(--rose-mid)', borderRadius: 'var(--r-lg)', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--rose-dark)', marginBottom: 6 }}>Overall progress</div>
          <div style={{ ...S.pbWrap, height: 8 }}><div style={S.pb(pct, 'var(--rose)')} /></div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5 }}>{totalDone} of {totalTasks} tasks complete</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--rose-dark)', letterSpacing: '-0.02em', minWidth: 50, textAlign: 'right' }}>{pct}%</div>
      </div>

      {/* Category pills */}
      <div style={S.catTabs}>
        {clCats.map(c => {
          const all = tasks.filter(t=>t.cat===c), d = all.filter(t=>t.done).length
          const isComplete = all.length > 0 && d === all.length
          return (
            <button key={c} style={{ ...S.catTab(c === activeCat), ...(isComplete && c !== activeCat ? { borderColor: '#B8DCCA', color: '#4A9B6F', background: '#F5FCF8' } : {}) }} onClick={() => setActiveCat(c)}>
              {isComplete ? '✓ ' : ''}{c} <span style={{ opacity: 0.7, fontSize: 10 }}>{d}/{all.length}</span>
            </button>
          )
        })}
      </div>

      {showForm && (
        <div style={S.formBox}>
          <div style={S.formGrid}>
            <FormField label="Task"><input value={form.task} onChange={e=>setForm(p=>({...p,task:e.target.value}))} /></FormField>
            <FormField label="Due date"><input type="date" value={form.due} onChange={e=>setForm(p=>({...p,due:e.target.value}))} /></FormField>
            <FormField label="Category"><select value={form.cat} onChange={e=>setForm(p=>({...p,cat:e.target.value}))}>{clCats.map(c=><option key={c}>{c}</option>)}</select></FormField>
          </div>
          <button style={S.saveBtn} onClick={saveTask}>Add task ✓</button>
          <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        </div>
      )}
      {showCatForm && (
        <div style={S.formBox}>
          <FormField label="New category name"><input value={newCat} onChange={e=>setNewCat(e.target.value)} /></FormField>
          <div style={{ marginTop: 10 }}>
            <button style={S.saveBtn} onClick={addCat}>Add category ✓</button>
            <button style={S.cancelBtn} onClick={() => setShowCatForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Add task</button>
        <button style={S.addBtn} onClick={() => setShowCatForm(!showCatForm)}>+ Add category</button>
      </div>

      {/* Progress for active cat */}
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        {activeCat} · {done} of {catTasks.length} done
        {done === catTasks.length && catTasks.length > 0 && <span style={{ color: '#4A9B6F', marginLeft: 6 }}>🎉 All done!</span>}
      </div>

      {!catTasks.length
        ? <div style={S.empty}>No tasks here yet. Tap "+ Add task" to add one, or switch category above.</div>
        : catTasks.map(t => (
          <div key={t.id} onClick={() => toggle(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 7, background: t.done ? 'linear-gradient(135deg, #F0FAF4, #EAF6EE)' : 'white', borderRadius: 'var(--r-lg)', border: '1px solid ' + (t.done ? 'rgba(78,155,106,0.22)' : 'var(--border)'), cursor: 'pointer', transition: 'all 0.2s', boxShadow: t.done ? 'none' : 'var(--shadow-xs)' }}>
            <div style={{ width: 22, height: 22, borderRadius: 7, border: t.done ? 'none' : '2px solid var(--rose-mid)', background: t.done ? 'linear-gradient(135deg, #5EC48A, #4E9B6A)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: 'white', fontWeight: 800, transition: 'all 0.2s', boxShadow: t.done ? '0 2px 8px rgba(78,155,106,0.3)' : '0 1px 3px rgba(196,105,122,0.08)' }}>
              {t.done && '✓'}
            </div>
            <div style={{ flex: 1, fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: t.done ? 400 : 600, letterSpacing: '-0.01em' }}>{t.task}</div>
            <div style={{ fontSize: 11, color: t.done ? '#4A9B6F' : 'var(--text-tertiary)', flexShrink: 0 }}>
              {t.done ? 'Done ✓' : t.due ? fmtDate(t.due).replace(', 2027','').replace(', 2026','') : ''}
            </div>
          </div>
        ))
      }
    </div>
  )
}

// ── SEATING CHART ──────────────────────────────────────
function SeatingChartTab({ guests, tables, setTables, viewer, logActivity, setSyncStatus }) {
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableCapacity, setNewTableCapacity] = useState(10)
  const [editingTable, setEditingTable] = useState(null) // id of table being renamed
  const [editName, setEditName] = useState('')
  const [dragGuest, setDragGuest] = useState(null)   // { guestId, fromTableId }
  const [dragOver, setDragOver] = useState(null)     // tableId being hovered
  const [search, setSearch] = useState('')

  // All guest IDs that are already assigned to a table
  const assignedIds = new Set(tables.flatMap(t => t.guest_ids || []))
  const unassigned = guests.filter(g => !assignedIds.has(g.id) && g.rsvp !== 'declined')
  const filteredUnassigned = search
    ? unassigned.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : unassigned

  // Stats
  const totalSeated = tables.reduce((s, t) => s + (t.guest_ids?.length || 0), 0)
  const confirmed = guests.filter(g => g.rsvp === 'confirmed').length

  async function addTable() {
    if (!newTableName.trim()) return
    setSyncStatus('saving')
    const item = {
      id: uid(),
      name: newTableName.trim(),
      capacity: Number(newTableCapacity) || 10,
      guest_ids: [],
      sort_order: tables.length + 1,
      created_by: viewer,
    }
    const { data } = await supabase.from('seating_tables').insert([item]).select()
    if (data) setTables(prev => [...prev, data[0]])
    setNewTableName('')
    setNewTableCapacity(10)
    setShowAddTable(false)
    await logActivity('🪑', viewer, `added table: ${item.name}`, 'seating')
    setSyncStatus('saved')
  }

  async function deleteTable(id) {
    if (!window.confirm('Remove this table? Guests will return to unassigned.')) return
    await supabase.from('seating_tables').delete().eq('id', id)
    setTables(prev => prev.filter(t => t.id !== id))
    setSyncStatus('saved')
  }

  async function renameTable(id) {
    if (!editName.trim()) return
    await supabase.from('seating_tables').update({ name: editName.trim() }).eq('id', id)
    setTables(prev => prev.map(t => t.id === id ? { ...t, name: editName.trim() } : t))
    setEditingTable(null)
    setSyncStatus('saved')
  }

  async function assignGuest(guestId, toTableId, fromTableId = null) {
    setSyncStatus('saving')
    const updates = []

    // Remove from old table
    if (fromTableId && fromTableId !== 'unassigned') {
      const from = tables.find(t => t.id === fromTableId)
      if (from) {
        const newIds = (from.guest_ids || []).filter(id => id !== guestId)
        updates.push(supabase.from('seating_tables').update({ guest_ids: newIds }).eq('id', fromTableId))
      }
    }

    // Add to new table (if not dropping back to unassigned)
    if (toTableId !== 'unassigned') {
      const to = tables.find(t => t.id === toTableId)
      if (to && !(to.guest_ids || []).includes(guestId)) {
        const newIds = [...(to.guest_ids || []), guestId]
        updates.push(supabase.from('seating_tables').update({ guest_ids: newIds }).eq('id', toTableId))
      }
    }

    await Promise.all(updates)

    // Update local state
    setTables(prev => prev.map(t => {
      if (t.id === fromTableId) return { ...t, guest_ids: (t.guest_ids||[]).filter(id=>id!==guestId) }
      if (t.id === toTableId) return { ...t, guest_ids: [...(t.guest_ids||[]), guestId] }
      return t
    }))
    setSyncStatus('saved')
  }

  // Drag handlers
  function onDragStart(e, guestId, fromTableId) {
    setDragGuest({ guestId, fromTableId })
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDrop(e, toTableId) {
    e.preventDefault()
    if (!dragGuest) return
    if (dragGuest.fromTableId !== toTableId) {
      assignGuest(dragGuest.guestId, toTableId, dragGuest.fromTableId)
    }
    setDragGuest(null)
    setDragOver(null)
  }

  function onDropUnassigned(e) {
    e.preventDefault()
    if (!dragGuest || dragGuest.fromTableId === 'unassigned') return
    assignGuest(dragGuest.guestId, 'unassigned', dragGuest.fromTableId)
    setDragGuest(null)
    setDragOver(null)
  }

  // Guest chip component
  function GuestChip({ guest, fromTableId }) {
    const [bg, tc] = PEOPLE[guest?.name]?.avatar || G_AVATARS[guests.indexOf(guest) % G_AVATARS.length] || ['#f5f5f3','#666']
    const ini = guest?.name?.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?'
    return (
      <div
        draggable
        onDragStart={e => onDragStart(e, guest.id, fromTableId)}
        onDragEnd={() => { setDragGuest(null); setDragOver(null) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px 5px 5px',
          background: 'white', borderRadius: 20,
          border: '0.5px solid var(--border)',
          fontSize: 12, cursor: 'grab',
          userSelect: 'none',
          opacity: dragGuest?.guestId === guest.id ? 0.4 : 1,
          transition: 'opacity 0.15s',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: bg, color: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{ini}</div>
        <span style={{ color: 'var(--text-primary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guest.name}</span>
        {fromTableId !== 'unassigned' && (
          <button
            onClick={e => { e.stopPropagation(); assignGuest(guest.id, 'unassigned', fromTableId) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, padding: 0, lineHeight: 1, marginLeft: 2, opacity: 0.5 }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
            title="Remove from table"
          >×</button>
        )}
      </div>
    )
  }

  return (
    <div style={S.section}>
      {/* Stats */}
      <div style={S.grid}>
        <MetricCard label="Tables" value={tables.length} sub={`${tables.reduce((s,t)=>s+(t.capacity||10),0)} total seats`} />
        <MetricCard label="Guests seated" value={totalSeated} progress={confirmed ? Math.round(totalSeated/confirmed*100) : 0} progressColor="#1D9E75" sub={`of ${confirmed} confirmed`} />
        <MetricCard label="Unassigned" value={unassigned.length} sub={unassigned.length === 0 ? '🎉 Everyone seated!' : 'confirmed guests'} />
      </div>

      {/* Instructions */}
      <div style={{ background: '#EEEDFE', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: '#3C3489', marginBottom: '1.25rem', lineHeight: 1.6 }}>
        <strong>How to use:</strong> Drag guests from the unassigned pool onto any table. Drag between tables to move. Tap × to return a guest to unassigned. On mobile, use the "Assign" button instead.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button style={S.addBtn} onClick={() => setShowAddTable(!showAddTable)}>+ Add table</button>
        {tables.length > 0 && (
          <button style={S.addBtn} onClick={async () => {
            // Auto-assign: distribute unassigned guests round-robin across tables with space
            setSyncStatus('saving')
            const tablesWithSpace = tables.filter(t => (t.guest_ids||[]).length < (t.capacity||10))
            let ti = 0
            const updates = tables.map(t => ({ ...t, guest_ids: [...(t.guest_ids||[])] }))
            for (const g of unassigned) {
              while (ti < tablesWithSpace.length && updates.find(t=>t.id===tablesWithSpace[ti].id).guest_ids.length >= (tablesWithSpace[ti].capacity||10)) ti++
              if (ti >= tablesWithSpace.length) break
              const tbl = updates.find(t => t.id === tablesWithSpace[ti].id)
              if (tbl) tbl.guest_ids.push(g.id)
              if (updates.find(t=>t.id===tablesWithSpace[ti].id).guest_ids.length >= (tablesWithSpace[ti].capacity||10)) ti++
            }
            await Promise.all(updates.map(t => supabase.from('seating_tables').update({ guest_ids: t.guest_ids }).eq('id', t.id)))
            setTables(updates)
            setSyncStatus('saved')
          }}>⚡ Auto-assign unassigned</button>
        )}
      </div>

      {showAddTable && (
        <div style={S.formBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>New table</div>
          <div style={S.formGrid}>
            <FormField label="Table name"><input value={newTableName} onChange={e=>setNewTableName(e.target.value)} placeholder="e.g. Table 1 or Sweetheart Table" onKeyDown={e=>e.key==='Enter'&&addTable()} /></FormField>
            <FormField label="Capacity (seats)"><input type="number" value={newTableCapacity} onChange={e=>setNewTableCapacity(e.target.value)} min={1} max={30} /></FormField>
          </div>
          <button style={S.saveBtn} onClick={addTable}>Add table</button>
          <button style={S.cancelBtn} onClick={() => setShowAddTable(false)}>Cancel</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── LEFT: Unassigned pool ── */}
        <div
          style={{ width: '100%', maxWidth: 280, flexShrink: 0 }}
          onDragOver={e => { e.preventDefault(); setDragOver('unassigned') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDropUnassigned}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Unassigned guests</div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: unassigned.length ? '#FAEEDA' : '#EAF3DE', color: unassigned.length ? '#633806' : '#27500A', fontWeight: 500 }}>{unassigned.length}</span>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guests…"
            style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
          />
          <div
            style={{
              minHeight: 80, padding: 10,
              background: dragOver === 'unassigned' ? '#EEEDFE' : 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)', border: '1.5px dashed ' + (dragOver === 'unassigned' ? '#534AB7' : 'var(--border)'),
              display: 'flex', flexWrap: 'wrap', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {filteredUnassigned.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0', width: '100%', textAlign: 'center' }}>
                  {unassigned.length === 0 ? '🎉 All confirmed guests seated!' : 'No matches'}
                </div>
              : filteredUnassigned.map(g => <GuestChip key={g.id} guest={g} fromTableId="unassigned" />)
            }
          </div>
          {guests.filter(g=>g.rsvp==='declined').length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, padding: '4px 0' }}>
              {guests.filter(g=>g.rsvp==='declined').length} declined · {guests.filter(g=>g.rsvp==='awaiting').length} awaiting RSVP (not shown)
            </div>
          )}
        </div>

        {/* ── RIGHT: Tables ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {tables.length === 0 ? (
            <div style={S.empty}>No tables yet — tap "+ Add table" to create your first one.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {tables.map(table => {
                const seated = (table.guest_ids || []).length
                const capacity = table.capacity || 10
                const full = seated >= capacity
                const isDragTarget = dragOver === table.id
                const seatedGuests = (table.guest_ids || []).map(id => guests.find(g => g.id === id)).filter(Boolean)

                return (
                  <div
                    key={table.id}
                    onDragOver={e => { e.preventDefault(); if (!full) setDragOver(table.id) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => onDrop(e, table.id)}
                    style={{
                      background: isDragTarget ? 'var(--rose-light)' : full ? '#F0FAF4' : 'white',
                      border: '1.5px solid ' + (isDragTarget ? 'var(--rose-mid)' : full ? 'rgba(78,155,106,0.3)' : 'var(--border)'),
                      borderRadius: 'var(--radius-lg)', padding: '12px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Table header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      {editingTable === table.id ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key==='Enter') renameTable(table.id); if (e.key==='Escape') setEditingTable(null) }}
                          autoFocus
                          style={{ fontSize: 13, fontWeight: 500, flex: 1, marginRight: 6 }}
                        />
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', flex: 1 }} onDoubleClick={() => { setEditingTable(table.id); setEditName(table.name) }}>
                          {table.name}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {editingTable === table.id ? (
                          <>
                            <button onClick={() => renameTable(table.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: 'none', background: '#534AB7', color: 'white', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingTable(null)} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'none', cursor: 'pointer' }}>×</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingTable(table.id); setEditName(table.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', opacity: 0.4, padding: '0 2px' }} title="Rename">✏️</button>
                            <button onClick={() => deleteTable(table.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', opacity: 0.4, padding: '0 2px' }} title="Delete table"
                              onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.4}>🗑️</button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.min(seated/capacity*100, 100)+'%', background: full ? '#1D9E75' : '#534AB7', borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: full ? '#1D9E75' : 'var(--text-secondary)', fontWeight: full ? 500 : 400, flexShrink: 0 }}>{seated}/{capacity}</span>
                    </div>

                    {/* Seated guest chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 36 }}>
                      {seatedGuests.map(g => <GuestChip key={g.id} guest={g} fromTableId={table.id} />)}
                      {seatedGuests.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0', width: '100%' }}>
                          {isDragTarget ? 'Drop here' : 'Drag guests here'}
                        </div>
                      )}
                    </div>

                    {/* Mobile assign button */}
                    {unassigned.length > 0 && !full && (
                      <div style={{ marginTop: 8, borderTop: '0.5px solid var(--border)', paddingTop: 8 }}>
                        <select
                          defaultValue=""
                          onChange={e => { if (e.target.value) { assignGuest(e.target.value, table.id, 'unassigned'); e.target.value = '' } }}
                          style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                        >
                          <option value="" disabled>+ Assign a guest…</option>
                          {unassigned.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── GIFT TRACKER ──────────────────────────────────────
function GiftTrackerTab({ viewer, gifts, setGifts, guests, logActivity, setSyncStatus }) {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'sent'
  const [sortBy, setSortBy] = useState('name') // 'name' | 'date'
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    from_name: '', gift_desc: '', gift_type: 'Physical gift',
    received_date: '', amount: '', thank_you_sent: false, notes: ''
  })

  const GIFT_TYPES = ['Physical gift', 'Cash', 'Check', 'Gift card', 'Experience', 'Other']

  async function saveGift() {
    if (!form.from_name.trim()) return
    setSyncStatus('saving')
    const item = {
      id: uid(),
      from_name: form.from_name.trim(),
      gift_desc: form.gift_desc.trim(),
      gift_type: form.gift_type,
      received_date: form.received_date || new Date().toISOString().split('T')[0],
      amount: form.amount ? Number(form.amount) : null,
      thank_you_sent: false,
      notes: form.notes.trim(),
      added_by: viewer,
      created_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('gifts').insert([item]).select()
    if (data) {
      setGifts(prev => [...prev, data[0]])
      setShowForm(false)
      setForm({ from_name: '', gift_desc: '', gift_type: 'Physical gift', received_date: '', amount: '', thank_you_sent: false, notes: '' })
    }
    await logActivity('🎁', viewer, 'logged a gift from ' + form.from_name, 'gifts')
    setSyncStatus('saved')
  }

  async function toggleThankYou(gift) {
    const newVal = !gift.thank_you_sent
    await supabase.from('gifts').update({ thank_you_sent: newVal }).eq('id', gift.id)
    setGifts(prev => prev.map(g => g.id === gift.id ? { ...g, thank_you_sent: newVal } : g))
    if (newVal) await logActivity('✉️', viewer, 'marked thank-you sent to ' + gift.from_name, 'gifts')
    setSyncStatus('saved')
  }

  async function deleteGift(id) {
    if (!window.confirm('Remove this gift?')) return
    await supabase.from('gifts').delete().eq('id', id)
    setGifts(prev => prev.filter(g => g.id !== id))
    setSyncStatus('saved')
  }

  // Stats
  const total = gifts.length
  const thankYouSent = gifts.filter(g => g.thank_you_sent).length
  const thankYouPending = total - thankYouSent
  const totalCash = gifts.filter(g => g.amount).reduce((s, g) => s + Number(g.amount), 0)

  // Filter + search + sort
  const visible = gifts
    .filter(g => {
      if (filter === 'pending') return !g.thank_you_sent
      if (filter === 'sent') return g.thank_you_sent
      return true
    })
    .filter(g => !search || g.from_name?.toLowerCase().includes(search.toLowerCase()) || g.gift_desc?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'date'
      ? (b.received_date || '').localeCompare(a.received_date || '')
      : (a.from_name || '').localeCompare(b.from_name || '')
    )

  const progress = total > 0 ? Math.round(thankYouSent / total * 100) : 0

  return (
    <div style={S.section}>

      {/* Stats row */}
      <div style={S.grid}>
        <MetricCard label="Total gifts" value={total} sub={totalCash > 0 ? `+ ${fmtMoney(totalCash)} cash/checks` : 'logged so far'} />
        <MetricCard label="Thank-you's sent" value={thankYouSent} progress={progress} progressColor="#1D9E75" sub={`${progress}% complete`} />
        <MetricCard label="Still to send" value={thankYouPending} sub={thankYouPending === 0 ? '🎉 All done!' : 'thank-you notes pending'} />
      </div>

      {/* Progress banner when all done */}
      {total > 0 && thankYouPending === 0 && (
        <div style={{ background: 'linear-gradient(135deg, #E8F5EE, #F0FAF4)', borderRadius: 'var(--r-lg)', padding: '14px 18px', fontSize: 14, color: '#1E6B3F', marginBottom: '1rem', textAlign: 'center', fontWeight: 700, border: '1px solid rgba(78,155,106,0.2)', boxShadow: '0 2px 12px rgba(78,155,106,0.1)' }}>
          🎉 All thank-you notes sent — you're done!
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Log gift</button>

        {/* Filter pills */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 3, gap: 2 }}>
          {[['all','All'],['pending','Pending 📬'],['sent','Sent ✓']].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === v ? 'white' : 'transparent', color: filter === v ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: filter === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, border: '0.5px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <option value="name">Sort A–Z</option>
          <option value="date">Sort by date</option>
        </select>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-secondary)' }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or gift…"
          style={{ width: '100%', paddingLeft: 36 }}
        />
      </div>

      {/* Add gift form */}
      {showForm && (
        <div style={S.formBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Log a gift</div>
          <div style={S.formGrid}>
            <FormField label="From (name or family)">
              <input value={form.from_name} onChange={e => setForm(p => ({ ...p, from_name: e.target.value }))} placeholder="e.g. Uncle Bob & Aunt Linda" list="guest-suggestions" />
              <datalist id="guest-suggestions">
                {guests.map(g => <option key={g.id} value={g.name} />)}
              </datalist>
            </FormField>
            <FormField label="Gift type">
              <select value={form.gift_type} onChange={e => setForm(p => ({ ...p, gift_type: e.target.value }))}>
                {GIFT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Gift description" full>
              <input value={form.gift_desc} onChange={e => setForm(p => ({ ...p, gift_desc: e.target.value }))} placeholder="e.g. KitchenAid Stand Mixer — Silver" />
            </FormField>
            <FormField label="Cash / check amount ($)">
              <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="Leave blank if not cash" />
            </FormField>
            <FormField label="Date received">
              <input type="date" value={form.received_date} onChange={e => setForm(p => ({ ...p, received_date: e.target.value }))} />
            </FormField>
            <FormField label="Notes" full>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. From registry — Crate & Barrel" />
            </FormField>
          </div>
          <button style={S.saveBtn} onClick={saveGift}>Save</button>
          <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        </div>
      )}

      {/* Gift list */}
      {!visible.length ? (
        <div style={S.empty}>
          {total === 0 ? 'No gifts logged yet. Add them as they arrive — even before the wedding!' : 'No gifts match this filter.'}
        </div>
      ) : (
        <div>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border)', marginBottom: 4 }}>
            <span>Gift</span>
            <span>Thank-you</span>
          </div>

          {visible.map(g => {
            const typeColors = {
              'Cash': ['#EAF3DE','#27500A'], 'Check': ['#EAF3DE','#27500A'],
              'Gift card': ['#EEEDFE','#3C3489'], 'Physical gift': ['#E6F1FB','#0C447C'],
              'Experience': ['#FAEEDA','#633806'], 'Other': ['#f5f5f3','#6b6b68'],
            }
            const [tbg, ttc] = typeColors[g.gift_type] || typeColors['Other']

            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', borderRadius: 'var(--r-lg)', marginBottom: 8, background: g.thank_you_sent ? 'var(--bg-secondary)' : 'white', border: '1px solid ' + (g.thank_you_sent ? 'rgba(74,155,111,0.2)' : 'var(--border)'), opacity: g.thank_you_sent ? 0.72 : 1, transition: 'all 0.2s', boxShadow: g.thank_you_sent ? 'none' : 'var(--shadow-xs)' }}>

                {/* Thank-you checkbox */}
                <div
                  onClick={() => toggleThankYou(g)}
                  title={g.thank_you_sent ? 'Mark as not sent' : 'Mark thank-you as sent'}
                  style={{ width: 24, height: 24, borderRadius: '50%', border: g.thank_you_sent ? 'none' : '2px solid var(--rose-mid)', background: g.thank_you_sent ? 'linear-gradient(135deg, #5EC48A, #4E9B6A)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 1, color: 'white', fontSize: 12, transition: 'all 0.2s', boxShadow: g.thank_you_sent ? '0 2px 8px rgba(74,155,111,0.35)' : 'none' }}>
                  {g.thank_you_sent && '✓'}
                </div>

                {/* Gift info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: g.thank_you_sent ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: g.thank_you_sent ? 'line-through' : 'none', letterSpacing: '-0.01em' }}>{g.from_name}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: tbg, color: ttc, fontWeight: 500 }}>{g.gift_type}</span>
                    {g.amount > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: '#27500A' }}>{fmtMoney(g.amount)}</span>}
                  </div>
                  {g.gift_desc && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.gift_desc}</div>}
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    {g.received_date && <span>{fmtDate(g.received_date)}</span>}
                    {g.notes && <span>· {g.notes}</span>}
                    {g.thank_you_sent && <span style={{ color: '#1D9E75', fontWeight: 500 }}>· ✉️ Thank-you sent</span>}
                  </div>
                </div>

                {/* Delete */}
                <button onClick={() => deleteGift(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, opacity: 0.3, padding: 0, flexShrink: 0, marginTop: 2 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── UNSPLASH IMAGE SEARCH ─────────────────────────────
const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || ''

const WEDDING_SEARCHES = [
  'wedding flowers', 'bridal bouquet', 'wedding ceremony',
  'wedding reception', 'wedding centerpiece', 'wedding venue',
  'wedding dress', 'wedding cake', 'wedding decor', 'wedding lighting',
  'garden wedding', 'romantic flowers', 'wedding table setting',
]

function UnsplashSearch({ mediaCats, activeCat, viewer, onSave, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedIds, setSavedIds] = useState(new Set())
  const [savingId, setSavingId] = useState(null)
  const [selectedCat, setSelectedCat] = useState(activeCat)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80) }, [])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  async function search(q = query, p = 1) {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    if (p === 1) setResults([])

    try {
      if (!UNSPLASH_KEY) {
        // No API key — show demo results using Unsplash's source URL (no key needed for single images)
        // This gives real images but no search capability
        setError('no_key')
        setLoading(false)
        return
      }

      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=20&page=${p}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
      )

      if (!res.ok) {
        if (res.status === 403) { setError('rate_limit'); setLoading(false); return }
        throw new Error('Search failed')
      }

      const data = await res.json()
      const photos = data.results.map(r => ({
        id: r.id,
        thumb: r.urls.small,
        full: r.urls.regular,
        alt: r.alt_description || r.description || q,
        photographer: r.user.name,
        photographerUrl: r.user.links.html,
        downloadUrl: r.links.download_location,
      }))

      setResults(prev => p === 1 ? photos : [...prev, ...photos])
      setTotalPages(Math.ceil(data.total / 20))
      setPage(p)
    } catch (e) {
      setError('Search failed. Check your internet connection.')
    }
    setLoading(false)
  }

  // Debounced search as user types
  function handleInput(val) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (val.trim().length >= 3) {
      debounceRef.current = setTimeout(() => search(val, 1), 500)
    }
  }

  async function savePhoto(photo) {
    setSavingId(photo.id)
    // Trigger Unsplash download tracking (required by their API terms)
    if (UNSPLASH_KEY && photo.downloadUrl) {
      fetch(photo.downloadUrl + `?client_id=${UNSPLASH_KEY}`).catch(() => {})
    }
    const item = {
      id: uid(),
      title: photo.alt || query || 'Wedding photo',
      cat: selectedCat,
      url: photo.photographerUrl,
      thumb: photo.full,
      notes: `Photo by ${photo.photographer} on Unsplash`,
      file_name: '',
      ratings: {},
      comments: [],
      created_by: viewer,
      link_type: 'unsplash',
    }
    await onSave(item)
    setSavedIds(prev => new Set([...prev, photo.id]))
    setSavingId(null)
  }

  // Category colour for save button
  const catColor = { 'Florals': '#4A9B6F', 'Photography': '#2C6B8B', 'Venues': '#7B4B8B', 'Bands & Music': '#B8956A' }[selectedCat] || '#C4697A'

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 1rem 1rem', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 640, background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', marginBottom: '2rem' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a1a18, #333)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>🔍 Search wedding photos</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>Powered by Unsplash · Free professional photos</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', opacity: 0.7, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          {/* Search bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-tertiary)' }}>🔍</span>
              <input
                ref={searchRef}
                value={query}
                onChange={e => handleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search(query, 1)}
                placeholder="Search: bouquet, centerpiece, venue, cake…"
                style={{ paddingLeft: 34, fontSize: 14, borderRadius: 12 }}
              />
            </div>
            <button onClick={() => search(query, 1)} disabled={loading || !query.trim()} style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--rose)', color: 'white', fontSize: 13, fontWeight: 600, cursor: query.trim() ? 'pointer' : 'not-allowed', opacity: query.trim() ? 1 : 0.5, flexShrink: 0 }}>
              {loading ? '…' : 'Search'}
            </button>
          </div>

          {/* Quick search pills */}
          {!results.length && !loading && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Popular searches</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {WEDDING_SEARCHES.map(s => (
                  <button key={s} onClick={() => { setQuery(s); search(s, 1) }} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border-strong)', background: 'white', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--rose-light)'; e.currentTarget.style.borderColor = 'var(--rose-mid)'; e.currentTarget.style.color = 'var(--rose-dark)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Save-to category selector */}
          {(results.length > 0 || loading) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, fontWeight: 500 }}>Save to:</span>
              <select value={selectedCat} onChange={e => setSelectedCat(e.target.value)} style={{ fontSize: 13, flex: 1, borderRadius: 8, padding: '5px 8px', border: '1px solid var(--border-strong)' }}>
                {mediaCats.map(c => <option key={c}>{c}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{results.length} photos</span>
            </div>
          )}
        </div>

        {/* No API key state */}
        {error === 'no_key' && (
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔑</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unsplash API key needed</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 14, maxWidth: 380, margin: '0 auto 14px' }}>
              To enable photo search, add a free Unsplash access key to your Vercel environment variables.<br /><br />
              1. Go to <strong>unsplash.com/developers</strong> → "Your apps" → "New application"<br />
              2. Copy your Access Key<br />
              3. In Vercel: Settings → Environment Variables → add <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 4 }}>VITE_UNSPLASH_ACCESS_KEY</code>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Free tier: 50 searches/hour · No credit card needed</div>
          </div>
        )}

        {/* Rate limit */}
        {error === 'rate_limit' && (
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Too many searches</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Unsplash free tier allows 50 searches per hour. Try again in a few minutes.</div>
          </div>
        )}

        {/* Other errors */}
        {error && error !== 'no_key' && error !== 'rate_limit' && (
          <div style={{ margin: '0 16px 12px', padding: '10px 14px', background: '#FBEAEA', borderRadius: 10, fontSize: 13, color: '#7C1F1F' }}>⚠️ {error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '2rem', color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--rose)', animation: 'spin 0.7s linear infinite' }} />
            Searching Unsplash…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* Photo grid */}
        {results.length > 0 && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {results.map(photo => {
                const isSaved = savedIds.has(photo.id)
                const isSaving = savingId === photo.id
                return (
                  <div key={photo.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)', border: '1px solid ' + (isSaved ? '#B8DCCA' : 'var(--border)'), transition: 'transform 0.15s', cursor: 'pointer' }}
                    onMouseEnter={e => !isSaved && (e.currentTarget.style.transform = 'scale(1.02)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <img
                      src={photo.thumb}
                      alt={photo.alt}
                      loading="lazy"
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Overlay on hover */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 8 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginBottom: 5, lineHeight: 1.3 }}>
                        {photo.alt?.slice(0, 40) || photo.photographer}
                      </div>
                      <button
                        onClick={() => !isSaved && !isSaving && savePhoto(photo)}
                        style={{ width: '100%', padding: '6px', borderRadius: 7, border: 'none', background: isSaved ? '#4A9B6F' : catColor, color: 'white', fontSize: 11, fontWeight: 700, cursor: isSaved ? 'default' : 'pointer', transition: 'background 0.2s' }}
                      >
                        {isSaved ? '✓ Saved!' : isSaving ? '…' : `+ ${selectedCat}`}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Load more */}
            {page < totalPages && (
              <button onClick={() => search(query, page + 1)} disabled={loading} style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'white', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {loading ? 'Loading…' : 'Load more photos'}
              </button>
            )}

            {/* Attribution required by Unsplash */}
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 10 }}>
              Photos from <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>Unsplash</a> · Free to use
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MEDIA & REVIEWS ───────────────────────────────────
function MediaTab({ mediaItems, setMediaItems, mediaCats, setMediaCats, viewer, logActivity, setSyncStatus }) {
  const [activeCat, setActiveCat] = useState(mediaCats[0] || '')
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [showUnsplash, setShowUnsplash] = useState(false)
  const [form, setForm] = useState({ title: '', cat: mediaCats[0] || '', url: '', notes: '' })
  const [newCat, setNewCat] = useState('')
  const [modalItem, setModalItem] = useState(null)

  const catItems = mediaItems.filter(m => m.cat === activeCat)

  async function saveMedia() {
    if (!form.title) { alert('Please add a title.'); return }
    if (!form.url && !form._file) { alert('Please paste a link or upload a file.'); return }
    setSyncStatus('saving')

    // Detect link type and set appropriate icon + thumbnail
    const url = form.url || ''
    const isYT = /youtube\.com|youtu\.be/i.test(url)
    const isVimeo = /vimeo\.com/i.test(url)
    const isDrive = /drive\.google\.com/i.test(url)
    const isGPhotos = /photos\.app\.goo\.gl|photos\.google\.com/i.test(url)
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url)

    const ytThumb = u => {
      try {
        const parsed = new URL(u)
        let id = parsed.searchParams.get('v')
        if (!id && parsed.hostname === 'youtu.be') id = parsed.pathname.slice(1)
        if (id) return 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg'
      } catch(e) {}
      return ''
    }

    let thumb = ''
    let icon = '🔗'

    if (form._file) {
      icon = form._file.type.startsWith('image/') ? '📷' : '🎬'
      if (form._file.type.startsWith('image/')) thumb = URL.createObjectURL(form._file)
    } else if (isYT) {
      icon = '🎬'; thumb = ytThumb(url)
    } else if (isVimeo) {
      icon = '🎬'
    } else if (isDrive) {
      icon = '📁'
      // Convert Drive share link to direct thumbnail if possible
      const fileId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
      if (fileId) thumb = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
    } else if (isGPhotos) {
      icon = '📸'
      // Google Photos shared links can't generate thumbnails directly — use a placeholder
      thumb = ''
    } else if (isImage) {
      icon = '📸'; thumb = url
    }

    const fileName = form._file?.name || ''
    const fileURL = form._file ? URL.createObjectURL(form._file) : ''

    const item = {
      id: uid(), title: form.title, cat: form.cat, notes: form.notes,
      url, thumb, file_name: fileName, ratings: {}, comments: [],
      created_by: viewer,
      // Store link type so MediaCard can render it correctly
      link_type: isGPhotos ? 'google_photos' : isDrive ? 'drive' : isYT ? 'youtube' : isVimeo ? 'vimeo' : form._file ? 'file' : 'link'
    }

    const { data } = await supabase.from('media_items').insert([item]).select()
    if (data) {
      const withFile = data.map(d => ({ ...d, fileURL }))
      setMediaItems(prev => [...prev, ...withFile])
      setShowForm(false)
      setForm({ title: '', cat: activeCat, url: '', notes: '', _file: null, _preview: null })
    }
    await logActivity(icon, viewer, 'added ' + (isGPhotos ? 'photos' : form._file?.type.startsWith('image/') ? 'photo' : 'media') + ': ' + form.title + ' (' + form.cat + ')', 'media')
    setSyncStatus('saved')
  }

  async function addCat() {
    if (!newCat || mediaCats.includes(newCat)) return
    await supabase.from('media_categories').insert([{ name: newCat, sort_order: mediaCats.length + 1 }])
    setMediaCats(prev => [...prev, newCat])
    setActiveCat(newCat)
    setNewCat('')
    setShowCatForm(false)
  }

  async function rate(item, val) {
    const newRatings = { ...item.ratings, [viewer]: item.ratings[viewer] === val ? 0 : val }
    await supabase.from('media_items').update({ ratings: newRatings }).eq('id', item.id)
    setMediaItems(prev => prev.map(m => m.id === item.id ? { ...m, ratings: newRatings } : m))
    if (newRatings[viewer]) await logActivity('⭐', viewer, `rated "${item.title}" ${newRatings[viewer]}★`, 'media')
    setSyncStatus('saved')
  }

  async function addComment(item, text) {
    if (!text.trim()) return
    const newComments = [...(item.comments || []), { who: viewer, text: text.trim(), rating: item.ratings?.[viewer] || 0, ts: Date.now() }]
    await supabase.from('media_items').update({ comments: newComments }).eq('id', item.id)
    setMediaItems(prev => prev.map(m => m.id === item.id ? { ...m, comments: newComments } : m))
    await logActivity('💬', viewer, `commented on "${item.title}"`, 'media')
    setSyncStatus('saved')
  }

  function getEmbedURL(url) {
    try {
      const u = new URL(url)
      let vid = u.searchParams.get('v')
      if (!vid && u.hostname === 'youtu.be') vid = u.pathname.slice(1)
      if (vid) return 'https://www.youtube.com/embed/' + vid + '?autoplay=1'
      if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean).pop(); return 'https://player.vimeo.com/video/' + id + '?autoplay=1' }
      if (u.hostname.includes('drive.google.com')) { const m = url.match(/\/d\/(.*?)\//); if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview' }
    } catch(e){}
    return url
  }

  return (
    <div style={S.section}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
      Viewing as <strong>{viewer}</strong> — switch your name above before rating or commenting.
      </div>
      <div style={S.catTabs}>
        {mediaCats.map(c => {
          const count = mediaItems.filter(m=>m.cat===c).length
          return <button key={c} style={S.catTab(c === activeCat)} onClick={() => setActiveCat(c)}>{c}{count > 0 && <span style={{ opacity: 0.7, fontSize: 11 }}> {count}</span>}</button>
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button style={{ ...S.addBtn, background: 'var(--rose-light)', border: '1px solid var(--rose-mid)', color: 'var(--rose-dark)' }} onClick={() => setShowUnsplash(true)}>🔍 Search photos</button>
        <button style={S.addBtn} onClick={() => setShowForm(!showForm)}>+ Paste a link</button>
        <button style={S.addBtn} onClick={() => setShowCatForm(!showCatForm)}>+ Add category</button>
      </div>

      {/* Unsplash Search Modal */}
      {showUnsplash && (
        <UnsplashSearch
          mediaCats={mediaCats}
          activeCat={activeCat}
          viewer={viewer}
          onSave={async (item) => {
            const { data } = await supabase.from('media_items').insert([item]).select()
            if (data) setMediaItems(prev => [...prev, ...data])
            await logActivity('📸', viewer, `saved photo: ${item.title} (${item.cat})`, 'media')
            setSyncStatus('saved')
          }}
          onClose={() => setShowUnsplash(false)}
        />
      )}
      {showForm && (
        <div style={S.formBox}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Add to media board</div>

          {/* How-to tip */}
          <div style={{ background: 'var(--gold-light)', border: '1px solid #D4B483', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#5C3D00', lineHeight: 1.7 }}>
            <strong>📸 Adding a photo?</strong> Open Google Photos → tap the photo → Share → "Create link" → Copy → paste below.<br />
            Works with Google Photos, Google Drive, YouTube, and Vimeo.
          </div>

          <div style={S.formGrid}>
            <FormField label="Title"><input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Venue walkthrough, Florist inspiration…" /></FormField>
            <FormField label="Category"><select value={form.cat} onChange={e=>setForm(p=>({...p,cat:e.target.value}))}>{mediaCats.map(c=><option key={c}>{c}</option>)}</select></FormField>
            <FormField label="Paste link" full>
              <input
                value={form.url}
                onChange={e=>setForm(p=>({...p,url:e.target.value}))}
                placeholder="Google Photos link, YouTube, Vimeo, or Google Drive…"
              />
              {form.url && !form._file && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/youtube\.com|youtu\.be/i.test(form.url) && '🎬 YouTube video detected'}
                  {/vimeo\.com/i.test(form.url) && '🎬 Vimeo video detected'}
                  {/drive\.google\.com/i.test(form.url) && '📁 Google Drive link detected'}
                  {/photos\.app\.goo\.gl|photos\.google\.com/i.test(form.url) && '📸 Google Photos link detected'}
                  {!/youtube\.com|youtu\.be|vimeo\.com|drive\.google\.com|photos\.app\.goo\.gl|photos\.google\.com/i.test(form.url) && form.url.startsWith('http') && '🔗 Link added'}
                </div>
              )}
            </FormField>
            <FormField label="Notes (optional)" full>
              <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. From the venue visit Saturday, ask Perri about this…" />
            </FormField>
          </div>
          <button style={S.saveBtn} onClick={saveMedia}>Add to board</button>
          <button style={S.cancelBtn} onClick={() => { setShowForm(false); setForm(p => ({...p, _file:null, _preview:null})) }}>Cancel</button>
        </div>
      )}
      {showCatForm && (
        <div style={S.formBox}>
          <FormField label="New category name"><input value={newCat} onChange={e=>setNewCat(e.target.value)} /></FormField>
          <div style={{ marginTop: 10 }}>
            <button style={S.saveBtn} onClick={addCat}>Add category ✓</button>
            <button style={S.cancelBtn} onClick={() => setShowCatForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!catItems.length ? <div style={S.empty}>Nothing here yet. Tap "+ Add video, photo or link" to add something.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {catItems.map(m => <MediaCard key={m.id} item={m} viewer={viewer} onRate={rate} onComment={addComment} onOpen={setModalItem} />)}
        </div>
      )}

      {/* Media Modal — lightbox for photos, open-in-tab for Google Photos/Drive */}
      {modalItem && (
        <div onClick={e=>e.target===e.currentTarget&&setModalItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--r-lg)', width: '100%', maxWidth: 720, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{modalItem.title}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {modalItem.url && (
                  <a href={modalItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--rose)', fontWeight: 600, textDecoration: 'none', padding: '4px 10px', border: '1px solid var(--rose-mid)', borderRadius: 8 }}>
                    Open ↗
                  </a>
                )}
                <button onClick={() => setModalItem(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
              </div>
            </div>
            {/* Google Photos / Drive — can't embed, show a nice card instead */}
            {(/photos\.app\.goo\.gl|photos\.google\.com|drive\.google\.com/i.test(modalItem.url || '')) ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{/photos/i.test(modalItem.url) ? '📸' : '📁'}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{modalItem.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  {/photos/i.test(modalItem.url) ? 'Google Photos album — opens in Google Photos' : 'Google Drive file — opens in Google Drive'}
                </div>
                <a href={modalItem.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 12, background: 'var(--rose)', color: 'white', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 2px 10px rgba(196,105,122,0.3)' }}>
                  Open →
                </a>
              </div>
            ) : modalItem.thumb && !modalItem.url ? (
              <div style={{ background: '#1a1a18', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                <img src={modalItem.thumb} alt={modalItem.title} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
              </div>
            ) : (
              <iframe src={getEmbedURL(modalItem.url)} style={{ width: '100%', aspectRatio: '16/9', border: 'none', background: '#000' }} allowFullScreen />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MediaCard({ item, viewer, onRate, onComment, onOpen }) {
  const [commentText, setCommentText] = useState('')
  const myRating = item.ratings?.[viewer] || 0
  const rVals = Object.values(item.ratings || {})
  const avg = rVals.length ? (rVals.reduce((a,b)=>a+Number(b),0)/rVals.length).toFixed(1) : null

  const isUnsplash = item.link_type === 'unsplash'
  const isGPhotos = item.link_type === 'google_photos' || /photos\.app\.goo\.gl|photos\.google\.com/i.test(item.url || '')
  const isDrive = item.link_type === 'drive' || /drive\.google\.com/i.test(item.url || '')
  const isPhoto = isUnsplash || item.thumb && (item.file_name?.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) || item.cat === 'Photos' || item.link_type === 'drive')
  const isExternalLink = isGPhotos || isDrive
  const linkIcon = isGPhotos ? '📸' : isDrive ? '📁' : item.file_name ? '📎' : '🎬'
  const linkLabel = isGPhotos ? 'Google Photos album' : isDrive ? 'Google Drive file' : item.file_name || 'Video link'

  function submit() { onComment(item, commentText); setCommentText('') }

  return (
    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {/* Thumbnail / preview */}
      <div
        onClick={() => isExternalLink ? window.open(item.url, '_blank') : onOpen(item)}
        style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: isGPhotos ? '#F9EEF0' : 'var(--bg-secondary)', cursor: 'pointer', overflow: 'hidden' }}
      >
        {item.thumb
          ? <img src={item.thumb} alt={item.title} style={{ position: 'absolute', top:0, left:0, width:'100%', height:'100%', objectFit: isPhoto ? 'contain' : 'cover', background: isPhoto ? '#1a1a18' : 'transparent' }} />
          : <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6 }}>
              <div style={{fontSize:32}}>{linkIcon}</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',padding:'0 12px',textAlign:'center',lineHeight:1.5}}>{linkLabel}</div>
              {isExternalLink && (
                <div style={{ marginTop:4,fontSize:11,fontWeight:600,color:'var(--rose)',padding:'4px 12px',background:'white',borderRadius:20,boxShadow:'var(--shadow-sm)' }}>
                  Tap to open →
                </div>
              )}
            </div>
        }
        {/* Play button for videos only */}
        {!isPhoto && !isExternalLink && item.url && (
          <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.12)' }}>
            <div style={{ width:42,height:42,borderRadius:'50%',background:'rgba(255,255,255,0.92)',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <div style={{ width:0,height:0,borderStyle:'solid',borderWidth:'7px 0 7px 14px',borderColor:`transparent transparent transparent var(--rose)`,marginLeft:3 }} />
            </div>
          </div>
        )}
        {/* Google Photos badge */}
        {isGPhotos && (
          <div style={{ position:'absolute',top:8,left:8,background:'white',borderRadius:8,padding:'3px 8px',fontSize:10,fontWeight:600,color:'#8B3A47',boxShadow:'var(--shadow-sm)',display:'flex',alignItems:'center',gap:3 }}>
            📸 Google Photos
          </div>
        )}
        {/* Unsplash badge */}
        {isUnsplash && (
          <div style={{ position:'absolute',top:8,left:8,background:'rgba(0,0,0,0.6)',borderRadius:8,padding:'3px 8px',fontSize:10,fontWeight:600,color:'white',display:'flex',alignItems:'center',gap:3 }}>
            📷 Unsplash
          </div>
        )}
        <div style={{ position:'absolute',top:8,right:8,background: isPhoto ? 'rgba(29,158,117,0.85)' : 'rgba(83,74,183,0.85)',color:'#EEEDFE',fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:500 }}>
          {isPhoto ? '📷 Photo' : item.url ? 'Link' : 'File'}
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{item.notes ? item.notes + ' · ' : ''}{avg ? avg + '★ avg (' + rVals.length + ')' : 'No ratings yet'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Your rating:</div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
          {[1,2,3,4,5].map(n => <span key={n} onClick={() => onRate(item, n)} style={{ fontSize: 20, cursor: 'pointer', color: n <= myRating ? '#BA7517' : 'var(--border)', lineHeight: 1 }}>★</span>)}
        </div>
        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
          {(item.comments || []).map((c, i) => {
            const [bg,tc] = AVATARS[c.who] || ['#f5f5f3','#666']
            const ini = c.who?.slice(0,2).toUpperCase()
            return (
              <div key={i} style={{ display:'flex',gap:8,marginBottom:8,fontSize:12 }}>
                <div style={{ width:24,height:24,borderRadius:'50%',background:bg,color:tc,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:500,flexShrink:0,marginTop:1 }}>{ini}</div>
                <div style={{ background:'var(--bg-secondary)',borderRadius:'var(--radius-md)',padding:'6px 10px',flex:1 }}>
                  <div style={{ fontWeight:500,marginBottom:2 }}>{c.who}{c.rating ? <span style={{color:'#BA7517',fontSize:11}}> {'★'.repeat(c.rating)}</span> : ''}</div>
                  <div style={{ color:'var(--text-secondary)',lineHeight:1.5 }}>{c.text}</div>
                </div>
              </div>
            )
          })}
          <div style={{ display:'flex',gap:6,marginTop:8 }}>
            <input value={commentText} onChange={e=>setCommentText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder={`Comment as ${viewer}...`} style={{ flex:1,fontSize:12,padding:'6px 10px' }} />
            <button onClick={submit} style={{ padding:'6px 12px',fontSize:12,borderRadius:'var(--radius-md)',border:'0.5px solid var(--border)',background:'white',cursor:'pointer' }}>Post</button>
          </div>
        </div>
      </div>
    </div>
  )
}
