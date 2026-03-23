// api/add-place.js — Vercel Serverless Function
// Receives: { name, city } from the frontend form
// 1. Calls Groq API (free) to auto-generate place details in Hebrew
// 2. Saves the place to Notion database
// 3. Returns the generated data to the frontend

export default async function handler(req, res) {
  // CORS — allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, city } = req.body;
  if (!name || !city) return res.status(400).json({ error: 'name and city are required' });

  try {
    // ─── 1. Call Groq (free LLM) to generate place details ──────────────
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
  "description": "תיאור קצר בעברית, 1–2 משפטים על המקום",
  "tips": "טיפ מעשי בעברית, משפט אחד (מתי להגיע, מה להזמין, וכו')",
  "caption": "short English caption like: Specialty Coffee · Da'an",
  "category": "one of exactly: מסעדה / קפה ותה / אטרקציה / שוק לילה / אזור / אוכל רחוב / טבע",
  "address": "address in English based on your knowledge, or empty string",
  "rating": a number between 7.5 and 9.8,
  "michelin": true or false,
  "top10": true or false,
  "tags": array of 1–2 items only from: ["חדש","must-try","תקציב נמוך","יוקרה","אוכל רחוב","קפה בוטיק","מורשת","מקדש"]
}`
          }
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq API error: ${groqRes.status} — ${err}`);
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices[0].message.content.trim();

    // Strip markdown code fences if Claude adds them
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const place = JSON.parse(jsonText);

    // ─── 2. Save to Notion database ──────────────────────────────────────
    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        icon: { type: 'emoji', emoji: '📍' },
        properties: {
          'שם':       { title: [{ text: { content: name } }] },
          'עיר':      { select: { name: city } },
          'קטגוריה': { select: { name: place.category } },
          'תיאור':    { rich_text: [{ text: { content: place.description || '' } }] },
          'כתובת':    { rich_text: [{ text: { content: place.address || '' } }] },
          'טיפים':    { rich_text: [{ text: { content: place.tips || '' } }] },
          'מישלן':    { checkbox: !!place.michelin },
          'TOP 10':   { checkbox: !!place.top10 },
          'דירוג':    { number: place.rating || 8 },
          'תגיות':    { multi_select: (place.tags || []).map(t => ({ name: t })) },
        },
      }),
    });

    if (!notionRes.ok) {
      // Don't fail the whole request if Notion save fails — still return data
      console.error('Notion save failed:', await notionRes.text());
    }

    // ─── 3. Return generated data to frontend ────────────────────────────
    return res.status(200).json({ ...place, name, city });

  } catch (err) {
    console.error('add-place error:', err);
    return res.status(500).json({ error: err.message });
  }
}
