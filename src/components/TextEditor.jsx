import { useRef, useEffect, useMemo } from 'react';

// Split text into sentences for grouped highlighting
function splitIntoSentences(text) {
  // Split on Arabic/general sentence-ending punctuation, keeping the delimiter
  const parts = text.split(/(?<=[.؟!。\n])\s*/);
  const sentences = [];
  let globalWordIdx = 0;

  for (const part of parts) {
    if (!part) continue;
    const words = part.split(/(\s+)/);
    const sentenceWords = [];
    for (const segment of words) {
      if (/^\s+$/.test(segment)) {
        sentenceWords.push({ type: 'space', text: segment });
      } else {
        sentenceWords.push({ type: 'word', text: segment, wordIndex: globalWordIdx });
        globalWordIdx++;
      }
    }
    sentences.push(sentenceWords);
  }
  return sentences;
}

export default function TextEditor({ text, onChange, loading, playing, currentWordIndex, onWordClick }) {
  const readingRef = useRef(null);

  // Auto-scroll to active sentence
  useEffect(() => {
    if (!playing || currentWordIndex < 0 || !readingRef.current) return;
    const container = readingRef.current;
    const activeSentence = container.querySelector('.sentence-active');
    if (activeSentence) {
      const containerRect = container.getBoundingClientRect();
      const sentenceRect = activeSentence.getBoundingClientRect();
      const sentenceRelativeTop = sentenceRect.top - containerRect.top + container.scrollTop;
      const targetScroll = sentenceRelativeTop - containerRect.height / 3;
      container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }, [currentWordIndex, playing]);

  const sentences = useMemo(() => {
    if (!text) return [];
    return splitIntoSentences(text);
  }, [text]);

  if (loading) {
    return (
      <div className="text-editor">
        <label>جاري الاستخراج</label>
        <div className="loading">جاري استخراج النص...</div>
      </div>
    );
  }

  // Reading mode: sentence-level highlighting with word-level active marker
  if (playing && text && currentWordIndex >= 0) {
    return (
      <div className="text-editor">
        <label>اضغط على كلمة للقراءة منها</label>
        <div className="reading-text" ref={readingRef} dir="rtl" lang="ar">
          {sentences.map((sentence, si) => {
            // Check if the active word is in this sentence
            const wordIndices = sentence
              .filter((s) => s.type === 'word')
              .map((s) => s.wordIndex);
            const isActiveSentence =
              wordIndices.length > 0 &&
              currentWordIndex >= wordIndices[0] &&
              currentWordIndex <= wordIndices[wordIndices.length - 1];

            return (
              <span
                key={si}
                className={isActiveSentence ? 'sentence-active' : 'sentence'}
              >
                {sentence.map((seg, wi) => {
                  if (seg.type === 'space') {
                    return <span key={`${si}-${wi}`}>{seg.text}</span>;
                  }
                  const isActiveWord = seg.wordIndex === currentWordIndex;
                  return (
                    <span
                      key={`${si}-${wi}`}
                      className={isActiveWord ? 'word-active' : 'word'}
                      onClick={() => onWordClick && onWordClick(seg.wordIndex)}
                      role="button"
                      tabIndex={-1}
                    >
                      {seg.text}
                    </span>
                  );
                })}
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
      <label htmlFor="extracted-text">النص</label>
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
