// Minimal Express server to host static files and a TTS proxy.
// Requires: Node 18+ (global fetch), express, cors, dotenv (optional)

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

// Load .env if present
try { require('dotenv').config(); } catch {}

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'users.json');

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

// Serve favicon to avoid 404 spam
try {
  const favPath = path.join(__dirname, 'images', 'favicon.ico');
  app.get('/favicon.ico', (req, res) => {
    try { return res.sendFile(favPath); } catch { return res.sendStatus(204); }
  });
} catch {}

// --- Simple file DB helpers (users + progress) ---
async function ensureDb(){
  try { await fsp.mkdir(DB_DIR, { recursive: true }); } catch {}
  try {
    await fsp.access(DB_FILE, fs.constants.F_OK);
  } catch {
    const empty = { users: {} };
    await fsp.writeFile(DB_FILE, JSON.stringify(empty, null, 2));
  }
}
async function readDb(){
  await ensureDb();
  try {
    const buf = await fsp.readFile(DB_FILE); return JSON.parse(buf.toString('utf8'));
  } catch { return { users: {} }; }
}
async function writeDb(db){
  await ensureDb();
  const tmp = DB_FILE + '.tmp';
  const data = JSON.stringify(db, null, 2);
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, DB_FILE);
}

// --- Password hashing (scrypt) ---
function hashPassword(password){
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(password, stored){
  try {
    const [alg, saltHex, keyHex] = String(stored||'').split('$');
    if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const key = Buffer.from(keyHex, 'hex');
    const test = crypto.scryptSync(password, salt, key.length);
    return crypto.timingSafeEqual(test, key);
  } catch { return false; }
}

// --- Token (HMAC) in HttpOnly cookie ---
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signToken(username, ttlSec = 60*60*24*30){
  const payload = { u: String(username), exp: Math.floor(Date.now()/1000)+ttlSec };
  const json = JSON.stringify(payload);
  const b = b64url(json);
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(b).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${b}.${sig}`;
}
function verifyToken(token){
  try {
    if (!token || typeof token !== 'string') return null;
    const idx = token.lastIndexOf('.'); if (idx < 1) return null;
    const b = token.slice(0, idx); const sig = token.slice(idx+1);
    const expSig = crypto.createHmac('sha256', AUTH_SECRET).update(b).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if (sig !== expSig) return null;
    const json = Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    if (!payload || !payload.u) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
    return String(payload.u);
  } catch { return null; }
}
function parseCookies(req){
  const h = req.headers && req.headers.cookie; if (!h) return {};
  return h.split(';').map(s=>s.trim()).reduce((m,p)=>{ const i=p.indexOf('='); if(i>0) m[p.slice(0,i)]=decodeURIComponent(p.slice(i+1)); return m; },{});
}
function setAuthCookie(res, token){
  const cookie = `auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*30}`;
  res.setHeader('Set-Cookie', cookie);
}
function clearAuthCookie(res){ res.setHeader('Set-Cookie', 'auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); }
function requireUser(req, res){
  const { auth } = parseCookies(req);
  const user = verifyToken(auth);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return user;
}

// --- Auth APIs ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'Invalid username' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password too short' });
    if (email && !/^\S+@\S+\.\S+$/.test(String(email))) return res.status(400).json({ error: 'Invalid email' });
    const db = await readDb();
    if (db.users[username]) return res.status(409).json({ error: 'Username taken' });
    db.users[username] = { username, email: email || '', password: hashPassword(password), progress: {}, createdAt: Date.now() };
    await writeDb(db);
    const token = signToken(username);
    setAuthCookie(res, token);
    res.json({ ok: true, user: { username } });
  } catch (e) { res.status(500).json({ error: 'Signup failed', details: String(e) }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
    const db = await readDb();
    const rec = db.users[username];
    if (!rec || !verifyPassword(password, rec.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(username);
    setAuthCookie(res, token);
    res.json({ ok: true, user: { username } });
  } catch (e) { res.status(500).json({ error: 'Login failed', details: String(e) }); }
});

app.post('/api/auth/logout', (req, res) => { try { clearAuthCookie(res); res.json({ ok: true }); } catch { res.json({ ok: true }); } });

app.get('/api/me', async (req, res) => {
  try {
    const { auth } = parseCookies(req); const username = verifyToken(auth);
    if (!username) return res.json({ user: null });
    const db = await readDb();
    const rec = db.users[username] || {};
    res.json({ user: { username, email: rec.email || '' } });
  } catch (e) { res.status(500).json({ error: 'Failed', details: String(e) }); }
});

// ---- Shop + Wallet ----
// Catalog is composed of: static upgrades, static 3D models, and 3D clothing items
// discovered by scanning assets/chibi/items for .glb files.
const ITEMS_DIR = path.join(__dirname, 'assets', 'chibi', 'items');

const STATIC_UPGRADES = [
  { id:'upgrade-tutor-basic', kind:'upgrade', name:'Tutor (Basic)', price: 200 },
  { id:'upgrade-tutor-pro',   kind:'upgrade', name:'Tutor (Pro)',   price: 800 },
  { id:'upgrade-hint-plus',   kind:'upgrade', name:'Extra Hints',   price: 300 },
  { id:'upgrade-coin-boost',  kind:'upgrade', name:'Coin Boost (x2)', price: 500 },
  { id:'upgrade-freeze-plus', kind:'upgrade', name:'Longer Freeze',   price: 350 },
  { id:'upgrade-shield-start',kind:'upgrade', name:'Start with Shield', price: 250 },
];
const STATIC_MODELS = [
  { id:'model-student',       kind:'cosmetic', slot:'model', name:'3D Student',           price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/studentpr.glb' },
  { id:'model-ninja',         kind:'cosmetic', slot:'model', name:'3D Ninja',             price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/ninjapr.glb' },
  { id:'model-knight',        kind:'cosmetic', slot:'model', name:'3D Knight',            price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/knightpr.glb' },
  { id:'model-archer',        kind:'cosmetic', slot:'model', name:'3D Archer',            price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/archerpr.glb' },
  { id:'model-merchant',      kind:'cosmetic', slot:'model', name:'3D Merchant',          price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/merchantpr.glb' },
  { id:'model-basemesh',      kind:'cosmetic', slot:'model', name:'3D Basemesh',          price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/basemeshpr.glb' },
  { id:'model-allinone',      kind:'cosmetic', slot:'model', name:'3D All-in-one',        price: 0,   model:'assets/chibi/characters/ChibiCharacters/glb/allinonepr.glb' },
];

async function listGlbFilesRecursive(dir){
  const out = [];
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await listGlbFilesRecursive(p)));
      else if (e.isFile() && p.toLowerCase().endsWith('.glb')) out.push(p);
    }
  } catch {}
  return out;
}
function slotFromFilename(base){
  const b = base.toLowerCase();
  if (/helmet|hat/.test(b)) return 'hat';
  if (/mask/.test(b)) return 'mask';
  if (/hair/.test(b)) return 'hair';
  if (/shoe|boot|bottes/.test(b)) return 'boots';
  if (/pants|leg|thigh|knee/.test(b)) return 'legs';
  if (/shirt|chemise|plastron|torso|chest|top/.test(b)) return 'top';
  if (/skirt/.test(b)) return 'skirt';
  if (/belt|ceinture/.test(b)) return 'belt';
  if (/bag/.test(b)) return 'bag';
  if (/outfit|suit|armor/.test(b)) return 'outfit';
  return 'misc';
}
function labelize(base){
  const s = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
async function loadClothingItems(){
  const files = await listGlbFilesRecursive(ITEMS_DIR);
  const items = [];
  const seen = new Set();
  for (const p of files) {
    const nameBaseRaw = path.basename(p, path.extname(p));
    // Canonicalize to collapse duplicates like foo, foo_001, foo-1, foo (1)
    const canon = nameBaseRaw
      .toLowerCase()
      .replace(/[\s()]+/g, '-')
      .replace(/[-_]*(copy|final|v\d+)$/,'')
      .replace(/[-_]*\d+$/,'')
      .replace(/[^a-z0-9-]+/g,'-')
      .replace(/-+/g,'-')
      .replace(/^-|-$/g,'');
    if (seen.has(canon)) continue;
    seen.add(canon);
    const slot = slotFromFilename(nameBaseRaw);
    const id = `cos-${canon}`;
    const name = labelize(nameBaseRaw);
    const rel = path.relative(__dirname, p).replace(/\\/g,'/');
    items.push({ id, kind:'cosmetic', slot, name, price: 0, model: rel });
  }
  return items;
}
async function getCatalog(){
  const clothing = await loadClothingItems();
  return [...STATIC_UPGRADES, ...STATIC_MODELS, ...clothing];
}
async function findItem(id){
  const all = await getCatalog();
  return all.find(i => i.id === id) || null;
}
  function getWallet(rec){
  if (!rec.wallet) rec.wallet = { coins: 0, owned: {}, equipped: {} };
  if (!rec.wallet.owned) rec.wallet.owned = {};
  if (!rec.wallet.equipped) rec.wallet.equipped = {};
  return rec.wallet;
}
  

  app.get('/api/shop/catalog', async (req, res) => {
    try { const items = await getCatalog(); res.json({ items }); }
    catch (e) { res.status(500).json({ error: 'Catalog load failed', details: String(e) }); }
  });

  app.get('/api/wallet', async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    try {
      const db = await readDb();
      const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
      const wallet = getWallet(rec);
      const catalog = await getCatalog();
      const validIds = new Set(catalog.map(i => i.id));
      // Build a response view without writing to disk (avoids file locking issues)
      const owned = Object.fromEntries(Object.entries(wallet.owned||{}).filter(([id])=>validIds.has(id)));
      const equipped = Object.fromEntries(Object.entries(wallet.equipped||{}).filter(([slot,id])=>validIds.has(id)));
      owned['model-student'] = true;
      if (!equipped.model) equipped.model = 'model-student';
      let coins = wallet.coins|0;
      if (String(user).toLowerCase() === 'test') coins = Math.max(coins, 2000000);
      res.json({ coins, owned, equipped });
    } catch (e) { res.status(500).json({ error: 'Failed', details: String(e) }); }
  });

// Sync coin bank up to server (takes the max of current and provided to avoid accidental loss)
app.post('/api/wallet/sync', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const { coins } = req.body || {};
    if (!Number.isFinite(Number(coins))) return res.status(400).json({ error: 'Invalid amount' });
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    const wallet = getWallet(rec);
    wallet.coins = Math.max(0, Math.max(wallet.coins|0, Math.floor(Number(coins))));
    await writeDb(db);
    res.json({ ok: true, coins: wallet.coins|0 });
  } catch (e) { res.status(500).json({ error: 'Sync failed', details: String(e) }); }
});

  app.post('/api/shop/purchase', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
      const { itemId } = req.body || {};
      const item = await findItem(String(itemId||''));
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    const wallet = getWallet(rec);
    if (wallet.owned[item.id]) return res.status(409).json({ error: 'Already owned' });
    const price = Math.max(0, item.price|0);
    if ((wallet.coins|0) < price) return res.status(400).json({ error: 'Not enough coins' });
    wallet.coins = (wallet.coins|0) - price;
    wallet.owned[item.id] = true;
    await writeDb(db);
    res.json({ ok: true, coins: wallet.coins|0, owned: wallet.owned });
  } catch (e) { res.status(500).json({ error: 'Purchase failed', details: String(e) }); }
});

  app.post('/api/shop/equip', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
      const { itemId } = req.body || {};
      const item = await findItem(String(itemId||''));
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.kind !== 'cosmetic') return res.status(400).json({ error: 'Not equippable' });
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    const wallet = getWallet(rec);
    if (!wallet.owned[item.id]) return res.status(400).json({ error: 'Item not owned' });
    wallet.equipped[item.slot] = item.id;
    await writeDb(db);
    res.json({ ok: true, equipped: wallet.equipped });
  } catch (e) { res.status(500).json({ error: 'Equip failed', details: String(e) }); }
});

  app.post('/api/shop/unequip', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const { itemId, slot } = req.body || {};
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    const wallet = getWallet(rec);
    let targetSlot = String(slot||'');
      if (!targetSlot && itemId) {
        const it = await findItem(String(itemId));
      if (it && it.kind === 'cosmetic') targetSlot = it.slot;
    }
    if (!targetSlot) return res.status(400).json({ error: 'Missing slot or itemId' });
    if (wallet.equipped && wallet.equipped[targetSlot]) delete wallet.equipped[targetSlot];
    await writeDb(db);
    res.json({ ok: true, equipped: wallet.equipped });
  } catch (e) { res.status(500).json({ error: 'Unequip failed', details: String(e) }); }
});

// Password reset (dev-friendly token flow)
app.post('/api/auth/request-reset', async (req, res) => {
  try {
    const { username, email } = req.body || {};
    if (!username && !email) return res.status(400).json({ error: 'Provide username or email' });
    const db = await readDb();
    let entry = null;
    if (username && db.users[username]) entry = db.users[username];
    else if (email) entry = Object.values(db.users).find(u => (u.email||'').toLowerCase() === String(email).toLowerCase()) || null;
    if (!entry) return res.status(404).json({ error: 'Account not found' });
    const token = crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    entry.reset = { tokenHash, exp: Date.now() + 1000*60*30 }; // 30 min
    await writeDb(db);
    // In production, email this token. For dev, return it directly.
    res.json({ ok: true, token });
  } catch (e) { res.status(500).json({ error: 'Reset request failed', details: String(e) }); }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { username, token, newPassword } = req.body || {};
    if (!username || !token || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (String(newPassword).length < 6) return res.status(400).json({ error: 'Password too short' });
    const db = await readDb();
    const rec = db.users[username];
    if (!rec || !rec.reset) return res.status(400).json({ error: 'Invalid reset request' });
    if (rec.reset.exp && rec.reset.exp < Date.now()) return res.status(400).json({ error: 'Reset token expired' });
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    if (tokenHash !== rec.reset.tokenHash) return res.status(400).json({ error: 'Invalid reset token' });
    rec.password = hashPassword(newPassword);
    delete rec.reset;
    await writeDb(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Reset failed', details: String(e) }); }
});

// --- Progress APIs ---
app.post('/api/progress/save', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const { lessonId, data } = req.body || {};
    if (!lessonId || typeof data !== 'object') return res.status(400).json({ error: 'Missing lessonId or data' });
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    rec.progress = rec.progress || {};
    const prev = rec.progress[lessonId] || {};
    // Shallow-merge root; deep-merge stats/time/checks when present
    const next = Object.assign({}, prev, data, { updatedAt: Date.now() });
    if (data && data.stats) {
      next.stats = Object.assign({}, prev.stats || {}, data.stats);
      // Deep merge nested maps
      if (prev.stats && prev.stats.timeMsByStep && data.stats.timeMsByStep) {
        next.stats.timeMsByStep = Object.assign({}, prev.stats.timeMsByStep, data.stats.timeMsByStep);
      }
      if (prev.stats && prev.stats.checks && data.stats.checks) {
        const merged = Object.assign({}, prev.stats.checks);
        for (const k of Object.keys(data.stats.checks)) merged[k] = data.stats.checks[k];
        next.stats.checks = merged;
      }
      if (typeof data.stats.totalTimeMs === 'number' && typeof (prev.stats||{}).totalTimeMs === 'number') {
        // Prefer transmitted value
        next.stats.totalTimeMs = data.stats.totalTimeMs;
      }
    }
    rec.progress[lessonId] = next;
    await writeDb(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Save failed', details: String(e) }); }
});

app.get('/api/progress', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ progress: rec.progress || {} });
  } catch (e) { res.status(500).json({ error: 'Failed', details: String(e) }); }
});

app.get('/api/progress/:lessonId', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const db = await readDb();
    const rec = db.users[user]; if (!rec) return res.status(401).json({ error: 'Unauthorized' });
    const data = (rec.progress || {})[String(req.params.lessonId)] || null;
    res.json({ data });
  } catch (e) { res.status(500).json({ error: 'Failed', details: String(e) }); }
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

