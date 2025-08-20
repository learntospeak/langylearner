// ===== Memory Match (standalone block) =====
(() => {
  const $ = id => document.getElementById(id);

  // Required elements
  const playBtn     = $('playMemoryBtn');
  const closeBtn    = $('closeMemoryBtn');
  const gameSection = $('memory-game-section');
  const gameRoot    = $('memory-game-root');
  const hintBtn     = $('hintBtn');
  const hintText    = $('hintText');

  // State
  let cards = [];
  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let matches = 0;

  // Helpers
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function speakKana(char) {
    try {
      const u = new SpeechSynthesisUtterance(char);
      u.lang = 'ja-JP';
      speechSynthesis.speak(u);
    } catch {}
  }

  function resetTurn() {
    [firstCard, secondCard] = [null, null];
    lockBoard = false;
  }

  function checkForMatch() {
    const isMatch = firstCard.dataset.content === secondCard.dataset.content;
    if (isMatch) {
      [firstCard, secondCard].forEach(c => {
        c.classList.add('matched', 'opacity-50', 'cursor-default');
      });
      matches++;
      resetTurn();
    } else {
      lockBoard = true;
      setTimeout(() => {
        firstCard.textContent = '';
        secondCard.textContent = '';
        resetTurn();
      }, 1000);
    }
  }

  function onCardClick(evt) {
    if (lockBoard) return;
    const el = evt.currentTarget;
    if (el === firstCard || el.classList.contains('matched')) return;

    // flip & speak
    el.textContent = el.dataset.content;
    speakKana(el.dataset.content);

    if (!firstCard) {
      firstCard = el;
    } else {
      secondCard = el;
      checkForMatch();
    }
  }

  function startMemoryMatch() {
    // Hide lesson UI
    $('story-box').classList.add('hidden');
    $('button-controls').classList.add('hidden');

    // Build doubled deck from current line JP
    let sentence = (storyData?.lines?.[currentLine]?.jp) ?? '';
    if (Array.isArray(sentence)) sentence = sentence.join('');
    const kanaArr = Array.from(sentence);
    const pairObjs = kanaArr.map((c, i) => ({ id: i, content: c }));
    cards = shuffle([...pairObjs, ...pairObjs]);

    // Reset state & UI
    firstCard = secondCard = null;
    lockBoard = false;
    matches = 0;
    hintText.textContent = '';
    gameRoot.innerHTML = '';

    // Layout
    gameRoot.style.display = 'flex';
    gameRoot.style.flexWrap = 'wrap';
    gameRoot.style.justifyContent = 'center';
    gameRoot.style.gap = '1rem';

    // Render cards
    cards.forEach((card, idx) => {
      const el = document.createElement('div');
      Object.assign(el.style, {
        width: '3.5rem',
        height: '3.5rem',
        background: '#bfdbfe',
        border: '2px solid #60a5fa',
        borderRadius: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        cursor: 'pointer',
        userSelect: 'none',
        boxSizing: 'border-box',
        margin: '0.5rem',
      });
      el.dataset.content = card.content;
      el.dataset.index = idx;
      el.textContent = ''; // face-down
      el.addEventListener('click', onCardClick);
      gameRoot.appendChild(el);
    });

    // Show game panel
    gameSection.classList.remove('hidden');
  }

  // Hook up buttons
  if (playBtn) {
    playBtn.onclick = startMemoryMatch;
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      gameSection.classList.add('hidden');
      $('story-box').classList.remove('hidden');
      $('button-controls').classList.remove('hidden');
    };
  }

  if (hintBtn) {
    hintBtn.onclick = () => {
      const unmatched = Array.from(gameRoot.children)
        .filter(c => !c.classList.contains('matched'))
        .map(c => c.dataset.content);
      if (!unmatched.length) return;
      const pick = unmatched[Math.floor(Math.random() * unmatched.length)];
      hintText.textContent = pick;
      speakKana(pick);
    };
  }
})();
