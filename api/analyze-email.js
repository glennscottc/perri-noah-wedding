// api/analyze-email.js
// Vercel serverless function — runs server-side so the Anthropic API key
// is never exposed in the browser. Called by the app's email import feature.
//
// Setup: Add ANTHROPIC_API_KEY to your Vercel environment variables.
// Get your key from: https://console.anthropic.com

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { emailText } = req.body
  if (!emailText || emailText.trim().length < 20) {
    return res.status(400).json({ error: 'Email text too short' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',  // Fast + cheap for this task
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are helping organize a wedding. Analyze this email and extract structured information to add to a wedding planning app.

The app has these sections:
- Vendors (name, category, contact_name, phone, email, address, status, notes)
- Guests (name, side, rsvp, notes)  
- Reminders (text, due_date in YYYY-MM-DD, priority: high/normal/low)
- Notes (title, body)
- Gifts (from_name, gift_desc, gift_type, amount)
- Payments (label, amount, date, family: Cochin or Bleustein, type: in/out)

Respond ONLY with a JSON object (no markdown, no explanation) with this structure:
{
  "type": one of: "vendor" | "guest" | "reminder" | "note" | "gift" | "payment" | "multiple",
  "confidence": "high" | "medium" | "low",
  "summary": "one sentence describing what this email is about",
  "destination": "which tab this belongs in",
  "items": [
    {
      "table": "vendors" | "guests" | "reminders" | "notes" | "gifts",
      "data": { ...the extracted fields for that table },
      "description": "short description of what is being added"
    }
  ]
}

For reminders, extract ALL dates mentioned as separate reminder items.
For vendors, extract contact details carefully — phone numbers, email addresses.
If multiple things should be added (e.g. a vendor confirmation with a payment and a reminder), include all of them as separate items in the array.
For guest RSVPs, note meal choices in the notes field.
If the email is ambiguous, set confidence to "low" and still do your best.

EMAIL:
${emailText.slice(0, 4000)}`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', err)
      return res.status(502).json({ error: 'AI analysis failed. Please try again.' })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON response from Claude
    let parsed
    try {
      // Strip any accidental markdown fences
      const clean = text.replace(/```json\n?|```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    } catch (e) {
      console.error('Failed to parse Claude response:', text)
      return res.status(500).json({ error: 'Could not parse AI response. Please try again.' })
    }

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('Serverless function error:', err)
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
}
