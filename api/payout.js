// api/payout.js
// POST { userId, wallet } → saves the user's TON wallet address
// GET ?userId=N        → returns { wallet, eligible }
//
// "eligible" = the user is currently in the top 10 HUMANS by best_score.

export default async function handler(request, response) {
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

  if (request.method === 'GET') {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const userId = Number(url.searchParams.get('userId'));
    if (!Number.isFinite(userId) || userId <= 0) {
      return response.status(400).json({ error: 'Invalid userId' });
    }

    // Fetch wallet
    const payResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_payouts?telegram_id=eq.${userId}&select=ton_wallet,claimed_at`,
      { headers: sbHeaders }
    );
    const payRows = await payResp.json();
    const wallet = payRows?.[0]?.ton_wallet || null;
    const claimedAt = payRows?.[0]?.claimed_at || null;

    // Fetch rank (count of humans with higher score + 1)
    const rankResp = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_scores?select=telegram_id,best_score,is_house&order=best_score.desc`,
      { headers: sbHeaders }
    );
    const allRows = await rankResp.json();
    const humans = allRows.filter(r => !r.is_house);
    const myIndex = humans.findIndex(r => r.telegram_id === userId);
    const rank = myIndex >= 0 ? myIndex + 1 : null;
    const eligible = rank !== null && rank <= 10;

    return response.status(200).json({ wallet, claimedAt, rank, eligible });
  }

  if (request.method === 'POST') {
    let userId, wallet;
    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      userId = Number(body?.userId);
      wallet = String(body?.wallet || '').trim();
    } catch {
      return response.status(400).json({ error: 'Invalid JSON' });
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return response.status(400).json({ error: 'Invalid userId' });
    }
    // Loose TON address check: base64url-ish, 48 chars typical, or friendly EQ... form
    if (!/^[A-Za-z0-9_\-+=\/]{20,80}$/.test(wallet)) {
      return response.status(400).json({ error: 'Invalid TON wallet address' });
    }

    // Upsert
    const upsert = await fetch(
      `${SUPABASE_URL}/rest/v1/popzen_payouts?on_conflict=telegram_id`,
      {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ telegram_id: userId, ton_wallet: wallet })
      }
    );
    if (!upsert.ok) {
      const t = await upsert.text();
      return response.status(500).json({ error: 'Save failed', body: t });
    }
    return response.status(200).json({ success: true });
  }

  return response.status(405).json({ error: 'Method not allowed' });
}
