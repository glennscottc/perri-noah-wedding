import React, { useState } from 'react'
import { supabase } from './supabase'

// ── RULE-BASED FALLBACK PARSER ────────────────────────
// Works entirely in the browser — no API key needed.
// Handles the most common wedding email types.

function extractField(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return m[1]?.trim()
  }
  return ''
}

function parseEmailLocally(raw) {
  const text = raw
  const tl = text.toLowerCase()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Extract standard email headers
  const fromLine = lines.find(l => /^from:/i.test(l)) || ''
  const subjectLine = lines.find(l => /^subject:/i.test(l)) || ''
  const fromEmail = (fromLine.match(/<([^>]+)>/) || fromLine.match(/From:\s*(\S+@\S+)/i) || [])[1] || ''
  const fromName = fromLine.replace(/^from:\s*/i, '').replace(/<[^>]+>/, '').replace(fromEmail, '').trim()
  const subject = subjectLine.replace(/^subject:\s*/i, '').trim()

  // Extract phone numbers
  const phoneMatch = text.match(/\b(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/)
  const phone = phoneMatch ? phoneMatch[1] : ''

  // Extract dollar amounts
  const amountMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/)
  const amount = amountMatch ? amountMatch[1].replace(',', '') : ''

  // ── RSVP / Guest ──
  const isRsvp = /rsvp|attending|will attend|count us in|will be there|can make it|dinner selection|meal choice|dietary/i.test(tl)
  const hasDecline = /unable|can't make|cannot attend|won't be|not attend/i.test(tl)

  // ── Vendor quote / booking ──
  const isVendor = /quote|estimate|proposal|booking confirmed|invoice|contract|services|package|pricing|per person|total:/i.test(tl)

  // ── Deadline / reminder ──
  const isDeadline = /deadline|due by|no later than|reminder:|important.*date|must.*by|required.*by|submit.*by/i.test(tl)

  // ── Gift ──
  const isGift = /gift|present|registry|sent you|gifted/i.test(tl) && !/vendor|quote|florist|photog/i.test(tl)

  // Figure out vendor category from subject/body
  function detectCategory() {
    const cats = [
      [/florist|floral|flower|bloom|bouquet|centerpiece/i, 'Florals'],
      [/photo|photographer|photography|shoot|portrait/i, 'Photography'],
      [/video|videograph|film|footage/i, 'Videography'],
      [/band|music|musician|dj|entertainment|quartet|trio|orchestra/i, 'Bands & Music'],
      [/hair|makeup|beauty|stylist|salon/i, 'Hair & Makeup'],
      [/cake|bakery|pastry|dessert/i, 'Cake & Desserts'],
      [/transport|limo|car service|shuttle|bus|driver/i, 'Transportation'],
      [/cater|food|menu|cuisine|chef/i, 'Catering'],
      [/venue|hall|ballroom|estate|manor|club/i, 'Venue'],
    ]
    for (const [pattern, cat] of cats) {
      if (pattern.test(tl) || pattern.test(fromEmail)) return cat
    }
    return ''
  }

  // Extract dates mentioned in text (simple heuristic)
  function extractDates() {
    const datePatterns = [
      /(?:by|before|no later than|due|on)\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,?\s*202\d)?)/g,
      /(?:by|before|no later than|due|on)\s+(\d{1,2}\/\d{1,2}\/202\d)/g,
    ]
    const dates = []
    for (const pattern of datePatterns) {
      let m
      while ((m = pattern.exec(text)) !== null) {
        dates.push(m[1])
      }
    }
    return dates.slice(0, 4)
  }

  // ── Build result ──
  if (isGift) {
    const giftDesc = subject.replace(/re:|fwd:/gi, '').trim() || 'Gift'
    return {
      type: 'gift',
      confidence: 'medium',
      summary: `Gift from ${fromName || fromEmail || 'someone'}`,
      destination: 'Gift Tracker',
      items: [{
        table: 'gifts',
        description: `Gift from ${fromName || 'Unknown'}`,
        data: { from_name: fromName || fromEmail, gift_desc: giftDesc, gift_type: 'Physical gift', amount: amount || null }
      }]
    }
  }

  if (isDeadline) {
    const dates = extractDates()
    const items = dates.length > 0
      ? dates.map((d, i) => {
          const lineWithDate = lines.find(l => l.includes(d)) || ''
          const reminder = lineWithDate.replace(d, '').replace(/^\d+\.\s*/, '').trim() || subject
          return {
            table: 'reminders',
            description: `Deadline: ${reminder.slice(0, 60) || d}`,
            data: { text: reminder.slice(0, 120) || `Deadline from ${fromName || 'email'}`, due_date: null, priority: 'high' }
          }
        })
      : [{
          table: 'reminders',
          description: `Reminder from ${fromName || fromEmail}`,
          data: { text: subject || `Follow up: ${fromName || fromEmail}`, due_date: null, priority: 'normal' }
        }]
    return {
      type: 'reminder',
      confidence: dates.length > 0 ? 'high' : 'medium',
      summary: `${items.length} deadline${items.length !== 1 ? 's' : ''} from ${fromName || fromEmail}`,
      destination: 'Notes & Reminders',
      items
    }
  }

  if (isRsvp) {
    const nameParts = fromName || fromEmail.split('@')[0] || 'Guest'
    const mealLine = lines.find(l => /filet|sea bass|fish|chicken|vegetarian|meal|dinner/i.test(l)) || ''
    return {
      type: 'guest',
      confidence: 'high',
      summary: `RSVP from ${nameParts} — ${hasDecline ? 'declining' : 'attending'}`,
      destination: 'Guests',
      items: [{
        table: 'guests',
        description: `${hasDecline ? 'Declining' : 'Confirmed'}: ${nameParts}`,
        data: {
          name: nameParts,
          rsvp: hasDecline ? 'declined' : 'confirmed',
          side: "Bride's family",
          notes: mealLine || ''
        }
      }]
    }
  }

  if (isVendor) {
    const cat = detectCategory()
    const vendorName = fromName || fromEmail.split('@')[0] || 'Vendor'
    const isConfirmed = /confirmed|booked|reserved|locked in/i.test(tl)
    const items = [{
      table: 'vendors',
      description: `${isConfirmed ? 'Booked' : 'Quote from'}: ${vendorName}`,
      data: {
        name: vendorName,
        cat,
        phone,
        email: fromEmail,
        contact_name: fromName,
        status: isConfirmed ? 'deposit' : 'pending',
        notes: subject
      }
    }]
    // If there's a deposit/balance mentioned, also add a reminder
    if (/deposit|balance due|payment due|remaining balance/i.test(tl)) {
      const balanceLine = lines.find(l => /balance|deposit|due|remaining/i.test(l)) || ''
      items.push({
        table: 'reminders',
        description: `Payment reminder for ${vendorName}`,
        data: { text: balanceLine.slice(0, 120) || `Follow up on payment with ${vendorName}`, due_date: null, priority: 'normal' }
      })
    }
    return {
      type: 'vendor',
      confidence: 'high',
      summary: `${isConfirmed ? 'Booking confirmation' : 'Quote'} from ${vendorName}${cat ? ` (${cat})` : ''}`,
      destination: 'Vendors',
      items
    }
  }

  // Generic fallback — save as a note
  return {
    type: 'note',
    confidence: 'low',
    summary: subject || `Email from ${fromName || fromEmail}`,
    destination: 'Notes & Reminders',
    items: [{
      table: 'notes',
      description: `Note: ${subject || 'Email'}`,
      data: {
        title: subject || `From ${fromName || fromEmail}`,
        body: lines.filter(l => !/^(from|subject|to|date):/i.test(l)).join('\n').slice(0, 600)
      }
    }]
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

const SAMPLE_EMAILS = {
  vendor: `From: sarah@rosewoodflorist.com
Subject: Floral Quote — Perri & Noah Wedding, Oct 16 2027

Hi Perri and Glenn,

Thank you so much for reaching out! Here is our detailed quote for your October 16th wedding at Old Oaks Country Club.

Bridal bouquet (garden roses, peonies, eucalyptus): $380
10x Centerpieces (tall arrangements): $2,800
Ceremony arch with full florals: $1,200
Boutonnieres x6: $240
Total estimate: $4,620

We'd love to schedule a consultation at your convenience. Please call or email anytime.

Sarah Johnson
Rosewood Florist · 914-555-0192 · sarah@rosewoodflorist.com`,

  rsvp: `From: bob.smith@gmail.com
Subject: Re: Perri & Noah Wedding RSVP

Hi Stephanie!

We are so thrilled to celebrate with Perri and Noah. Count us in — both Uncle Bob and I will be attending.

For dinner selections: Bob would love the filet mignon, and I'll have the sea bass please. No dietary restrictions for either of us.

We cannot wait to see everyone. What a special day it will be!

Love, Aunt Linda`,

  deadline: `From: iwona.sterk@oldoaks.com
Subject: Important Reminders — Perri & Noah Event

Dear Glenn and Stephanie,

As your October 16th event approaches, please note the following deadlines:

1. Final guest count must be submitted no later than October 11th (5 days prior).
2. All outside vendors must provide proof of insurance by October 9th (7 days prior).
3. Final menu selections and any dietary accommodations are due by October 2nd (2 weeks prior).

Please do not hesitate to reach out with any questions.

Warm regards,
Iwona Sterk, General Manager
Old Oaks Country Club · 914-683-6000`,

  photographer: `From: carlos@elitephotography.com
Subject: Booking Confirmed — Perri & Noah Wedding Photography

Hi Perri and Noah,

I'm thrilled to confirm our booking for your wedding on October 16, 2027 at Old Oaks Country Club!

I'll arrive at 2:00 PM to begin getting-ready coverage. Please have all family grouping lists ready by 4:15 PM for formal portraits.

My second shooter Marcus will also be present throughout the evening.

Payment summary:
- Deposit received: $1,500 ✓
- Remaining balance: $2,500 (due 30 days before the wedding — September 16, 2027)

Best,
Carlos Rivera · Elite Photography
carlos@elitephotography.com · 914-555-0288`,
}

// Map AI table names to display labels
const TABLE_LABELS = {
  vendors: { label: 'Vendors', icon: '🏪', tab: 'vendors', color: ['#E6F1FB','#0C447C'] },
  guests: { label: 'Guests', icon: '👤', tab: 'guests', color: ['#EAF3DE','#27500A'] },
  reminders: { label: 'Reminders', icon: '🔔', tab: 'notes', color: ['#FAEEDA','#633806'] },
  notes: { label: 'Notes', icon: '📝', tab: 'notes', color: ['#EEEDFE','#3C3489'] },
  gifts: { label: 'Gifts', icon: '🎁', tab: 'gifts', color: ['#E1F5EE','#085041'] },
  payments: { label: 'Payments', icon: '💳', tab: 'payments', color: ['#FCEBEB','#791F1F'] },
}

export default function EmailImport({ viewer, guests, onNavigate, onClose }) {
  const [emailText, setEmailText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState([]) // which item indices have been saved
  const [saving, setSaving] = useState(null) // index currently saving

  async function analyze() {
    if (!emailText.trim()) return
    setLoading(true)
    setResult(null)
    setError('')
    setSaved([])
    try {
      // Try the AI API endpoint first
      let data = null
      try {
        const res = await fetch('/api/analyze-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailText }),
        })
        const json = await res.json()
        // If API key not configured or any server error, fall through to local parser
        if (res.ok && json.items) {
          data = json
        }
      } catch (apiErr) {
        // Network error or no API — fall through silently
      }

      // Use local rule-based parser if AI wasn't available
      if (!data) {
        data = parseEmailLocally(emailText)
        data._usedFallback = true
      }

      setResult(data)
    } catch (e) {
      setError('Could not parse this email. Try pasting just the important parts.')
    }
    setLoading(false)
  }

  async function saveItem(item, index) {
    setSaving(index)
    try {
      const d = item.data || {}
      switch (item.table) {
        case 'vendors':
          await supabase.from('vendors').insert([{
            id: uid(), name: d.name || 'Unknown vendor', cat: d.category || d.cat || '',
            contact_name: d.contact_name || '', phone: d.phone || '', email: d.email || '',
            address: d.address || '', status: d.status || 'pending', notes: d.notes || '',
            created_by: viewer,
          }])
          break
        case 'guests':
          await supabase.from('guests').insert([{
            id: uid(), name: d.name || 'Unknown', side: d.side || "Bride's family",
            rsvp: d.rsvp || 'confirmed', created_by: viewer,
          }])
          break
        case 'reminders':
          await supabase.from('reminders').insert([{
            id: uid(), text: d.text || item.description, due_date: d.due_date || null,
            priority: d.priority || 'normal', for_who: 'Everyone',
            created_by: viewer, is_private: false, done: false,
          }])
          break
        case 'notes':
          await supabase.from('notes').insert([{
            id: uid(), owner: viewer, title: d.title || '', body: d.body || emailText.slice(0, 500),
            color: '#E6F1FB', updated_at: new Date().toISOString(),
          }])
          break
        case 'gifts':
          await supabase.from('gifts').insert([{
            id: uid(), from_name: d.from_name || '', gift_desc: d.gift_desc || '',
            gift_type: d.gift_type || 'Physical gift', amount: d.amount || null,
            received_date: d.received_date || null, thank_you_sent: false, added_by: viewer,
          }])
          break
        default:
          break
      }
      setSaved(prev => [...prev, index])
    } catch (e) {
      console.error('Save error:', e)
    }
    setSaving(null)
  }

  async function saveAll() {
    if (!result?.items) return
    for (let i = 0; i < result.items.length; i++) {
      if (!saved.includes(i)) await saveItem(result.items[i], i)
    }
  }

  const allSaved = result?.items && result.items.every((_, i) => saved.includes(i))

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 1rem 1rem', overflowY: 'auto' },
    modal: { width: '100%', maxWidth: 580, background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', marginBottom: '2rem' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.1)', background: '#534AB7', color: 'white' },
    body: { padding: '1.25rem' },
    label: { fontSize: 12, fontWeight: 500, color: '#6b6b68', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
    textarea: { width: '100%', minHeight: 130, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.15)', outline: 'none', resize: 'vertical', lineHeight: 1.6, color: '#1a1a18', background: '#f9f9f7' },
    primaryBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', background: '#534AB7', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s' },
    secondaryBtn: { padding: '10px 14px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white', color: '#6b6b68', fontSize: 13, cursor: 'pointer' },
    itemCard: (saved) => ({ background: saved ? '#EAF3DE' : '#f9f9f7', borderRadius: 10, padding: '12px 14px', marginBottom: 10, border: '0.5px solid ' + (saved ? '#5DCAA5' : 'rgba(0,0,0,0.1)'), transition: 'all 0.2s' }),
    fieldRow: { display: 'flex', gap: 8, fontSize: 12, marginBottom: 4, flexWrap: 'wrap' },
    fieldLabel: { color: '#6b6b68', minWidth: 90, flexShrink: 0 },
    fieldVal: { color: '#1a1a18', fontWeight: 500, flex: 1 },
    samplePill: { padding: '4px 11px', borderRadius: 20, border: '0.5px solid rgba(0,0,0,0.12)', background: '#f5f5f3', fontSize: 12, color: '#6b6b68', cursor: 'pointer', whiteSpace: 'nowrap' },
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>📧 Import from email</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Paste any email — automatically reads and routes it</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', opacity: 0.8, lineHeight: 1 }}>×</button>
        </div>

        <div style={S.body}>
          {/* Sample pills */}
          {!result && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={S.label}>Try a sample</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['vendor','🌸 Florist quote'],['rsvp','👤 Guest RSVP'],['deadline','🔔 Venue deadlines'],['photographer','📷 Photo booking']].map(([k, label]) => (
                  <button key={k} style={S.samplePill} onClick={() => { setEmailText(SAMPLE_EMAILS[k]); setResult(null); setError('') }}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Email input */}
          {!result && (
            <>
              <div style={S.label}>Paste email here</div>
              <textarea
                style={S.textarea}
                value={emailText}
                onChange={e => setEmailText(e.target.value)}
                placeholder={'From: vendor@example.com\nSubject: Quote for your wedding\n\nHi! Here\'s the information you requested...'}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  style={{ ...S.primaryBtn, opacity: loading || !emailText.trim() ? 0.6 : 1, cursor: loading || !emailText.trim() ? 'not-allowed' : 'pointer' }}
                  onClick={analyze}
                  disabled={loading || !emailText.trim()}
                >
                  {loading ? '⏳ Reading email…' : '✨ Read & import email'}
                </button>
                {emailText && <button style={S.secondaryBtn} onClick={() => { setEmailText(''); setResult(null); setError('') }}>Clear</button>}
              </div>
            </>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 0', color: '#6b6b68', fontSize: 13 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #e0e0e0', borderTopColor: '#534AB7', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              Reading email and finding the right place for everything…
              <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: '#FCEBEB', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#791F1F', marginTop: 10 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Summary */}
              <div style={{ background: result._usedFallback ? '#FEF9F5' : '#F9EEF0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: result._usedFallback ? '#7C4A03' : '#8B3A47', marginBottom: '1rem', lineHeight: 1.5, border: '1px solid ' + (result._usedFallback ? '#D4B483' : '#E8B4BC') }}>
                <strong>Found:</strong> {result.summary}
                {result._usedFallback && (
                  <span style={{ marginLeft: 8, fontSize: 11, background: '#FEF3E2', color: '#7C4A03', padding: '2px 8px', borderRadius: 8, border: '1px solid #D4B483' }}>
                    Smart parser · review before saving
                  </span>
                )}
                {!result._usedFallback && result.confidence === 'low' && (
                  <span style={{ marginLeft: 8, fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '1px 7px', borderRadius: 8 }}>Low confidence — please review</span>
                )}
              </div>

              {/* Items to add */}
              <div style={S.label}>{result.items?.length || 0} item{result.items?.length !== 1 ? 's' : ''} to add</div>
              {result.items?.map((item, i) => {
                const meta = TABLE_LABELS[item.table] || { label: item.table, icon: '📌', color: ['#f5f5f3','#444'] }
                const isSaved = saved.includes(i)
                const isSaving = saving === i
                return (
                  <div key={i} style={S.itemCard(isSaved)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{meta.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18' }}>{item.description}</div>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: meta.color[0], color: meta.color[1], fontWeight: 500 }}>→ {meta.label}</span>
                        </div>
                      </div>
                      {!isSaved ? (
                        <button
                          onClick={() => saveItem(item, i)}
                          disabled={isSaving}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: 'white', fontSize: 12, fontWeight: 500, cursor: isSaving ? 'wait' : 'pointer', flexShrink: 0 }}
                        >{isSaving ? 'Adding…' : 'Add'}</button>
                      ) : (
                        <span style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500, flexShrink: 0 }}>✓ Added</span>
                      )}
                    </div>
                    {/* Show extracted fields */}
                    {item.data && Object.entries(item.data).filter(([k, v]) => v).slice(0, 5).map(([k, v]) => (
                      <div key={k} style={S.fieldRow}>
                        <span style={S.fieldLabel}>{k.replace(/_/g, ' ')}</span>
                        <span style={S.fieldVal}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
                {!allSaved ? (
                  <button style={S.primaryBtn} onClick={saveAll}>
                    ✓ Add all to app
                  </button>
                ) : (
                  <div style={{ background: '#EAF3DE', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#27500A', fontWeight: 500, flex: 1, textAlign: 'center' }}>
                    🎉 All items added! Check the relevant tabs.
                  </div>
                )}
                <button style={S.secondaryBtn} onClick={() => { setResult(null); setEmailText(''); setSaved([]) }}>Import another</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
