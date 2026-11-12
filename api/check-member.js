// api/check-member.js
// Verifies whether a Telegram user is a member of the configured channel.
// Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in Vercel env vars.
// The bot must be an admin in the channel.

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  let userId;
  try {
    const body = typeof request.body === 'string'
      ? JSON.parse(request.body)
      : request.body;
    userId = body?.userId;
  } catch (e) {
    return response.status(400).json({ error: 'Invalid JSON body' });
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return response.status(400).json({ error: 'Invalid userId' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return response.status(500).json({ error: 'Server misconfigured', isMember: false });
  }

  try {
    const tgResp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember` +
        `?chat_id=${encodeURIComponent(CHANNEL_ID)}` +
        `&user_id=${numericId}`
    );
    const data = await tgResp.json();

    if (!data.ok) {
      console.log('getChatMember failed:', data.description || data);
      return response.status(200).json({ isMember: false, error: data.description });
    }

    const status = data.result?.status;
    const isMember = status === 'member'
      || status === 'administrator'
      || status === 'creator';

    return response.status(200).json({ isMember, status });
  } catch (error) {
    console.error('check-member error:', error);
    return response.status(500).json({ error: 'Internal server error', isMember: false });
  }
}
