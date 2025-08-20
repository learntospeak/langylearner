// lesson-loader.js v4 — waits for shim, then loads lessons from stories.json

const ui = { list:"#jp-text", status:"#en-text", feedback:"#full-romaji", title:"#pageTitle" };
// …leave the rest unchanged…
const map = {
  containers: { list:"#jp-text", status:"#en-text", feedback:"#full-romaji" },
  controls: { next:"#lsNext", prev:"#lsPrev", check:"#lsCheck", showAnswer:"#lsReveal",
              toggleRomaji:"#lsToggleRomaji", speak:"#lsSpeak",
              speed:"#lsSpeed", speedVal:"#lsSpeedVal" },
  classes:{ item:"lesson-item", jp:"jp", romaji:"romaji", en:"en", input:"inp", ok:"ok", bad:"bad", hint:"hint", prompt:"prompt", speakBtn:"speak-btn" },
  // add to your existing map
flags: { showRomaji:false, showEnglish:true, allowRomaji:false, syllableMode: true },
  speech:{ rate:1, pitch:1, volume:1 },
  mascot:"#mascot", // ← NEW
  classes: {
  item:"lesson-item", jp:"jp", romaji:"romaji", en:"en",
  input:"field",                     // ← use the styled class
  ok:"ok", bad:"bad", hint:"hint", prompt:"prompt", speakBtn:"speak-btn"
},
 
};

function show(msg){ const el=document.querySelector(ui.status); if(el) el.textContent=msg; console.log("[lesson]", msg); }

function waitForShim(){
  return new Promise((resolve, reject)=>{
    let tries=0, max=200;
    (function tick(){
      if (typeof LessonShim !== "undefined") return resolve();
      if (++tries > max) return reject(new Error("LessonShim not found. Ensure lesson-shim.js loads before lesson-loader.js."));
      setTimeout(tick, 25);
    })();
  });
}

async function loadLessons(){
  const res = await fetch("./stories.json", { cache:"no-store" });
  if(!res.ok) throw new Error(`Failed to load stories.json (HTTP ${res.status}).`);
  const data = await res.json();
  return Array.isArray(data?.lessons) ? data.lessons : (Array.isArray(data) ? data : []);
}

function pickLesson(lessons){
  const id = new URLSearchParams(location.search).get("lesson");
  if (id){
    const m = lessons.find(l=>l.id===id);
    if (!m) throw new Error(`Lesson "${id}" not found. Available: ${lessons.map(l=>l.id).join(", ")}`);
    return m;
  }
  return lessons[0];
}

function updateTitle(lesson){
  const t = `KanaReader — ${lesson.title || lesson.id}`;
  document.title = t;
  const h1 = document.querySelector(ui.title);
  if (h1) h1.textContent = t;
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    show("Initializing…");
    await waitForShim();
    show("Loading lessons…");
    const lessons = await loadLessons();
    if(!lessons.length) throw new Error("No lessons found in stories.json.");
    const lesson = pickLesson(lessons);
    updateTitle(lesson);
    LessonShim.start(lesson, map);
    show("Lesson ready.");
  } catch(e){
    show(e.message);
    console.error(e);
  }
});
