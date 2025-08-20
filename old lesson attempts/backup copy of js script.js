const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');


const soundCorrect = new Audio("data:audio/mpeg;base64,//…base64…");
const soundWrong = new Audio("data:audio/mpeg;base64,//…base64…");



let allStories = {}, customStories = JSON.parse(localStorage.getItem('customStories') || '{}');
let storyData = [], currentLine = 0, inResults = false;
let quizQuestions = [], quizIndex = 0, quizCorrect = 0;
let voicesList = [], progress = JSON.parse(localStorage.getItem('kanaProgress') || '{}');
let originalStoryBeforeEdit = null;
let editingExistingStory = false;
// ── Ninja-Slice globals ──

let targetArr = [];
let slicedCount = 0;
window.canvas = document.getElementById('slice-canvas');  // make global for helpers



// ── at top of your script, alongside your other lets:
let totalToSlice = 0;    // how many chars we need to hit
let memoryGameRoot = null;



function populateVoiceList() {
  voicesList = speechSynthesis.getVoices().filter(v => v.lang.startsWith('ja'));
  const sel = $('voiceSelect');
  sel.innerHTML = '';
  voicesList.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });
}

speechSynthesis.onvoiceschanged = populateVoiceList;

// Compute Levenshtein distance between two strings
function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  dp[0] = Array.from({ length: a.length + 1 }, (_, j) => j);

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,             // deletion
        dp[i][j - 1] + 1,             // insertion
        dp[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)  // substitution
      );
    }
  }
  return dp[b.length][a.length];
}


async function loadAllStories() {
  let jsonStories = {};
  try {
    const res = await fetch('stories.json');
    jsonStories = await res.json();
  } catch (e) {
    console.error("Failed to load stories.json", e);
  }
  allStories = { ...jsonStories, ...customStories };
  const sel = $('storySelector');
  sel.innerHTML = '<option disabled selected>Select a Story</option>';
  Object.keys(allStories).forEach(title => {
    const opt = document.createElement('option');
    opt.value = title;
    opt.textContent = title;

    sel.appendChild(opt);
  });
}

function startStory() {
  storyData = allStories[$('storySelector').value];
  currentLine = 0;
  renderLine();
  show('button-controls');
}

function renderLine() {
  const line = storyData[currentLine];
  $('jp-text').innerText = line.jp.join(' ');
  $('en-text').innerText = line.en;
  $('full-romaji').innerText = line.romaji_full;
  // 1) Show the “Play” button
  $('playMemoryBtn').classList.remove('hidden');
  // 2) Hide the game panel in case it was open
  $('memory-game-section').classList.add('hidden');
}

function prevLine() {
  if (currentLine > 0) currentLine--;
  renderLine();
}

function nextLine() {
  if (currentLine < storyData.length - 1) currentLine++;
  renderLine();
}


function startQuiz() {
  quizQuestions = [...storyData];
  quizIndex = 0;
  quizCorrect = 0;
  $('quiz-feedback').innerText = '';
  $('score').innerText = '';
  //hide('button-controls');
  hide('quizBtn');
  show('quiz-box');
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const line = quizQuestions[quizIndex];
  const jpText = Array.isArray(line.jp) ? line.jp.join(' ') : line.jp;
  $('quiz-question').innerText = jpText;
  $('quiz-question').title = line.romaji_full || line.romaji?.join(' ');

  // clear & focus the input
  const input = $('quiz-input');
  input.value = '';
  input.focus();

  // clear prior feedback
  $('quiz-feedback').innerText = '';
  $('score').innerText = `Question ${quizIndex + 1} of ${quizQuestions.length}`;
}

function normalize(str) {
  return str
    .trim()
    .toLowerCase()
    // strip any non‑alphanumeric or space (removes punctuation)
    .replace(/[^\w\s]|_/g, '')
    // collapse multiple spaces
    .replace(/\s+/g, ' ');
}

$('quiz-submit').onclick = () => {
  const line = quizQuestions[quizIndex];
  // build the Japanese key exactly as we stored it
  const jpText = Array.isArray(line.jp) ? line.jp.join('') : line.jp;

  const correct = normalize(line.en);
  const answer = normalize($('quiz-input').value);

  if (!answer) {
    return $('quiz-feedback').innerText = "Please type an answer.";
  }

  const dist = levenshtein(answer, correct);
  const isCorrect = (answer === correct) || (dist <= 1);

  if (isCorrect) {
    quizCorrect++;
    $('quiz-feedback').innerText = "✅ Correct!";
  } else {
    $('quiz-feedback').innerText = `❌ Nope, the answer was: "${line.en}"`;
  }

  // ── record this review result ──
  recordReview(jpText, isCorrect);
  updateReviewBadge();

  // advance after a pause
  setTimeout(() => {
    quizIndex++;
    if (quizIndex < quizQuestions.length) {
      renderQuizQuestion();
    } else {
      showQuizSummary();
    }
  }, 1200);
};


// allow Enter key to submit the quiz
$('quiz-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();                // stop form submits or line breaks
    $('quiz-submit').click();          // fire the same handler
  }
});


// Show a tiny teaser: first word of the correct English
$('quiz-hint').onclick = () => {
  const line = quizQuestions[quizIndex];
  const correct = line.en.trim();
  // take just the first word (or, if you prefer, first letter + stars)
  const firstWord = correct.split(' ')[0];
  $('quiz-feedback').innerText = `💡 Hint: ${firstWord}…`;
};


function showQuizSummary() {
  $('quiz-question').innerText = `Quiz Complete!`;
  $('quiz-input-container').classList.add('hidden');
  $('quiz-feedback').innerText = `You got ${quizCorrect} of ${quizQuestions.length} correct.`;
  show('end-buttons');
}

// bind the existing buttons
$('restartBtn').onclick = () => {
  $('quiz-input-container').classList.remove('hidden');
  $('end-buttons').classList.add('hidden');
  startQuiz();
};

$('menuBtn').onclick = returnToMenu;

function returnToMenu() {
  storyData = [];
  currentLine = 0;
  inResults = false;
  hide('button-controls');
  hide('quiz-box');
  hide('end-buttons');
  $('storySelector').selectedIndex = 0;
  $('jp-text').innerText = '';
  $('en-text').innerText = '';
  $('full-romaji').innerText = '';
  hide('deleteStoryBtn');
  hide('editStoryBtn');
  hide('revertStoryBtn');
}

function restartStory() {
  startStory();
}

/*function bindWana(el) {
  if ($('wanakanaToggle')?.checked) {
    el.addEventListener('input', (e) => {
      const caret = el.selectionStart;
      const converted = wanakana.toHiragana(e.target.value);
      el.value = converted;
      el.setSelectionRange(caret, caret);
    });
  }
}*/


function setupConverter() {
  $('openConverterBtn').onclick = () => {
    show('converter-box');
    $('converterInput').value = '';
    hide('converterOutput');
  };

  $('convertBtn').onclick = async () => {
    const input = $('converterInput').value.trim();
    if (!input) return alert("Please enter a sentence to convert.");

    show('converter-loader');  // Show the spinner


    try {
      const res = await fetch('http://localhost:4000/gpt-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      $('out-translation').innerText = data.translation;
      $('out-romaji').innerText = data.romaji;
      $('out-hiragana').innerText = data.hiragana;
      $('out-katakana').innerText = data.katakana || '-';
      $('out-explanation').innerText = data.explanation;

      show('converterOutput');
    } catch (err) {
      console.error("Conversion error:", err);
      alert("Something went wrong with GPT conversion.");
    } finally {
      hide('converter-loader');  // Hide the spinner
    }
  };
}

$('converterPronounceBtn').onclick = () => {
  const text = $('out-translation').innerText.trim();
  if (!text) return alert("Nothing to pronounce.");

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';

  const selectedVoice = $('voiceSelect').value;
  const voice = voicesList.find(v => v.name === selectedVoice);
  if (voice) utterance.voice = voice;

  utterance.rate = parseFloat($('voiceRate').value);
  speechSynthesis.cancel(); // cancel any current speech
  speechSynthesis.speak(utterance);
};


function setupChatbot() {
  const messagesBox = $('chatbot-messages');

  $('openChatbotBtn').onclick = () => {
    show('chatbot-box');
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  $('closeChatbotBtn').onclick = () => {
    hide('chatbot-box');
    $('chatbotInput').value = '';
  };

  $('sendChatbotBtn').onclick = async () => {
    const input = $('chatbotInput').value.trim();
    if (!input) return;

    appendChatMessage('user', input);
    $('chatbotInput').value = '';

    appendChatMessage('loading', '⏳ Thinking...');

    try {
      const res = await fetch('http://localhost:4000/gpt-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      const data = await res.json();

      // Remove loading message
      const loadingMsg = messagesBox.querySelector('.loading');
      if (loadingMsg) loadingMsg.remove();

      if (data.reply) {
        appendChatMessage('bot', data.reply);
      } else {
        appendChatMessage('bot', "⚠️ No reply received.");
      }
    } catch (err) {
      console.error(err);
      appendChatMessage('bot', "⚠️ Error connecting to tutor.");
    }

    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  function appendChatMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerText = text;
    if (sender === 'loading') msg.classList.add('loading');
    messagesBox.appendChild(msg);
  }
}



function speakText(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const selectedVoice = $('voiceSelect').value;
  const voice = voicesList.find(v => v.name === selectedVoice);
  if (voice) u.voice = voice;
  u.rate = parseFloat($('voiceRate').value);
  speechSynthesis.speak(u);
}


function pronounceLine() {
  if (!storyData.length) return;
  const text = storyData[currentLine]?.jp?.join('') || '';
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const name = $('voiceSelect').value;
  const voice = voicesList.find(v => v.name === name);
  if (voice) u.voice = voice;
  u.rate = parseFloat($('voiceRate').value);
  speechSynthesis.speak(u);
}

function addLine() {
  const div = document.createElement('div');
  div.classList.add('line-group');
  div.innerHTML = `
    <button class="removeLineBtn">✖</button>
    <input class="line-en" placeholder="English input"><br>
    <input class="line-romaji" placeholder="Romaji" readonly><br>
    <input class="line-jp" placeholder="Hiragana" readonly>
    <button class="pronounceBtn">🔊</button>
  `;
  bindLineEvents(div); // ✅ Handles the events, translation, spinners, save logic
  $('linesContainer').appendChild(div);
}

function converterSpeak() {
  const text = $('out-translation').innerText.trim();
  if (!text) return alert("Nothing to pronounce.");

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';

  const selectedVoice = $('voiceSelect').value;
  const voice = voicesList.find(v => v.name === selectedVoice);
  if (voice) utterance.voice = voice;

  utterance.rate = parseFloat($('voiceRate').value);
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

// ─── Spaced‑Repetition Helpers ───

// Key for localStorage
const REVIEW_KEY = 'kanaReviewRecords';

// Load all records (or an empty object)
function loadReviewRecords() {
  return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');
}

// Persist the records object
function saveReviewRecords(records) {
  localStorage.setItem(REVIEW_KEY, JSON.stringify(records));
}

// Record one review attempt for a given itemKey (e.g. the Japanese string)
function recordReview(itemKey, wasCorrect) {
  const recs = loadReviewRecords();
  const now = Date.now();

  let entry = recs[itemKey] || {
    intervalDays: 1,
    correctStreak: 0,
    lastReview: now,
    nextReview: now
  };

  if (wasCorrect) {
    entry.correctStreak++;
    entry.intervalDays = entry.intervalDays * 2;
  } else {
    entry.correctStreak = 0;
    entry.intervalDays = 1;
  }

  entry.lastReview = now;
  entry.nextReview = now + entry.intervalDays * 24 * 60 * 60 * 1000;

  recs[itemKey] = entry;
  saveReviewRecords(recs);
}

// Find which items are due for review
function getReviewDueItems() {
  const recs = loadReviewRecords();
  const now = Date.now();
  return Object.entries(recs)
    .filter(([key, entry]) => entry.nextReview <= now)
    .map(([key]) => key);
}

function updateReviewBadge() {
  const btn = document.getElementById('reviewDueBtn');
  const dueCount = getReviewDueItems().length;
  if (dueCount > 0) {
    btn.textContent = `🔄 Review Due (${dueCount})`;
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// ── Pre-cache & warm up Japanese TTS ──
let jpVoice = null;

function tryWarmup() {
  const voices = speechSynthesis.getVoices();
  jpVoice = voices.find(v => v.lang.startsWith('ja'));
  if (jpVoice) {
    // fire a silent utterance so the engine is already “awake”
    const warm = new SpeechSynthesisUtterance('');
    warm.voice = jpVoice;
    warm.volume = 0;
    speechSynthesis.speak(warm);
  } else {
    // retry in 100ms until we have our voice
    setTimeout(tryWarmup, 100);
  }
}

// Some browsers populate voices asynchronously:
speechSynthesis.onvoiceschanged = tryWarmup;

// Kick off the first attempt immediately:
tryWarmup();

// ── Utility to play a single kana with minimal lag ──
function playKana(char) {
  if (!jpVoice) {
    // fallback if not yet ready
    speechSynthesis.speak(new SpeechSynthesisUtterance(char));
    return;
  }
  const u = new SpeechSynthesisUtterance(char);
  u.voice = jpVoice;
  u.lang  = 'ja-JP';
  // cancel any in-flight to avoid queue clog
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}




document.addEventListener('DOMContentLoaded', () => {
  //console.log("DOM fully loaded");

  $('prevBtn').onclick = prevLine;
  $('nextBtn').onclick = nextLine;
  $('quizBtn').onclick = startQuiz;
  $('restartBtn').onclick = restartStory;
  $('menuBtn').onclick = returnToMenu;
  $('pronounceBtn').onclick = pronounceLine;
  $('addLineBtn').onclick = addLine;


  $('closeMemoryBtn').onclick = () => {
    // Unmount the React tree
    if (memoryGameRoot) {
      memoryGameRoot.unmount();
      memoryGameRoot = null;
    }

    // Hide game panel
    $('memory-game-section').classList.add('hidden');

    // Show lesson UI again
    $('story-box').classList.remove('hidden');
    $('button-controls').classList.remove('hidden');
  };



  loadAllStories();

  const reviewBtn = $('reviewDueBtn');


  // bind click to start a review session
  reviewBtn.onclick = () => {
    const dueItems = getReviewDueItems();
    if (!dueItems.length) return;

    // For simplicity, build a mini‑quiz where each question's jp = the key string,
    // and en = you could store or retrieve the English separately.
    quizQuestions = dueItems.map(key => {
      // if your allStories includes that key as a line, extract its .en
      // Otherwise just show the key and expect the user to self‑check.
      const en = allStories[currentStory]?.find(l => l.jp.join('') === key)?.en
        || '(self‑check)';
      return { jp: Array.from(key), en };
    });
    quizIndex = quizCorrect = 0;
    hide('button-controls');
    show('quiz-box');
    renderQuizQuestion();
  };

  // run it once now
  updateReviewBadge();

  setupConverter();
  setupChatbot();
  populateVoiceList();

  $('closeConverterBtn').onclick = () => {
    hide('converter-box');
    $('converterInput').value = '';
    hide('converterOutput');
    $('converterPronounceBtn').onclick = converterSpeak;
  };

  $('newStoryBtn').onclick = () => {
    show('storyEditor');
    editingExistingStory = false;
    $('newStoryTitle').value = '';
    $('linesContainer').innerHTML = '';
    hide('deleteStoryBtn');
    hide('editStoryBtn');
    hide('revertStoryBtn');
    addLine();
  };

  $('newStoryTitle').addEventListener('input', saveStoryDraft);

  $('cancelStoryBtn').onclick = () => {
    localStorage.removeItem('storyDraft');
    hide('storyEditor');
    $('newStoryTitle').value = '';
    $('linesContainer').innerHTML = '';
  };

  $('editStoryBtn').onclick = () => {
    const title = $('storySelector').value;
    const story = customStories[title];
    if (!story) return;

    editingExistingStory = true;
    originalStoryBeforeEdit = JSON.stringify(story);

    show('storyEditor');
    $('newStoryTitle').value = title;
    $('linesContainer').innerHTML = '';
    story.forEach(line => {
      const div = document.createElement('div');
      div.classList.add('line-group');
      div.innerHTML = `
    <button class="removeLineBtn">✖</button>
    <input class="line-en" value="${line.en}" placeholder="English input"><br>
    <input class="line-romaji" value="${line.romaji_full}" placeholder="Romaji" readonly><br>
    <input class="line-jp" value="${line.jp.join('')}" placeholder="Hiragana" readonly>
    <button class="pronounceBtn">🔊</button>
  `;
      bindLineEvents(div);
      $('linesContainer').appendChild(div);
    });

    show('revertStoryBtn');
  };

  $('revertStoryBtn').onclick = () => {
    if (!originalStoryBeforeEdit) return;
    const restored = JSON.parse(originalStoryBeforeEdit);
    const title = $('storySelector').value;
    customStories[title] = restored;
    allStories[title] = restored;
    localStorage.setItem('customStories', JSON.stringify(customStories));
    hide('storyEditor');
    $('newStoryTitle').value = '';
    $('linesContainer').innerHTML = '';
    startStory();
    hide('revertStoryBtn');
  };

  $('deleteStoryBtn').onclick = () => {
    const title = $('storySelector').value;
    if (!customStories[title]) return;

    if (confirm(`Delete custom story "${title}"? This cannot be undone.`)) {
      delete customStories[title];
      delete allStories[title];
      localStorage.setItem('customStories', JSON.stringify(customStories));
      loadAllStories();
      returnToMenu();
    }
  };

  $('storySelector').onchange = () => {
    // only hide the quiz and end‑buttons, don't reset the data or dropdown
    hide('quiz-box');
    hide('end-buttons');
    hide('button-controls');
    // now safely load the new story
    startStory();
  };


  $('saveStoryBtn').onclick = () => {
    localStorage.removeItem('storyDraft');
    const title = $('newStoryTitle').value.trim();
    if (!title) return alert("Enter a title");

    const groups = document.querySelectorAll('.line-group');
    if (!groups.length) return alert("Add at least one line");

    const storyArr = [];
    for (const g of groups) {
      const jp = g.querySelector('.line-jp').value.trim();
      const rm = g.querySelector('.line-romaji').value.trim();
      const en = g.querySelector('.line-en').value.trim();
      if (!jp || !rm || !en) return alert("Fill all fields");
      storyArr.push({
        jp: Array.from(jp),
        romaji: rm.split(/\s+/),
        romaji_full: rm,
        en
      });
    }

    function safeHighlightAt(i) {
      const kanaSpans = document.querySelectorAll('#slice-kana .slice-span');
      const romajiSpans = document.querySelectorAll('#slice-romaji .slice-span');
      const engSpans = document.querySelectorAll('#slice-english .slice-span');

      if (kanaSpans[i]) kanaSpans[i].classList.add('highlight');
      if (romajiSpans[i]) romajiSpans[i].classList.add('highlight');
      if (engSpans[i]) engSpans[i].classList.add('highlight');
    }

    customStories[title] = storyArr;
    allStories[title] = storyArr;
    localStorage.setItem('customStories', JSON.stringify(customStories));

    // Update dropdown list if new story
    if (![...$('storySelector').options].some(opt => opt.value === title)) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = title;
      $('storySelector').appendChild(opt);
    }

    // ✅ Reset editing state and close editor
    editingExistingStory = false;
    originalStoryBeforeEdit = null;
    hide('storyEditor');
    $('newStoryTitle').value = '';
    $('linesContainer').innerHTML = '';

    // ✅ Re-select the story in the dropdown and reload
    $('storySelector').value = title;
    $('storySelector').dispatchEvent(new Event('change'));
  };


  // Auto-restore from saved draft
  const draft = JSON.parse(localStorage.getItem('kanaStoryDraft') || 'null');
  if (draft && draft.title) {
    show('storyEditor');
    $('newStoryTitle').value = draft.title;
    $('linesContainer').innerHTML = '';
    draft.lines.forEach(line => {
      const div = document.createElement('div');
      div.classList.add('line-group');
      div.innerHTML = `
  <button class="removeLineBtn">✖</button>
  <input class="line-en" value="${line.en}" placeholder="English input"><br>
  <input class="line-romaji" value="${line.romaji}" placeholder="Romaji" readonly><br>
  <input class="line-jp" value="${line.jp}" placeholder="Hiragana" readonly>
  <button class="pronounceBtn">🔊</button>
`;

      bindLineEvents(div);

      div.querySelector('.pronounceBtn').onclick = () => speakText(line.jp);
      div.querySelector('.removeLineBtn').onclick = () => {
        div.remove();
        saveStoryDraft();
      };
      $('linesContainer').appendChild(div);
    });
    show('editStoryBtn');
    hide('deleteStoryBtn');
    hide('revertStoryBtn');
  }

  // Mount the KanaReference component
  const refContainer = document.getElementById('kana-reference-root');
  if (refContainer && window.KanaReference) {
    ReactDOM.createRoot(refContainer).render(
      React.createElement(window.KanaReference)
    );
  }

  // ── Plain‑JS Memory Match ──
  const playBtn = document.getElementById('playMemoryBtn');
  const closeBtn = document.getElementById('closeMemoryBtn');
  const gameSection = document.getElementById('memory-game-section');
  const gameRoot = document.getElementById('memory-game-root');
  const hintBtn = document.getElementById('hintBtn');
  const hintText = document.getElementById('hintText');

  let cards = [];
  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let matches = 0;

  // shuffle helper
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  playBtn.onclick = () => {
    // 1) Hide lesson UI
    document.getElementById('story-box').classList.add('hidden');
    document.getElementById('button-controls').classList.add('hidden');

    // 2) Build & shuffle doubled deck
    let sentence = storyData[currentLine].jp;
    if (Array.isArray(sentence)) sentence = sentence.join('');
    const kanaArr = Array.from(sentence);
    const pairObjs = kanaArr.map((c, i) => ({ id: i, content: c }));
    cards = shuffle([...pairObjs, ...pairObjs]); // e.g. ['こ','ん','に','ち','は','こ','ん','…']

    // 3) Reset & clear
    firstCard = secondCard = null;
    lockBoard = false;
    matches = 0;
    hintText.textContent = '';
    gameRoot.innerHTML = '';

    gameRoot.style.display = 'flex';
    gameRoot.style.flexWrap = 'wrap';
    gameRoot.style.justifyContent = 'center';
    gameRoot.style.gap = '1rem';



    // 5) Create each card DIV with inline styles so it's visible immediately
    cards.forEach((card, idx) => {
      const el = document.createElement('div');
      // Inline styles for size, layout, colors
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
      el.textContent = ''; // start face‑down

      el.addEventListener('click', onCardClick);
      gameRoot.appendChild(el);
    });

    // 6) Finally show the game panel
    gameSection.classList.remove('hidden');

  };


  function onCardClick(evt) {
    if (lockBoard) return;
    const el = evt.currentTarget;
    if (el === firstCard || el.classList.contains('matched')) return;

    // flip & speak
    el.textContent = el.dataset.content;
    const utter = new SpeechSynthesisUtterance(el.dataset.content);
    utter.lang = 'ja-JP';
    speechSynthesis.speak(utter);

    if (!firstCard) {
      firstCard = el;
    } else {
      secondCard = el;
      checkForMatch();
    }
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

  function resetTurn() {
    [firstCard, secondCard] = [null, null];
    lockBoard = false;
  }

  closeBtn.onclick = () => {
    gameSection.classList.add('hidden');
    document.getElementById('story-box').classList.remove('hidden');
    document.getElementById('button-controls').classList.remove('hidden');
  };

  hintBtn.onclick = () => {
    const unmatched = Array.from(gameRoot.children)
      .filter(c => !c.classList.contains('matched'))
      .map(c => c.dataset.content);
    if (!unmatched.length) return;
    const pick = unmatched[Math.floor(Math.random() * unmatched.length)];
    hintText.textContent = pick;
    const u = new SpeechSynthesisUtterance(pick);
    u.lang = 'ja-JP';
    speechSynthesis.speak(u);
  };
  // — Ninja-Slice Setup —
  const sliceOverlay = document.getElementById('slice-overlay');
  const slicePanel = document.getElementById('slice-game-section');
  const sliceBtn = document.getElementById('sliceBtn');
  const closeSliceBtn = document.getElementById('closeSliceBtn');
  const SLICE_SPAWN_RATE_MS = 400;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // make sure our AudioContext can actually start
  document.body.addEventListener('pointerdown', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }, { once: true });

  //function playCorrect() {
    //const osc = audioCtx.createOscillator();
    //const gain = audioCtx.createGain();
   // osc.type = 'triangle';
    //osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    // pitch up quickly:
   // osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.15);
    //gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    //gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    //gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
   // osc.connect(gain).connect(audioCtx.destination);
    //osc.start();
    //osc.stop(audioCtx.currentTime + 0.35);
  //}

  function playWrong() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    // start high, sweep downward over 0.6s:
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  }

  let originalPhraseObjs = [];
  window.ctx = canvas.getContext('2d');
  window.scoreEl = document.getElementById('slice-score');
  const timerEl = document.getElementById('slice-timer');
  let tiles = [];
  let sliceInterval, sliceAnimId;
  ctx.font = '48px sans-serif';
  let slicedIndices = new Set();


  // 1) Define the click handler before wiring it up:
  // 3) Spawning logic

  function spawnTile() {
    if (targetArr.length === 0) {
      stopSpawning();
      return;
    }
    // Pick a random entry from the *full* list (no splicing)
    const rnd = Math.floor(Math.random() * originalPhraseObjs.length);
    const { char, index } = originalPhraseObjs[rnd];

    tiles.push({
      char,
      index,                       // for highlighting
      x: Math.random() * canvas.width,
      y: -30,
      vy: 0.5 + Math.random() * 0.5,
      size: 64
    });
    console.log("spawnTile()", targetArr.length, "left");
  }


  function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    t.y += t.vy;

    // 1) If the tile is still “live,” turn on a glow
    if (!t.sliced) {
      ctx.save();
      ctx.shadowColor = '#38bdf8';   // Tailwind sky-400
      ctx.shadowBlur  = 12;
    }

    // 2) Choose its fill color (green if just sliced, black otherwise)
    ctx.fillStyle = t.sliced ? '#22c55e' /* green-600 */ : '#000';
    ctx.fillText(t.char, t.x, t.y);

    ctx.restore();

    // 3) If it’s been sliced a moment ago, drop it after the flash
    if (t.sliced && Date.now() - t.slicedAt > 200) {
      tiles.splice(i, 1);
    }
    // 4) Also drop tiles that fall off the bottom
    else if (t.y > canvas.height + 50) {
      tiles.splice(i, 1);
    }
  }

  sliceAnimId = requestAnimationFrame(drawFrame);
}

  console.log('▶️ starting ninja slice:');
  console.log(
    '▶️ starting ninja slice:',
    JSON.parse(JSON.stringify(originalPhraseObjs)),
    JSON.parse(JSON.stringify(targetArr))
  );
  function startSpawning() {
    stopSpawning();
    tiles = [];
    drawFrame();
    sliceInterval = setInterval(spawnTile, SLICE_SPAWN_RATE_MS);
  }
  function stopSpawning() {
    clearInterval(sliceInterval);
    cancelAnimationFrame(sliceAnimId);
  }
  function handleSlice(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let hitIndex = null;

    // 1) Find the topmost tile under the click
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      const half = t.size / 2;
      if (
        x >= t.x - half && x <= t.x + half &&
        y >= t.y - half && y <= t.y + half
      ) {
        // ✔️ correct slice
        tiles.splice(i, 1);
        // record that slot
        slicedIndices.add(t.index);
        slicedCount++;
        scoreEl.textContent = `Score: ${slicedCount}`;



        // audio + highlight
        playKana(t.char);            // your “yeah” sound
        safeHighlightAt(t.index);  // highlights kana/romaji/english spans

        hitIndex = t.index;
        break;
      }
    }

    // 2) If no tile was hit, play miss feedback
    if (hitIndex === null) {
      playWrong();                // your “sad trumpet” sound
      canvas.classList.add('wrong');
      setTimeout(() => canvas.classList.remove('wrong'), 150);
    }

  }

  function playKana(char) {
    const utter = new SpeechSynthesisUtterance(char);
    utter.lang = 'ja-JP';
    // if you’ve already populated voicesList elsewhere:
    const jpVoice = voicesList.find(v => v.lang.startsWith('ja'));
    if (jpVoice) utter.voice = jpVoice;
    speechSynthesis.speak(utter);
  }

  function handleSlice(e) {
    const { left, top } = canvas.getBoundingClientRect();
    const x = e.clientX - left, y = e.clientY - top;
    let hit = null;

    // check tiles from topmost
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i], half = t.size / 2;
      if (x >= t.x - half && x <= t.x + half && y >= t.y - half && y <= t.y + half) {
        tiles.splice(i, 1);
        slicedIndices.add(t.index);
        slicedCount++;
        scoreEl.textContent = `Score: ${slicedCount}`;
        // TODO: play correct sound here
        // TODO: highlight t.index span here

        playKana(t.char);
        hitIndex = t.index;
        hit = true;
        safeHighlightAt(hitIndex);
        console.log("hit index:", t.index);
        safeHighlightAt(t.index)
        break;
      }

      console.log('🔪 clicked tile, hitIndex =', hitIndex);
      // highlight the kana
      const kanaEl = document.getElementById(`slice-kana-${hitIndex}`);
      console.log('👉 kanaEl is', kanaEl);
      if (kanaEl) kanaEl.classList.add('highlight');
      // highlight the romaji
      const romajiEl = document.getElementById(`slice-romaji-${hitIndex}`);
      if (romajiEl) romajiEl.classList.add('highlight');
      // highlight the English
      const engEl = document.getElementById(`slice-english-${hitIndex}`);
      if (engEl) engEl.classList.add('highlight');

    }
    if (hit) {
      // record & highlight
      slicedIndices.add(t.index);
      safeHighlightAt(t.index);
     playKana(t.char);
    } else {
      playWrong();
      canvas.classList.add('wrong');
      setTimeout(() => canvas.classList.remove('wrong'), 150);
    }
    // if all sliced:
    if (slicedIndices.size === originalPhraseObjs.length) {
      return endSliceGame();
    }
  }

  // 4) Click to “slice”
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit = false;

    // check each tile, top-down
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      const half = t.size / 2;

      if (
        x >= t.x - half && x <= t.x + half &&
        y >= t.y - half && y <= t.y + half
      ) {
        // ✅ correct slice
        tiles.splice(i, 1);
        slicedCount++;
        scoreEl.textContent = `Score: ${slicedCount}`;
        slicedIndices.add(t.index);
        playKana(t.char);

        // highlight the matched kana/romaji/english spans:
        document.getElementById(`slice-kana-${t.index}`)?.classList.add('highlight');
        document.getElementById(`slice-romaji-${t.index}`)?.classList.add('highlight');
        document.getElementById(`slice-english-${t.index}`)?.classList.add('highlight');

        hit = true;
        break;
      }
    }

    if (!hit) {
      // ❌ miss
      playWrong();
      canvas.classList.add('wrong');
      setTimeout(() => canvas.classList.remove('wrong'), 150);
    }

    // if you’ve cleared them all, end immediately
    if (slicedIndices.size === originalPhraseObjs.length) {
      endSliceGame();
    }
  });


  // 5) Game over
  function endSliceGame() {
    stopSpawning();
    clearInterval(window.sliceTimerInterval);
    canvas.style.pointerEvents = 'auto';
    confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
    scoreEl.textContent = 'Subarashii!';
  }

  // 1) When “Ninja Slice” is clicked:
  sliceBtn.addEventListener('click', () => {
    //console.log("🔪 Ninja Slice clicked—phrase:", originalPhraseObjs);
    // a) Grab the current phrase
    const line = storyData[currentLine];
    const phrase = Array.isArray(line.jp) ? line.jp.join('') : line.jp;

    // b) Build our deck
    originalPhraseObjs = Array.from(phrase).map((c, i) => ({ char: c, index: i }));

    targetArr = originalPhraseObjs.slice();
    tiles = [];
    slicedCount = 0;
    scoreEl.textContent = 'Score: 0';
    slicedIndices.clear()


    // c) Render the three lines as individual <span> with IDs
    document.getElementById('slice-kana').innerHTML =
      originalPhraseObjs.map((o, i) =>
        `<span id="slice-kana-${i}" class="slice-span">${o.char}</span>`
      ).join('');

    document.getElementById('slice-romaji').innerHTML =
      line.romaji_full.split(/\s+/).map((r, i) =>
        `<span id="slice-romaji-${i}" class="slice-span">${r}</span>`
      ).join(' ');

    document.getElementById('slice-english').innerHTML =
      line.en.split(/\s+/).map((w, i) =>
        `<span id="slice-english-${i}" class="slice-span">${w}</span>`
      ).join(' ');

    console.log(
      '📝 spans:',
      Array.from(originalPhraseObjs.keys()).map(i => document.getElementById(`slice-kana-${i}`) !== null)
    );



    // d) Reset timer
    let timeLeft = 60;
    timerEl.textContent = timeLeft;
    clearInterval(window.sliceTimerInterval);
    window.sliceTimerInterval = setInterval(() => {
      if (--timeLeft <= 0) {
        clearInterval(window.sliceTimerInterval);
        endSliceGame();
      }
      timerEl.textContent = timeLeft;
    }, 1000);

    // e) Show modal & start dropping
    if (!sliceOverlay) {
      console.warn("sliceOverlay element not found");
    } else {
      sliceOverlay.classList.add('flex');
    }
    sliceOverlay.classList.remove('hidden');
    sliceOverlay.classList.add('flex');
    //console.log('▶️ starting ninja slice:', originalPhraseObjs);
    startSpawning();
  });

  // 2) Close button
  closeSliceBtn.addEventListener('click', () => {
    clearInterval(window.sliceTimerInterval);
    stopSpawning();
    if (!sliceOverlay) {
      console.warn("sliceOverlay element not found");
    } else {
      sliceOverlay.classList.add('flex');
    }
    sliceOverlay.classList.add('hidden');
    sliceOverlay.classList.remove('flex');
  });


});




function bindLineEvents(div) {
  const enInput = div.querySelector('.line-en');
  const romajiInput = div.querySelector('.line-romaji');
  const jpInput = div.querySelector('.line-jp');
  const pronounceBtn = div.querySelector('.pronounceBtn');

  const spinner = document.createElement('div');
  spinner.className = 'spinner hidden';
  spinner.style.marginLeft = '8px';
  div.appendChild(spinner);


  enInput.addEventListener('input', async () => {
    const en = enInput.value.trim();
    if (!en) {
      romajiInput.value = '';
      jpInput.value = '';
      return;
    }

    spinner.classList.remove('hidden');

    try {
      const res = await fetch('http://localhost:4000/gpt-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: en })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      romajiInput.value = data.romaji || '';
      jpInput.value = data.hiragana || '';
    } catch (err) {
      console.error('GPT conversion failed:', err);
      alert('Translation failed.');
    } finally {
      spinner.classList.add('hidden');
    }

    saveStoryDraft();
  });

  pronounceBtn.onclick = () => speakText(jpInput.value);

  div.querySelector('.removeLineBtn').onclick = () => {
    div.remove();
    saveStoryDraft();
  };
}

function saveStoryDraft() {
  const title = $('newStoryTitle').value.trim();
  const groups = document.querySelectorAll('.line-group');
  const lines = [];

  for (const g of groups) {
    const en = g.querySelector('.line-en').value;
    const romaji = g.querySelector('.line-romaji').value;
    const jp = g.querySelector('.line-jp').value;
    lines.push({ en, romaji, jp });
  }

  const draft = { title, lines };
  localStorage.setItem('kanaStoryDraft', JSON.stringify(draft));
}
