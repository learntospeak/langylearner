// Minimal wanakana fallback used when CDN is unavailable.
// Defines window.wanakana with toHiragana, toRomaji, and bind (no-op).
(function(){
  if (window.wanakana) return; // respect real library if present

  const hiraMap = {
    a:"あ", i:"い", u:"う", e:"え", o:"お",
    ka:"か", ki:"き", ku:"く", ke:"け", ko:"こ",
    sa:"さ", shi:"し", su:"す", se:"せ", so:"そ",
    ta:"た", chi:"ち", tsu:"つ", te:"て", to:"と",
    na:"な", ni:"に", nu:"ぬ", ne:"ね", no:"の",
    ha:"は", hi:"ひ", fu:"ふ", he:"へ", ho:"ほ",
    ma:"ま", mi:"み", mu:"む", me:"め", mo:"も",
    ya:"や", yu:"ゆ", yo:"よ",
    ra:"ら", ri:"り", ru:"る", re:"れ", ro:"ろ",
    wa:"わ", wo:"を", n:"ん",
    ga:"が", gi:"ぎ", gu:"ぐ", ge:"げ", go:"ご",
    za:"ざ", ji:"じ", zu:"ず", ze:"ぜ", zo:"ぞ",
    da:"だ", de:"で", do:"ど",
    ba:"ば", bi:"び", bu:"ぶ", be:"べ", bo:"ぼ",
    pa:"ぱ", pi:"ぴ", pu:"ぷ", pe:"ぺ", po:"ぽ",
    kya:"きゃ", kyu:"きゅ", kyo:"きょ",
    sha:"しゃ", shu:"しゅ", sho:"しょ",
    cha:"ちゃ", chu:"ちゅ", cho:"ちょ",
    nya:"にゃ", nyu:"にゅ", nyo:"にょ",
    hya:"ひゃ", hyu:"ひゅ", hyo:"ひょ",
    mya:"みゃ", myu:"みゅ", myo:"みょ",
    rya:"りゃ", ryu:"りゅ", ryo:"りょ",
    gya:"ぎゃ", gyu:"ぎゅ", gyo:"ぎょ",
    ja:"じゃ", ju:"じゅ", jo:"じょ",
    bya:"びゃ", byu:"びゅ", byo:"びょ",
    pya:"ぴゃ", pyu:"ぴゅ", pyo:"ぴょ"
  };

  // Build reverse map for kana -> romaji (simple, not Hepburn-perfect)
  const romaFromKana = {};
  Object.entries(hiraMap).forEach(([r,k]) => { romaFromKana[k] = r; });

  function toHiragana(input=""){
    let s = (input || "").toLowerCase();
    // strip punctuation we don't transliterate
    // keep spaces and periods; lesson code strips punctuation as needed
    let out = "";
    let i = 0;
    function isConsonant(c){ return /[bcdfghjklmnpqrstvwxyz]/.test(c); }
    while (i < s.length){
      // try 3-char combos (kya, sha, etc)
      const tri = s.slice(i, i+3);
      if (hiraMap[tri]) { out += hiraMap[tri]; i += 3; continue; }
      // small tsu for double consonant (except 'n')
      const c1 = s[i], c2 = s[i+1];
      if (c1 && c2 && isConsonant(c1) && c1 === c2 && c1 !== 'n') { out += 'っ'; i += 1; continue; }
      // try 2-char syllables
      const bi = s.slice(i, i+2);
      if (hiraMap[bi]) { out += hiraMap[bi]; i += 2; continue; }
      // single 'n' before non-vowel becomes ん
      if (s[i] === 'n') { out += 'ん'; i += 1; continue; }
      // single vowel or passthrough char
      if (hiraMap[s[i]]) { out += hiraMap[s[i]]; i += 1; continue; }
      // passthrough for spaces and common punctuation
      out += s[i]; i += 1;
    }
    return out;
  }

  function toRomaji(input=""){
    const s = String(input || "");
    let out = "";
    for (let i = 0; i < s.length; i++){
      const c = s[i];
      const c2 = s.slice(i, i+2);
      const c3 = s.slice(i, i+3);
      if (romaFromKana[c3]) { out += romaFromKana[c3]; i += 2; continue; }
      if (romaFromKana[c2]) { out += romaFromKana[c2]; i += 1; continue; }
      if (c === 'っ') { // gemination; double next consonant if any
        const next = s[i+1] || '';
        const romNext = toRomaji(next).charAt(0) || '';
        out += romNext ? romNext : '';
        continue;
      }
      // simple kana
      if (romaFromKana[c]) { out += romaFromKana[c]; continue; }
      out += c; // passthrough
    }
    return out;
  }

  function bind(){ /* no-op fallback */ }

  window.wanakana = { toHiragana, toRomaji, bind };
  console.info('[wanakana-lite] active (CDN fallback)');
})();

