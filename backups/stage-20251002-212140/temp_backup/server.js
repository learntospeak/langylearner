// Minimal Express server to host static files and a TTS proxy.
// Requires: Node 18+ (global fetch), express, cors, dotenv (optional)

const path = require('path');
const express = require('express');
const cors = require('cors');

// Load .env if present
try { require('dotenv').config(); } catch {}

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

app.use(express.json({ limit: '1mb' }));

// CORS: allow cross-origin from any dev origin (127.0.0.1:5500, localhost:3000, etc.)
const corsOptions = {
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Generic preflight responder to avoid path-to-regexp pitfalls in Express 5
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// POST /api/chat -> minimal chat bridge to OpenAI
app.post('/api/chat', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    const { messages = [], level = 'A1', persona = 'tutor' } = req.body || {};
    const sys = `You are a friendly Japanese ${persona}. Keep replies short (1-2 sentences). Speak mostly in Japanese at CEFR ${level}. If the user is stuck, briefly explain in simple English then continue in Japanese. Avoid romaji unless asked. Use polite Japanese unless the user asks for casual.`;
    const body = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, ...messages].slice(-24),
      temperature: 0.6,
    };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const details = await r.text().catch(() => '');
      return res.status(502).json({ error: 'OpenAI chat error', details });
    }
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    return res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'Chat request failed', details: String(e) });
  }
});

// POST /api/tts -> proxies to OpenAI TTS and returns audio/mpeg
app.post('/api/tts', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    const { text, lang } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const voice = (lang === 'ja') ? 'alloy' : 'alloy';

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
      }),
    });

    if (!r.ok) {
      const details = await r.text().catch(() => '');
      return res.status(502).json({ error: 'OpenAI TTS error', details });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'TTS request failed', details: String(e) });
  }
});

// After APIs: serve static files (prevents any chance of POST being eaten by static)
app.use(express.static(path.join(__dirname), { redirect: false }));

// Simple health check
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  (OPENAI_API_KEY ${OPENAI_API_KEY ? 'present' : 'missing'})`);
});
