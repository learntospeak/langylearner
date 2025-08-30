// /api/tts.js — OpenAI TTS (Vercel)
// Env: OPENAI_API_KEY
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, lang } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    // Pick a built-in OpenAI voice; change per preference
    const voice = lang === 'ja' ? 'alloy' : 'alloy';

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text
      }),
    });
    if (!r.ok) {
      const details = await r.text().catch(() => '');
      return res.status(502).json({ error: 'OpenAI TTS error', details });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: 'TTS request failed', details: String(e) });
  }
}
