// api/score.js
// Called from the Mini App whenever the player's best score increases.
// Upserts popzen_scores with the new best_score (only if higher).

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  let userId, username, firstName, score;
  try {
    const body = typeof request.body === 'string'
      ? JSON.parse(request.body)
      : request.body;
    userId = body?.userId;
    username = body?.username || null;
    firstName = body?.firstName || null;
    score = body?.score;
  } catch (e) {
    return response.status(400).json({ error: 'Invalid JSON body' });
  }

  const numericId = Number(userId);
  const numericScore = Number(score);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return response.status(400).json({ error: 'Invalid userId' });
  }
  if (!Number.isFinite(numericScore) || numericScore < 0) {
    return response.status(400).json({ error: 'Invalid score' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return response.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Step 1: check current best_score
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${numericId}&select=best_score`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const existingRows = await existingResp.json();
    const currentBest = existingRows?.[0]?.best_score ?? 0;

    // Step 2: update only if this score is higher
    if (numericScore > currentBest) {
      const updateResp = await fetch(
        `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${numericId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            best_score: numericScore,
            username,
            first_name: firstName,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!updateResp.ok) {
        const t = await updateResp.text();
        console.log('Score update failed:', updateResp.status, t);
        return response.status(500).json({
          error: 'Score update failed',
          status: updateResp.status,
          body: t
        });
      }
    }

    return response.status(200).json({ success: true, best: Math.max(currentBest, numericScore) });
  } catch (error) {
    console.error('Score error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
