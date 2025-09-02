// Lightweight browser TTS adapter
// Uses your backend endpoint when available, with Web Speech API fallback.

const cfg = {
  endpoint: '/api/tts',
  allowFallback: true,
};
let endpointEnabled = true; // disable after first failure to reduce console noise

// Simple in-memory cache of ObjectURLs for fetched audio
const cache = new Map(); // key: `${lang}|${text}` -> { url, blob }

function pickVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const want = (lang || 'ja').toLowerCase();
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => (v.lang || '').toLowerCase().startsWith(want)) ||
    voices.find(v => new RegExp(`\b${want.slice(0,2)}\b`, 'i').test(v.name || '')) ||
    voices[0] || null
  );
}

async function speakViaWebSpeech({ text, lang = 'ja', rate = 1, pitch = 1, volume = 1 }) {
  if (!('speechSynthesis' in window)) return false;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || (lang === 'ja' ? 'ja-JP' : 'en-US');
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    u.onstart = () => { try { document.dispatchEvent(new CustomEvent('tts:start')); } catch {} };
    u.onend = () => { try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} };
    u.onerror = () => { try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} };
    u.onend = () => { try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} ; resolve(true); };
    try { speechSynthesis.cancel(); } catch {}
    speechSynthesis.speak(u);
  });
}

async function fetchAudio(text, lang) {
  const key = `${lang}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) {
    endpointEnabled = false;
    throw new Error(`TTS HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const entry = { url, blob };
  cache.set(key, entry);
  return entry;
}

let currentAudio = null;
async function speakViaEndpoint({ text, lang = 'ja', rate = 1 }) {
  const { url } = await fetchAudio(text, lang);
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    currentAudio = audio;
    audio.src = url;
    try { audio.playbackRate = Number(rate) || 1; } catch {}
    audio.onplay = () => { try { document.dispatchEvent(new CustomEvent('tts:start')); } catch {} };
    audio.onended = () => { if (currentAudio === audio) currentAudio = null; try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} ; resolve(true); };
    audio.onerror = () => { if (currentAudio === audio) currentAudio = null; try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} ; reject(new Error('Audio playback failed')); };
    audio.play().catch(err => { if (currentAudio === audio) currentAudio = null; try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {} ; reject(err); });
  });
}

const TTS = {
  configure(opts = {}) {
    if ('endpoint' in opts) {
      cfg.endpoint = (typeof opts.endpoint === 'string' && opts.endpoint.trim()) ? opts.endpoint : null;
      endpointEnabled = !!cfg.endpoint;
    }
    if (typeof opts.allowFallback === 'boolean') cfg.allowFallback = opts.allowFallback;
  },
  async preload(texts = [], { lang = 'ja' } = {}) {
    const list = Array.from(new Set(texts.filter(Boolean)));
    await Promise.all(list.map(t => fetchAudio(t, lang).catch(() => null)));
  },
  async speak({ text, lang = 'ja', rate = 1, pitch = 1, volume = 1 } = {}) {
    if (!text) return false;
    try {
      // Prevent overlapping playback by canceling any current speech/audio
      try { TTS.cancel(); } catch {}
      if (cfg.endpoint && endpointEnabled) {
        // Endpoint path
        await speakViaEndpoint({ text, lang, rate });
        return true;
      }
      throw new Error('Endpoint disabled');
    } catch (e) {
      endpointEnabled = false;
      if (!cfg.allowFallback) throw e;
      // Fallback path
      return speakViaWebSpeech({ text, lang, rate, pitch, volume });
    }
  },
  async speakList(texts = [], { lang = 'ja', rate = 1 } = {}) {
    try { document.dispatchEvent(new CustomEvent('tts:seqstart')); } catch {}
    for (const t of texts) {
      if (!t) continue;
      await TTS.speak({ text: t, lang, rate }).catch(() => {});
    }
    try { document.dispatchEvent(new CustomEvent('tts:seqend')); } catch {}
    return true;
  },
  cancel() {
    try { if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; } } catch {}
    currentAudio = null;
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
    try { document.dispatchEvent(new CustomEvent('tts:end')); } catch {}
  }
};

export default TTS;
