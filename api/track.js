// api/track.js
// Records every unique Telegram user that opens the Mini App.
// Uses the service_role key (server-side only) to bypass the PostgREST
// anon-INSERT bug that we hit during initial setup.

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  let userId, username, firstName;
  try {
    const body = typeof request.body === 'string'
      ? JSON.parse(request.body)
      : request.body;
    userId = body?.userId;
    username = body?.username || null;
    firstName = body?.firstName || null;
  } catch (e) {
    return response.status(400).json({ error: 'Invalid JSON body' });
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return response.status(400).json({ error: 'Invalid userId' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return response.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Upsert user into popzen_users; on conflict update username/first_name
    const userResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_users?on_conflict=telegram_id`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          telegram_id: numericId,
          username,
          first_name: firstName
        })
      }
    );

    if (!userResp.ok) {
      const bodyText = await userResp.text();
      console.log('Supabase user upsert failed:', userResp.status, bodyText);
      return response.status(500).json({
        error: 'User upsert failed',
        status: userResp.status,
        body: bodyText
      });
    }

    // Ensure a score row exists (does nothing if already present)
    const scoreResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?on_conflict=telegram_id`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify({
          telegram_id: numericId,
          username,
          first_name: firstName,
          best_score: 0
        })
      }
    );

    // Score row failure is non-fatal (user already tracked)
    if (!scoreResp.ok) {
      const t = await scoreResp.text();
      console.log('Score row init failed (non-fatal):', scoreResp.status, t);
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error('Tracking error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
