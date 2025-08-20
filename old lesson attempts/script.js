// 1) Import at the top, before any DOM-ready code:
import { initNinjaSlice } from './modules/ninjaSlice.js';

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
storyData.ready = true;
window.storyData = storyData;
window.currentLine = currentLine;

function populateStorySelector(titles) {
  const selector = document.getElementById('storySelector');
  selector.innerHTML = '<option disabled selected>Select a Story</option>';

  titles.forEach((title, i) => {
    const option = document.createElement('option');
    option.value = title;
    option.textContent = title;
    selector.appendChild(option);
  });
}

document.getElementById('storySelector').addEventListener('change', e => {
  const title = e.target.value;
  if (allStories[title]) {
    storyData = allStories[title];
    currentLine = 0;
    startStory(); // ✅ handles intro and lines correctly
  }
});

fetch('stories.json')
  .then(res => res.json())
  .then(data => {
    allStories = data;              // ✅ Store in allStories
    window.storyData = data;        // Optional if used elsewhere
    populateStorySelector(Object.keys(data)); // Pass array of titles
  });



function startStory() {
  const selectedTitle = $('storySelector').value;
  const selectedStory = allStories[selectedTitle];
  storyData = selectedStory;
  currentLine = 0;
  window.storyData = storyData;
  window.currentLine = currentLine;

  // ✅ Log checks
  console.log("Selected title:", selectedTitle);
  console.log("Loaded story:", storyData);
  console.log("Lines array:", storyData.lines);
  console.log("First line:", storyData.lines?.[0]);

  // ✅ Check for valid lines
  if (!Array.isArray(storyData.lines) || !storyData.lines[currentLine]) {
    console.warn("No valid line data to render for:", selectedTitle);
    return;
  }

  if (storyData.intro && storyData.intro.en) {
    $('lesson-intro-text').innerHTML = `
  <p><strong>JP:</strong> ${storyData.intro.jp}</p>
  <p><strong>Romaji:</strong> ${storyData.intro.romaji}</p>
  <p><strong>EN:</strong> ${storyData.intro.en}</p>
`;
    show('lesson-intro');
    hide('jp-text');
    hide('en-text');
    hide('full-romaji');
    hide('playMemoryBtn');
    return; // ⛔ stop here, don't show the rest until they click Continue
  }


  // ✅ Continue to main lesson content
  renderLine(storyData.lines[currentLine]);
  show('button-controls');
}



function prevLine() {
  if (currentLine > 0) currentLine--;
  window.currentLine = currentLine;
  renderLine(storyData.lines[currentLine]);

}

function nextLine() {
  if (currentLine < storyData.length - 1) currentLine++;
  window.currentLine = currentLine;
  renderLine(storyData.lines[currentLine]);

}

function renderLessonSteps(steps) {
  const container = document.getElementById('lesson-steps');
  container.innerHTML = '';

  if (!steps || steps.length === 0) {
    container.style.display = 'none';
    return;
  }

  steps.forEach((step, i) => {
    const block = document.createElement('div');
    block.classList.add('mb-3', 'p-3', 'bg-yellow-50', 'rounded', 'border');
    block.innerHTML = `
      <p class="text-lg font-semibold">Step ${i + 1}</p>
      <p><strong>JP:</strong> ${step.jp}</p>
      <p><strong>Romaji:</strong> ${step.romaji}</p>
      <p><strong>EN:</strong> ${step.en}</p>
    `;
    container.appendChild(block);
  });

  container.style.display = 'block';
}



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

  Object.entries(allStories).forEach(([key, story]) => {
    const opt = document.createElement('option');
    opt.value = key;                            // Use the key as the value
    opt.textContent = story.title || key;       // Show title in dropdown
    sel.appendChild(opt);
  });


}


function startQuiz(questions = storyData.lines) {
  quizQuestions = [...questions];
  quizIndex = 0;
  quizCorrect = 0;
  $('quiz-feedback').innerText = '';
  $('score').innerText = '';
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
  if (!storyData.lines?.length) return;
  const text = Array.isArray(storyData.lines[currentLine]?.jp)
    ? storyData.lines[currentLine].jp.join('')
    : storyData.lines[currentLine]?.jp || '';
  if (!text) return;
  speakText(text);
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
  u.lang = 'ja-JP';
  // cancel any in-flight to avoid queue clog
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}


document.addEventListener('DOMContentLoaded', () => {
  $('prevBtn').onclick = prevLine;
  $('nextBtn').onclick = nextLine;
  $('quizBtn').onclick = startQuiz;
  $('restartBtn').onclick = restartStory;
  $('menuBtn').onclick = returnToMenu;
  $('addLineBtn').onclick = addLine;

  $('pronounceBtn').addEventListener('click', () => {
    const line = storyData.lines?.[currentLine];
    if (line && line.jp) {
      speakText(line.jp);
    } else {
      console.warn("Nothing to pronounce.");
    }
  });

  $('quizBtn').addEventListener('click', () => {
    if (storyData.practice && Array.isArray(storyData.practice)) {
      startQuiz(storyData.practice);
    } else if (storyData.practice?.questions) {
      startQuiz(storyData.practice.questions);
    } else {
      console.warn("No practice data available.");
    }
  });

  $('sliceBtn').addEventListener('click', () => {
  // Fetch the selected story and the current line
  const title = $('storySelector').value;
  const selectedStory = allStories?.[title];
  const line = storyData.lines[currentLine];

  // Ensure there is valid data to work with
  if (!line || !line.jp) {
    console.warn('Slice: no usable line found.');
    return;
  }

  // Prepare the phrase and translations
  const phrase = Array.isArray(line.jp) ? line.jp.join('') : line.jp;
  const romaji = line.romaji_full || (line.romaji?.join(' ') || '');
  const english = line.en || '';

  // Show the modal and force layout to be visible
  const overlay = document.getElementById('slice-overlay');
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';

  // Delay the game initialization to give the modal time to render
  setTimeout(() => {
    // Initialize the Ninja Slice game with necessary parameters
    initNinjaSlice({
      containerId: 'slice-game-section',  // The container where the game will appear
      canvasId: 'slice-canvas',          // The canvas element
      closeBtnId: 'closeSliceBtn',       // Close button inside the modal
      overlayId: 'slice-overlay',        // Overlay element
      scoreElId: 'slice-score',         // Score element
      timerElId: 'slice-timer',         // Timer element
      kanaContainerId: 'slice-kana',    // Container for kana display
      romajiContainerId: 'slice-romaji', // Container for romaji display
      englishContainerId: 'slice-english', // Container for English display
      phrase,                            // The phrase to slice
      romaji,                            // Full Romaji version
      english                            // English translation
    });
  }, 0);
});

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

  const overlay = document.getElementById('slice-overlay')

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

document.getElementById('continueFromIntro').addEventListener('click', () => {
  hide('lesson-intro');
  show('jp-text');
  show('en-text');
  show('full-romaji');
  show('playMemoryBtn');
  show('button-controls');

  if (storyData.lines && storyData.lines[currentLine]) {
    renderLine(storyData.lines[currentLine]);
  } else {
    console.warn('No valid line to render after intro.');
  }
})

// === lesson init (append at end of script.js) ===

// 1) Map your existing DOM selectors
const map = {
  containers: {
    list:    "#lessonList",     // <-- replace with your element
    status:  "#lessonStatus",
    feedback:"#lessonFeedback"
  },
  controls: {
    next:       "#btnNext",
    prev:       "#btnPrev",
    check:      "#btnCheck",
    showAnswer: "#btnReveal"
  },
  classes: { item:"lesson-item", jp:"jp", romaji:"romaji", en:"en", input:"inp", ok:"ok", bad:"bad", hint:"hint", prompt:"prompt" },
  flags: { showRomaji:false, showEnglish:true, allowRomaji:false }
};

// 3) Start the lesson (bind to a button if you have one; otherwise auto-start)
const startBtn = document.querySelector("#startLesson"); // <-- replace if you have a start button
if (startBtn) {
  startBtn.addEventListener("click", () => LessonShim.start(lesson1, map));
} else {
  window.addEventListener("DOMContentLoaded", () => LessonShim.start(lesson1, map));
}
// === end lesson init ===

// === append at END of script.js ===

// 0) Create lesson controls (no HTML edits needed)
(function ensureLessonControls(){
  if (document.querySelector('#lsNext')) return;
  const anchor = document.querySelector('#full-romaji') || document.querySelector('#jp-text') || document.body;
  const wrap = document.createElement('div');
  wrap.id = 'lesson-controls';
  wrap.style.margin = '12px 0';
  wrap.innerHTML = `
    <button id="lsPrev">⬅ Prev</button>
    <button id="lsCheck">Check</button>
    <button id="lsReveal">Reveal</button>
    <button id="lsNext">Next ➡</button>
  `;
  anchor.insertAdjacentElement('afterend', wrap);
})();

// 2) One sample lesson
const lesson1 = {
  id: "greetings-001",
  title: "First Greetings",
  est_minutes: 8,
  sentences: [
    { sid: "S1", jp: "おはようございます。", romaji_full: "ohayou gozaimasu.", en: "Good morning." },
    { sid: "S2", jp: "こんにちは。",           romaji_full: "konnichiwa.",          en: "Hello." },
    { sid: "S3", jp: "こんばんは。",           romaji_full: "konbanwa.",            en: "Good evening." },
    { sid: "S4", jp: "はじめまして。",         romaji_full: "hajimemashite.",       en: "Nice to meet you." },
    { sid: "S5", jp: "よろしくお願いします。", romaji_full: "yoroshiku onegaishimasu.", en: "Please treat me well." },
    { sid: "S6", jp: "さようなら。",           romaji_full: "sayounara.",           en: "Goodbye." }
  ],
  steps: [
    { type: "read_listen",      item_refs: ["S1","S2","S3","S4","S5","S6"] },
    { type: "cloze",            items: [
        { ref: "S2", blanks: ["こんにちは"] },
        { ref: "S4", blanks: ["はじめまして"] },
        { ref: "S5", blanks: ["よろしく","お願いします"] }
      ]
    },
    { type: "translate_to_jp",  item_refs: ["S1","S3","S6"] },
    { type: "reflect" }
  ]
};

// 3) Start once LessonShim is available and DOM is ready
(function startWhenReady(){
  const boot = () => (window.LessonShim && document.readyState !== "loading")
    ? LessonShim.start(lesson1, map)
    : setTimeout(boot, 50);
  boot();
})();
