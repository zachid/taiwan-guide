// api/places.js — reads all places from Notion and returns them as JSON
// Called on page load so the site always reflects the Notion database

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60'); // cache 60 seconds

  try {
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 100,
          sorts: [{ property: 'דירוג', direction: 'descending' }],
        }),
      }
    );

    if (!notionRes.ok) {
      throw new Error(`Notion error: ${notionRes.status}`);
    }

    const data = await notionRes.json();

    // Map Notion properties to simple objects
    const places = data.results.map(page => {
      const p = page.properties;
      return {
        id:       page.id,
        name:     p['שם']?.title?.[0]?.plain_text || '',
        city:     p['עיר']?.select?.name || '',
        category: p['קטגוריה']?.select?.name || '',
        desc:     p['תיאור']?.rich_text?.[0]?.plain_text || '',
        tips:     p['טיפים']?.rich_text?.[0]?.plain_text || '',
        address:  p['כתובת']?.rich_text?.[0]?.plain_text || '',
        michelin: p['מישלן']?.checkbox || false,
        top10:    p['TOP 10']?.checkbox || false,
        rating:   p['דירוג']?.number || 8,
        tags:     p['תגיות']?.multi_select?.map(t => t.name) || [],
      };
    }).filter(p => p.name); // skip empty entries

    return res.status(200).json(places);

  } catch (err) {
    console.error('places API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
