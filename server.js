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

// Static files (serve the project root)
app.use(express.static(path.join(__dirname), { redirect: false }));

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

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  (OPENAI_API_KEY ${OPENAI_API_KEY ? 'present' : 'missing'})`);
});
