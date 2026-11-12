// api/webhook.js
export default async function handler(request, response) {
  // 1. Verify the request is actually from Telegram (optional but recommended)
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secretToken && request.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
    return response.status(403).json({ error: 'Unauthorized' });
  }

  const update = request.body;

  // 2. Check if it's a message and a /start command
  if (update.message && update.message.text === '/start') {
    const chatId = update.message.chat.id;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const welcomeText = `👋 Welcome to PopZen!

Pop bubbles to score. Some bubbles are traps — tap one and your run ends.

👁️ Trap vision is the only way to see traps. Watch a short ad to reveal them for 10 seconds.

🏆 Top 10 players win real prizes every month. Prizes are paid in TON on the 20th.

📢 You must be a member of our channel @popzen_community to play.

Tap below to start 👇`;

    // 3. Send the message with a Web App button
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: welcomeText,
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🫧 Play PopZen',
              web_app: { url: 'https://t.me/PopZenPlayBot/play' }
            }
          ]]
        }
      })
    });
  }

  // Always respond 200 quickly so Telegram doesn't retry
  return response.status(200).json({ ok: true });
}
