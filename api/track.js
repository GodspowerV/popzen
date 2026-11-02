// api/track.js
export default async function handler(request, response) {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = request.body;

  // Basic validation
  if (!userId || isNaN(userId)) {
    return response.status(400).json({ error: 'Invalid user ID' });
  }

  // Your Supabase credentials (set these in Vercel's dashboard)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/popzen_users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates' // Prevents errors if the user is already logged
      },
      body: JSON.stringify({ telegram_id: userId })
    });

    if (!supabaseResponse.ok) {
      throw new Error('Supabase insert failed');
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error('Tracking error:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
