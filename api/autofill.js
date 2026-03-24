// api/autofill.js — AI auto-fill only (no Notion save)
// Called when user clicks "מלא אוטומטית עם AI"

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, city } = req.body;
  if (!name || !city) return res.status(400).json({ error: 'name and city are required' });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'You are a Taiwan travel expert. Always respond with raw valid JSON only — no markdown, no explanation.'
          },
          {
            role: 'user',
            content: `The user added a new place to their Hebrew Taiwan travel guide: "${name}" in ${city}, Taiwan.

Return ONLY a valid JSON object:
{
  "description": "תיאור קצר בעברית, 1–2 משפטים",
  "tips": "טיפ מעשי בעברית, משפט אחד",
  "caption": "short English caption like: Specialty Coffee · Da'an",
  "category": "one of: מסעדה / קפה ותה / אטרקציה / שוק לילה / אזור / אוכל רחוב / טבע",
  "address": "address in English or empty string",
  "rating": number between 7.5 and 9.8,
  "michelin": true or false,
  "top10": true or false,
  "tags": array of 1–2 items from: ["חדש","must-try","תקציב נמוך","יוקרה","אוכל רחוב","קפה בוטיק","מורשת","מקדש"]
}`
          }
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq error: ${groqRes.status} — ${err}`);
    }

    const data = await groqRes.json();
    const raw  = data.choices[0].message.content.trim()
      .replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

    return res.status(200).json(JSON.parse(raw));

  } catch (err) {
    console.error('autofill error:', err);
    return res.status(500).json({ error: err.message });
  }
}
