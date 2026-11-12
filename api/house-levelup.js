// api/house-levelup.js
// Cron job (once per day via vercel.json) that increments the house
// "Pop Lion" row's best_score so it stays at the top of the leaderboard.
// This row is flagged is_house=true and is EXCLUDED from prizes by the UI.

const HOUSE_SCORE_INCREMENT = 5;
const HOUSE_TELEGRAM_ID = 1; // any synthetic ID; never used as a real user

export default async function handler(request, response) {
  // Optional: protect with CRON_SECRET, but Vercel cron runs are already
  // authenticated internally. Leaving it open is fine since it only
  // touches a single house row.
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return response.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Fetch the current house row
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${HOUSE_TELEGRAM_ID}&select=best_score`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const rows = await existingResp.json();

    if (Array.isArray(rows) && rows.length === 0) {
      // Create the house row on first run
      const createResp = await fetch(
        `${SUPABASE_URL}/rest/v1/popzen_scores`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            telegram_id: HOUSE_TELEGRAM_ID,
            username: 'PopLion',
            first_name: 'Pop Lion',
            best_score: HOUSE_SCORE_INCREMENT,
            is_house: true
          })
        }
      );
      if (!createResp.ok) {
        const t = await createResp.text();
        console.log('House create failed:', createResp.status, t);
        return response.status(500).json({ error: 'House create failed' });
      }
      return response.status(200).json({ success: true, created: true, score: HOUSE_SCORE_INCREMENT });
    }

    const currentScore = rows[0]?.best_score || 0;
    const newScore = currentScore + HOUSE_SCORE_INCREMENT;

    const updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${HOUSE_TELEGRAM_ID}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          best_score: newScore,
          is_house: true,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResp.ok) {
      const t = await updateResp.text();
      console.log('House update failed:', updateResp.status, t);
      return response.status(500).json({ error: 'House update failed' });
    }

    return response.status(200).json({ success: true, previous: currentScore, current: newScore });
  } catch (error) {
    console.error('House levelup error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
