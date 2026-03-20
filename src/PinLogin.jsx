import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

// ── PEOPLE (duplicated here so PinLogin is self-contained) ──
const PEOPLE = {
  'Perri':     { role: 'Bride',           family: 'Cochin',    avatar: ['#FBEAF0', '#72243E'] },
  'Noah':      { role: 'Groom',           family: 'Bleustein', avatar: ['#E6F1FB', '#0C447C'] },
  'Glenn':     { role: "Bride's Dad",     family: 'Cochin',    avatar: ['#EEEDFE', '#3C3489'] },
  'Stephanie': { role: "Bride's Mom",     family: 'Cochin',    avatar: ['#E1F5EE', '#085041'] },
  'Bonni':     { role: "Groom's Mom",     family: 'Bleustein', avatar: ['#EAF3DE', '#27500A'] },
  'David':     { role: "Groom's Dad",     family: 'Bleustein', avatar: ['#FAEEDA', '#633806'] },
  'Planner':   { role: 'Wedding Planner', family: 'External',  avatar: ['#EDF4F4', '#1B5E5E'] },
}
const PARENTS = ['Glenn', 'Stephanie', 'Bonni', 'David']
const FAMILY_PEOPLE = ['Perri', 'Noah', 'Glenn', 'Stephanie', 'Bonni', 'David']

// ── PIN STORAGE ───────────────────────────────────────────
// PINs are stored in Supabase as SHA-256 hashes — never as plain text.
// The raw PIN never leaves the device unencrypted.

async function hashPin(name, pin) {
  // Salt with the person's name so "1234" hashes differently for each person
  const data = new TextEncoder().encode(name.toLowerCase() + ':' + pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function savePin(name, pin) {
  const hash = await hashPin(name, pin)
  await supabase.from('user_pins').upsert({ name, pin_hash: hash }, { onConflict: 'name' })
}

async function verifyPin(name, pin) {
  const hash = await hashPin(name, pin)
  const { data } = await supabase.from('user_pins').select('pin_hash').eq('name', name).single()
  if (!data) return 'no_pin' // PIN not set yet
  return data.pin_hash === hash ? 'ok' : 'wrong'
}

async function hasPin(name) {
  const { data } = await supabase.from('user_pins').select('name').eq('name', name).single()
  return !!data
}

// ── STYLES ────────────────────────────────────────────────
const S = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 1rem',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: 'linear-gradient(160deg, #FCF0F3 0%, #FDF9F5 35%, #F5F0FA 70%, #EEF3FA 100%)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'rgba(255,252,249,0.95)',
    borderRadius: 28,
    padding: '2rem 1.5rem',
    boxShadow: '0 20px 60px rgba(139,58,71,0.14), 0 4px 20px rgba(139,58,71,0.08)',
    border: '1px solid rgba(196,105,122,0.12)',
    backdropFilter: 'blur(20px)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  logoTitle: { fontSize: 30, fontWeight: 700, color: '#8B3A47', fontFamily: "'Cormorant Garamond', Georgia, serif", marginBottom: 2, letterSpacing: '-0.02em', lineHeight: 1.1 },
  logoSub: { fontSize: 11, color: '#ADA49D', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 },
  sectionTitle: { fontSize: 16, fontWeight: 500, color: '#1a1a18', marginBottom: 6 },
  sectionSub: { fontSize: 13, color: '#6b6b68', marginBottom: '1.25rem', lineHeight: 1.6 },
  peopleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '0.5rem' },
  personBtn: (selected) => ({
    padding: '12px 8px',
    borderRadius: 12,
    border: selected ? '2px solid #C4697A' : '1px solid rgba(0,0,0,0.1)',
    background: selected ? '#F9EEF0' : 'white',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s',
    boxShadow: selected ? '0 2px 8px rgba(196,105,122,0.15)' : 'none',
  }),
  avatar: (bg, color, size = 44) => ({
    width: size, height: size, borderRadius: '50%',
    background: bg, color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size > 36 ? 14 : 12, fontWeight: 600,
    margin: '0 auto 6px',
    flexShrink: 0,
  }),
  personName: { fontSize: 13, fontWeight: 500, color: '#1a1a18' },
  personRole: { fontSize: 11, color: '#6b6b68', marginTop: 2 },
  pinHeader: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem',
    paddingBottom: '1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.1)',
  },
  pinDots: { display: 'flex', gap: 14, justifyContent: 'center', margin: '1.25rem 0' },
  pinDot: (filled) => ({
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid ' + (filled ? '#C4697A' : 'rgba(0,0,0,0.2)'),
    background: filled ? '#C4697A' : 'transparent',
    transition: 'all 0.12s',
    transform: filled ? 'scale(1.1)' : 'scale(1)',
  }),
  pinPad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 260, margin: '0 auto' },
  pinKey: {
    padding: '16px 8px',
    borderRadius: 14,
    border: '1px solid rgba(196,105,122,0.12)',
    background: 'white',
    fontSize: 22,
    fontWeight: 400,
    cursor: 'pointer',
    color: '#1A1612',
    transition: 'all 0.12s',
    WebkitTapHighlightColor: 'transparent',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
  },
  error: { textAlign: 'center', color: '#A32D2D', fontSize: 13, marginTop: '0.75rem', minHeight: 20 },
  backBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: '1.25rem', padding: '8px', borderRadius: 10,
    border: 'none', background: 'none',
    fontSize: 13, color: '#6b6b68', cursor: 'pointer', width: '100%',
  },
  successWrap: { textAlign: 'center', padding: '0.5rem 0' },
  tag: (isParent) => ({
    display: 'inline-block', padding: '4px 12px', borderRadius: 20,
    fontSize: 12, fontWeight: 500, marginBottom: '1rem',
    background: isParent ? '#EAF3DE' : '#EEEDFE',
    color: isParent ? '#27500A' : '#3C3489',
  }),
  note: {
    background: '#f5f5f3', borderRadius: 12, padding: '12px 14px',
    fontSize: 12, color: '#6b6b68', lineHeight: 1.6, textAlign: 'left',
    marginTop: '1rem',
  },
  primaryBtn: {
    width: '100%', padding: '14px', borderRadius: 14,
    border: 'none', background: 'linear-gradient(135deg, #D4788A 0%, #C4697A 100%)',
    color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: '1rem',
    boxShadow: '0 4px 20px rgba(196,105,122,0.35)',
    transition: 'all 0.2s', letterSpacing: '-0.01em',
  },
}

// ── COMPONENT ─────────────────────────────────────────────
export default function PinLogin({ onLogin }) {
  const [screen, setScreen] = useState('pick') // 'pick' | 'pin' | 'set' | 'confirm'
  const [selected, setSelected] = useState(null)
  const [entered, setEntered] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check if this device has a remembered session
  useEffect(() => {
    const saved = localStorage.getItem('pn-viewer')
    const savedSession = localStorage.getItem('pn-session-valid')
    if (saved && savedSession === 'true' && PEOPLE[saved]) {
      onLogin(saved)
    }
  }, [])

  function selectPerson(name) {
    setSelected(name)
    setEntered('')
    setError('')
    setScreen('checking')
    hasPin(name).then(exists => {
      setScreen(exists ? 'pin' : 'set')
    })
  }

  function pressKey(k) {
    if (entered.length >= 4) return
    const next = entered + k
    setEntered(next)
    setError('')
    if (next.length === 4) {
      setTimeout(() => handleFourDigits(next), 150)
    }
  }

  function pressDelete() {
    setEntered(prev => prev.slice(0, -1))
    setError('')
  }

  async function handleFourDigits(pin) {
    if (screen === 'pin') {
      // Verifying existing PIN
      setLoading(true)
      const result = await verifyPin(selected, pin)
      setLoading(false)
      if (result === 'ok') {
        // Remember session on this device
        localStorage.setItem('pn-viewer', selected)
        localStorage.setItem('pn-session-valid', 'true')
        onLogin(selected)
      } else {
        setEntered('')
        setError('Incorrect PIN. Try again.')
      }
    } else if (screen === 'set') {
      // First time — move to confirm step
      setConfirmPin(pin)
      setEntered('')
      setScreen('confirm')
    } else if (screen === 'confirm') {
      // Confirm PIN matches
      if (pin === confirmPin) {
        setLoading(true)
        await savePin(selected, pin)
        localStorage.setItem('pn-viewer', selected)
        localStorage.setItem('pn-session-valid', 'true')
        setLoading(false)
        onLogin(selected)
      } else {
        setEntered('')
        setConfirmPin('')
        setError("PINs don't match. Let's start over.")
        setScreen('set')
      }
    }
  }

  const person = selected ? PEOPLE[selected] : null

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>💍</div>
          <div style={S.logoTitle}>Perri &amp; Noah</div>
          <div style={S.logoSub}>Wedding Planner · October 16, 2027</div>
        </div>

        {/* PICK PERSON */}
        {screen === 'pick' && (
          <>
            <div style={S.sectionTitle}>Who are you?</div>
            <div style={S.sectionSub}>Tap your name to sign in with your PIN.</div>

            {/* Family members */}
            <div style={S.peopleGrid}>
              {FAMILY_PEOPLE.map(name => {
                const p = PEOPLE[name]
                return (
                  <button key={name} style={S.personBtn(false)} onClick={() => selectPerson(name)}>
                    <div style={S.avatar(p.avatar[0], p.avatar[1])}>
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={S.personName}>{name}</div>
                    <div style={S.personRole}>{p.role}</div>
                  </button>
                )
              })}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 10px', fontSize: 11, color: '#A8A29E' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              External access
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
            </div>

            {/* Planner — full width, distinct teal style */}
            <button
              onClick={() => selectPerson('Planner')}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #A8D4D4', background: '#EDF4F4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#D4ECEC'}
              onMouseLeave={e => e.currentTarget.style.background = '#EDF4F4'}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#EDF4F4', border: '2px solid #1B5E5E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#1B5E5E', flexShrink: 0 }}>WP</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1B5E5E' }}>Planner</div>
                <div style={{ fontSize: 11, color: '#2E8B8B' }}>Wedding Planner · External access</div>
              </div>
            </button>
          </>
        )}

        {/* CHECKING */}
        {screen === 'checking' && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b68', fontSize: 14 }}>
            Checking...
          </div>
        )}

        {/* ENTER PIN */}
        {(screen === 'pin' || screen === 'set' || screen === 'confirm') && person && (
          <>
            <div style={S.pinHeader}>
              <div style={{ ...S.avatar(person.avatar[0], person.avatar[1], 44), border: selected === 'Planner' ? '2px solid #1B5E5E' : 'none' }}>
                {selected.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: selected === 'Planner' ? '#1B5E5E' : '#1a1a18' }}>{selected}</div>
                <div style={{ fontSize: 12, color: '#6b6b68' }}>{person.role}</div>
                {selected === 'Planner' && (
                  <div style={{ fontSize: 11, color: '#2E8B8B', marginTop: 2 }}>🔒 No financial access</div>
                )}
              </div>
            </div>

            <div style={S.sectionTitle}>
              {screen === 'pin' && 'Enter your PIN'}
              {screen === 'set' && 'Create your PIN'}
              {screen === 'confirm' && 'Confirm your PIN'}
            </div>
            <div style={{ ...S.sectionSub, marginBottom: '0.5rem' }}>
              {screen === 'pin' && 'Enter your 4-digit PIN to sign in.'}
              {screen === 'set' && "You're signing in for the first time. Create a 4-digit PIN — you'll use this every time."}
              {screen === 'confirm' && 'Enter the same PIN again to confirm.'}
            </div>

            {/* PIN dots */}
            <div style={S.pinDots}>
              {[0,1,2,3].map(i => (
                <div key={i} style={S.pinDot(i < entered.length)} />
              ))}
            </div>

            {/* Number pad */}
            <div style={S.pinPad}>
              {['1','2','3','4','5','6','7','8','9'].map(k => (
                <button
                  key={k}
                  style={S.pinKey}
                  onClick={() => pressKey(k)}
                  onMouseDown={e => e.currentTarget.style.background = '#f5f5f3'}
                  onMouseUp={e => e.currentTarget.style.background = 'white'}
                >
                  {k}
                </button>
              ))}
              <div /> {/* empty */}
              <button
                style={S.pinKey}
                onClick={() => pressKey('0')}
                onMouseDown={e => e.currentTarget.style.background = '#f5f5f3'}
                onMouseUp={e => e.currentTarget.style.background = 'white'}
              >0</button>
              <button
                style={{ ...S.pinKey, fontSize: 18 }}
                onClick={pressDelete}
                onMouseDown={e => e.currentTarget.style.background = '#f5f5f3'}
                onMouseUp={e => e.currentTarget.style.background = 'white'}
              >⌫</button>
            </div>

            {loading && <div style={{ textAlign: 'center', marginTop: '1rem', color: '#6b6b68', fontSize: 13 }}>Verifying...</div>}
            <div style={S.error}>{error}</div>

            <button style={S.backBtn} onClick={() => { setScreen('pick'); setEntered(''); setError(''); setSelected(null) }}>
              ← Different person
            </button>
          </>
        )}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: '1.5rem', fontSize: 12, color: '#9b9b98', textAlign: 'center', maxWidth: 340 }}>
        PINs are encrypted and stored securely. This device will remember you after signing in.
      </div>
    </div>
  )
}

// ── SIGN OUT BUTTON (used inside the main app) ─────────────
export function SignOutButton({ onSignOut }) {
  function handleSignOut() {
    localStorage.removeItem('pn-session-valid')
    localStorage.removeItem('pn-viewer')
    onSignOut()
  }
  return (
    <button
      onClick={handleSignOut}
      style={{
        padding: '6px 14px', borderRadius: 20,
        border: '1px solid var(--border-strong, rgba(0,0,0,0.12))',
        background: 'white', color: '#78716C',
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.15s',
      }}
    >
      Sign out
    </button>
  )
}
