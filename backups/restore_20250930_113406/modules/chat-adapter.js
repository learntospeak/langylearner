// Lightweight chat adapter for AI tutor

const C = { endpoint: '/api/chat' };

const Chat = {
  configure(opts = {}) { if (typeof opts.endpoint === 'string') C.endpoint = opts.endpoint; },
  async send({ messages = [], level = 'A1', persona = 'tutor' } = {}) {
    const r = await fetch(C.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, level, persona })
    });
    if (!r.ok) throw new Error(`CHAT HTTP ${r.status}`);
    const data = await r.json();
    return String(data?.reply || '');
  }
};

export default Chat;

