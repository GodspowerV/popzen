// api/leaderboard.js
// Returns the top N players by best_score, including the house row.
// Reads only public, non-sensitive columns.

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 50));

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return response.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores` +
        `?select=telegram_id,username,first_name,best_score,is_house` +
        `&order=best_score.desc,updated_at.asc` +
        `&limit=${limit}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    if (!resp.ok) {
      const t = await resp.text();
      console.log('Leaderboard fetch failed:', resp.status, t);
      return response.status(500).json({ error: 'Leaderboard fetch failed' });
    }

    const rows = await resp.json();
    // Cache for 30 seconds at the edge to reduce load
    response.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    return response.status(200).json({ rows });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
