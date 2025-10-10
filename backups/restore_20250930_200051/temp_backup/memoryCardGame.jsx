// MemoryCardGame.jsx
const { useState, useEffect } = React;

// 1. shuffle helper
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 2. Card face
function Card({ card, isFlipped, onClick, isMatched }) {
  // play sound on flip
  useEffect(() => {
    if (isFlipped && !isMatched) {
      const utterance = new SpeechSynthesisUtterance(card.content);
      utterance.lang = 'ja-JP';
      speechSynthesis.speak(utterance);
    }
  }, [isFlipped, isMatched, card.content]);

  return (
    <div
      className={"w-24 h-24 m-2 perspective " + (isMatched ? "opacity-50 cursor-default" : "cursor-pointer")}
      onClick={() => !isFlipped && !isMatched && onClick(card)}
    >
      <div className={"relative w-full h-full duration-300 transform-style-preserve-3d " + (isFlipped ? "rotate-y-180" : "")}>
        <div className="absolute inset-0 bg-slate-200 rounded-lg backface-hidden" />
        <div className="absolute inset-0 bg-white rounded-lg flex items-center justify-center text-2xl font-bold rotate-y-180 backface-hidden">
          {card.content}
        </div>
      </div>
    </div>
  );
}

// 3. Memory game
function MemoryCardGame({ pairs }) {
  const [cards, setCards] = useState([]);
  const [first, setFirst] = useState(null);
  const [second, setSecond] = useState(null);
  const [matched, setMatched] = useState([]);
  const [disabled, setDisabled] = useState(false);
  const [hint, setHint] = useState('');

  // ── BUILD & SHUFFLE A DOUBLED DECK ──
  useEffect(() => {
    const doubled = pairs.concat(pairs);               // two of each
    const deck = shuffleArray(
      doubled.map((c, i) => ({ ...c, uuid: `${c.id}-${i}` }))
    );
    setCards(deck);
    setMatched([]);
    setFirst(null);
    setSecond(null);
    setHint('');
  }, [pairs]);

  // ── MATCH LOGIC ──
  useEffect(() => {
    if (first && second) {
      setDisabled(true);
      if (first.content === second.content) {
        setMatched(m => m.concat(first.uuid, second.uuid));
        reset();
      } else {
        setTimeout(reset, 1000);
      }
    }
  }, [first, second]);

  function handleClick(card) {
    if (!disabled) first ? setSecond(card) : setFirst(card);
  }
  function reset() {
    setFirst(null);
    setSecond(null);
    setDisabled(false);
  }

  // ── HINT ──
  function showHint() {
    const remaining = cards.filter(c => !matched.includes(c.uuid));
    if (!remaining.length) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    setHint(pick.content);
    const u = new SpeechSynthesisUtterance(pick.content);
    u.lang = 'ja-JP';
    speechSynthesis.speak(u);
    setTimeout(() => setHint(''), 2500);
  }

  return (
    <div className="p-4">
      <div className="flex items-center mb-4">
        <button
          onClick={showHint}
          disabled={disabled}
          className="px-4 py-2 bg-yellow-400 rounded mr-4"
        >
          💡 Hint
        </button>
        {hint && <span className="text-lg">Hint: <strong>{hint}</strong></span>}
      </div>
      <div className="flex flex-wrap justify-center p-4">
        {cards.map(c => (
          <Card
            key={c.uuid}
            card={c}
            isFlipped={
              c.uuid === first?.uuid ||
              c.uuid === second?.uuid ||
              matched.includes(c.uuid)
            }
            isMatched={matched.includes(c.uuid)}
            onClick={handleClick}
          />
        ))}
      </div>
    </div>
  );
}

// expose globally
window.MemoryCardGame = MemoryCardGame;
