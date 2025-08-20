// No imports; React and hooks are global
const { useState } = React;

// Complete list of 46 basic hiragana with romaji
const HIRAGANA = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
];

// Complete list of 46 basic katakana with romaji
const KATAKANA = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n'],
];

// Quick translator using GPT convert endpoint
function KanaReference() {
  const [input, setInput] = useState('');
  const [translation, setTranslation] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTranslate() {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/gpt-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      });
      const data = await res.json();
      setTranslation(data.translation || '');
    } catch (e) {
      console.error(e);
      setTranslation('Error translating.');
    } finally {
      setLoading(false);
    }
  }

  const renderGrid = (items) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', margin: '16px 0' }}>
      {items.map(([kana, roma]) => (
        <div key={kana} style={{ textAlign: 'center', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <div style={{ fontSize: '32px' }}>{kana}</div>
          <div style={{ fontSize: '16px', marginTop: '4px' }}>{roma}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '16px' }}>
      <h2>Hiragana Chart</h2>
      {renderGrid(HIRAGANA)}
      <h2 style={{ marginTop: '32px' }}>Katakana Chart</h2>
      {renderGrid(KATAKANA)}
      <h3 style={{ marginTop: '32px' }}>Quick Translzator</h3>
      <textarea
        rows={3}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type English or Japanese..."
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <button onClick={handleTranslate} disabled={loading} style={{ padding: '8px 16px' }}>
        {loading ? 'Translating…' : 'Translate'}
      </button>
      {translation && <p style={{ marginTop: '12px' }}><strong>Result:</strong> {translation}</p>}
    </div>
  );
}

// Expose globally for mounting
window.KanaReference = KanaReference;
