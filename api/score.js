// api/score.js
// Called from the Mini App whenever the player's best score increases.
// Upserts popzen_scores with the new best_score (only if higher).
//
// Anti-cheat measures (best-effort, not bulletproof):
//   1. Monotonic check — score can only go up, never down.
//   2. Max delta per sync — prevents instant 0 → 999999 jumps.
//   3. Per-user rate limit — one sync per 2 seconds.
//   4. House row protection — cannot be overwritten by a real user.
//
// Note: globalThis state does NOT persist across Vercel cold starts,
// so the rate limiter is best-effort. For real anti-cheat, use the
// server-side session scoring described in the deployment notes.

const MAX_DELTA_PER_SYNC = 200;   // max score increase accepted in one POST
const MIN_SYNC_INTERVAL_MS = 2000; // per-user rate limit

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
  // Sanity upper bound — no human will realistically hit this
  if (numericScore > 100000) {
    return response.status(400).json({ error: 'Score out of range' });
  }

  // House ID protection — reject if someone tries to write as the house bot
  const HOUSE_TELEGRAM_ID = 1;
  if (numericId === HOUSE_TELEGRAM_ID) {
    return response.status(403).json({ error: 'Reserved ID' });
  }

  // Per-user rate limit (best-effort)
  const rateKey = `score_rl_${numericId}`;
  const now = Date.now();
  const lastSeen = globalThis[rateKey] || 0;
  if (now - lastSeen < MIN_SYNC_INTERVAL_MS) {
    return response.status(429).json({ error: 'Too fast', retryIn: MIN_SYNC_INTERVAL_MS });
  }
  globalThis[rateKey] = now;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return response.status(500).json({ error: 'Server misconfigured' });
  }

  const sbHeaders = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Step 1: fetch current row
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${numericId}&select=best_score,is_house`,
      { headers: sbHeaders }
    );
    if (!existingResp.ok) {
      const t = await existingResp.text();
      console.log('Score lookup failed:', existingResp.status, t);
      return response.status(500).json({ error: 'Score lookup failed' });
    }
    const existingRows = await existingResp.json();
    const row = existingRows?.[0];
    const currentBest = row?.best_score ?? 0;
    const isHouse = row?.is_house === true;

    if (isHouse) {
      // Never let a user overwrite the house row
      return response.status(403).json({ error: 'Reserved row' });
    }

    // Step 2: reject implausible jumps
    if (numericScore > currentBest + MAX_DELTA_PER_SYNC) {
      console.log('Implausible jump blocked:', { numericId, currentBest, numericScore });
      return response.status(400).json({
        error: 'Implausible score jump',
        current: currentBest,
        submitted: numericScore,
        max_delta: MAX_DELTA_PER_SYNC
      });
    }

    // Step 3: update only if higher (monotonic)
    if (numericScore > currentBest) {
      const updateResp = await fetch(
        `${SUPABASE_URL}/rest/v1/popzen_scores?telegram_id=eq.${numericId}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
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

    return response.status(200).json({
      success: true,
      best: Math.max(currentBest, numericScore)
    });
  } catch (error) {
    console.error('Score error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
