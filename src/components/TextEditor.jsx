import { useRef, useEffect } from 'react';

export default function TextEditor({ text, onChange, loading, playing, currentWordIndex }) {
  const readingRef = useRef(null);

  // Auto-scroll to highlighted word
  useEffect(() => {
    if (!playing || currentWordIndex < 0 || !readingRef.current) return;
    const activeWord = readingRef.current.querySelector('.word-active');
    if (activeWord) {
      activeWord.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentWordIndex, playing]);

  if (loading) {
    return (
      <div className="text-editor">
        <label>النص المستخرج</label>
        <div className="loading">جاري استخراج النص...</div>
      </div>
    );
  }

  // Reading mode: show words as spans with highlighting
  if (playing && text && currentWordIndex >= 0) {
    const words = text.split(/(\s+)/);
    let wordIdx = 0;

    return (
      <div className="text-editor">
        <label>النص المستخرج</label>
        <div className="reading-text" ref={readingRef} dir="rtl" lang="ar">
          {words.map((segment, i) => {
            if (/^\s+$/.test(segment)) {
              return <span key={i}>{segment}</span>;
            }
            const idx = wordIdx++;
            return (
              <span
                key={i}
                className={idx === currentWordIndex ? 'word-active' : 'word'}
              >
                {segment}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // Edit mode: textarea
  return (
    <div className="text-editor">
      <label htmlFor="extracted-text">النص المستخرج</label>
      <textarea
        id="extracted-text"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        dir="rtl"
        lang="ar"
        placeholder="سيظهر النص المستخرج هنا..."
        rows={12}
      />
    </div>
  );
}
