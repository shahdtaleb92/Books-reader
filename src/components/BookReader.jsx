import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBook, fetchPageTexts, savePageText, getBookPdfUrl, saveReadingPosition } from '../utils/api.js';
import { pdfToImages } from '../utils/pdfToImages.js';
import { useGeminiOCR } from '../hooks/useGeminiOCR.js';
import { usePageTTS } from '../hooks/usePageTTS.js';
import RealtimeTTS from './RealtimeTTS.jsx';

export default function BookReader({ bookId, apiKey, ttsApiKey, onBack }) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [texts, setTexts] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingBook, setLoadingBook] = useState(true);
  const [error, setError] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const positionTimerRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const readingRef = useRef(null);

  const { extractText, loading: ocrLoading } = useGeminiOCR(apiKey);
  const pageTTS = usePageTTS(ttsApiKey, bookId);

  const totalPages = book?.source_type === 'pdf' ? pages.length : (book?.total_pages || 0);

  // Auto page flip on TTS finish
  useEffect(() => {
    pageTTS.onPageFinishedRef.current = (finishedPage) => {
      const nextPage = pageTTS.findNextNonEmptyPage(finishedPage + 1);
      if (nextPage >= 0 && nextPage < totalPages) {
        setCurrentPage(nextPage);
        const nextText = texts[nextPage];
        if (nextText && nextText.trim()) {
          pageTTS.playPage(nextPage, nextText);
        }
      }
    };
    return () => { pageTTS.onPageFinishedRef.current = null; };
  }, [pageTTS, texts, totalPages]);

  // Load book
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingBook(true);
        const [bookData, pageTexts] = await Promise.all([
          fetchBook(bookId),
          fetchPageTexts(bookId),
        ]);
        if (cancelled) return;
        setBook(bookData);
        setTexts(pageTexts);
        if (bookData.last_page > 0) setCurrentPage(bookData.last_page);

        if (bookData.source_type === 'pdf') {
          const pdfUrl = getBookPdfUrl(bookId);
          const res = await fetch(pdfUrl);
          const blob = await res.blob();
          const file = new File([blob], bookData.filename, { type: 'application/pdf' });
          const images = await pdfToImages(file);
          if (!cancelled) setPages(images);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingBook(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  // Always keep texts ref updated (needed for auto page flip)
  useEffect(() => {
    if (Object.keys(texts).length > 0) {
      pageTTS.updateTexts(texts);
    }
  }, [texts]);

  // Only prefetch TTS audio when actively playing - don't waste API quota on navigation
  useEffect(() => {
    if (ttsApiKey && pageTTS.playing && Object.keys(texts).length > 0) {
      pageTTS.prefetchPages(currentPage, texts);
    }
  }, [currentPage, texts, ttsApiKey, pageTTS.playing]);

  // Auto-read is handled by onPageFinishedRef callback (auto page flip)
  // No separate auto-read effect needed - it was causing unwanted API calls

  // Save position
  useEffect(() => {
    if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
    positionTimerRef.current = setTimeout(() => {
      saveReadingPosition(bookId, currentPage).catch(() => {});
    }, 1000);
    return () => { if (positionTimerRef.current) clearTimeout(positionTimerRef.current); };
  }, [currentPage, bookId]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!showTTS && !editMode) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [showTTS, editMode]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [currentPage]);

  // Keep controls visible when TTS panel or edit mode is open
  useEffect(() => {
    if (showTTS || editMode) {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    }
  }, [showTTS, editMode]);

  const handlePageChange = useCallback(
    async (pageIndex) => {
      if (pageIndex < 0 || pageIndex >= totalPages) return;
      pageTTS.stop();
      setCurrentPage(pageIndex);
      if (texts[pageIndex] === undefined && pages[pageIndex] && apiKey) {
        const text = await extractText(pages[pageIndex]);
        setTexts((prev) => ({ ...prev, [pageIndex]: text }));
        savePageText(bookId, pageIndex, text).catch(console.error);
      }
    },
    [pages, texts, extractText, pageTTS, bookId, apiKey, totalPages]
  );

  const handleTextChange = useCallback((newText) => {
    setTexts((prev) => ({ ...prev, [currentPage]: newText }));
  }, [currentPage]);

  const handlePlayCurrentPage = useCallback(() => {
    const text = texts[currentPage];
    if (text) pageTTS.playPage(currentPage, text);
  }, [currentPage, texts, pageTTS]);

  const handleWordClick = useCallback((wordIndex) => {
    const text = texts[currentPage];
    if (text && pageTTS.playing) pageTTS.playFromPosition(wordIndex, text);
  }, [currentPage, texts, pageTTS]);

  const handlePageTap = useCallback((e) => {
    // Don't flip pages on tap - only toggle controls
    // This prevents conflicts with word clicking for TTS positioning
    if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .tts-panel, textarea, button, select, input, .word, .word-active')) return;
    resetControlsTimer();
  }, [resetControlsTimer]);

  const currentText = texts[currentPage] || '';

  // Auto-scroll to active sentence
  useEffect(() => {
    if (!pageTTS.playing || pageTTS.currentWordIndex < 0 || !readingRef.current) return;
    const container = readingRef.current;
    const el = container.querySelector('.word-active');
    if (el) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const relativeTop = elRect.top - containerRect.top + container.scrollTop;
      const target = relativeTop - containerRect.height / 3;
      container.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, [pageTTS.currentWordIndex, pageTTS.playing]);

  // Split text into sentences
  const splitIntoSentences = (text) => {
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
  };

  if (loadingBook) {
    return (
      <div className="ereader" dir="rtl" lang="ar">
        <div className="ereader-loading">
          <div className="loading-book-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <span>جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ereader" dir="rtl" lang="ar">
        <div className="ereader-error">
          <div className="error">{error}</div>
          <button onClick={onBack}>العودة للمكتبة</button>
        </div>
      </div>
    );
  }

  const sentences = currentText ? splitIntoSentences(currentText) : [];
  const isPlaying = pageTTS.playing && currentText && pageTTS.currentWordIndex >= 0;

  return (
    <div className="ereader" dir="rtl" lang="ar" onClick={handlePageTap}>
      {/* Top bar */}
      <div className={`reader-top-bar ${showControls ? 'visible' : ''}`}>
        <button onClick={onBack} className="back-btn" aria-label="العودة">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </button>
        <span className="reader-title">{book?.title}</span>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`edit-toggle-btn ${editMode ? 'active' : ''}`}
          aria-label="تعديل النص"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {/* Page area */}
      <div className="page-container">
        <div className={`book-page ${editMode ? 'edit-mode' : ''}`}>
          {ocrLoading && (
            <div className="page-loading">جاري استخراج النص...</div>
          )}

          {!ocrLoading && editMode && (
            <textarea
              className="page-textarea"
              value={currentText}
              onChange={(e) => handleTextChange(e.target.value)}
              dir="rtl"
              lang="ar"
              placeholder="سيظهر النص هنا..."
            />
          )}

          {!ocrLoading && !editMode && (
            <div className="page-text" ref={readingRef} dir="rtl" lang="ar">
              {!currentText && (
                <div className="page-empty">لا يوجد نص في هذه الصفحة</div>
              )}
              {currentText && !isPlaying && (
                <p className="page-content">{currentText}</p>
              )}
              {isPlaying && sentences.map((sentence, si) => {
                const wordIndices = sentence.filter(s => s.type === 'word').map(s => s.wordIndex);
                const isActiveSentence = wordIndices.length > 0 &&
                  pageTTS.currentWordIndex >= wordIndices[0] &&
                  pageTTS.currentWordIndex <= wordIndices[wordIndices.length - 1];

                return (
                  <span key={si} className={isActiveSentence ? 'sentence-active' : 'sentence'}>
                    {sentence.map((seg, wi) => {
                      if (seg.type === 'space') return <span key={`${si}-${wi}`}>{seg.text}</span>;
                      const isActiveWord = seg.wordIndex === pageTTS.currentWordIndex;
                      return (
                        <span
                          key={`${si}-${wi}`}
                          className={isActiveWord ? 'word-active' : 'word'}
                          onClick={() => handleWordClick(seg.wordIndex)}
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
          )}

          {/* Page number */}
          <div className="page-number">
            {currentPage + 1} / {totalPages}
          </div>
        </div>
      </div>


      {/* Bottom bar */}
      <div className={`reader-bottom-bar ${showControls ? 'visible' : ''}`}>
        {/* Page navigation */}
        <div className="bottom-nav">
          {/* In RTL flexbox: first element = right side of screen
              Arabic books: right = previous (where you came from), left = next (where you're going)
              So: first button (right side) = previous, last button (left side) = next */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 0 || ocrLoading}
            className="nav-btn"
            aria-label="الصفحة السابقة"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <div className="page-input-area">
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage + 1}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= totalPages) handlePageChange(val - 1);
              }}
              className="page-input"
              dir="ltr"
            />
            <span className="page-label">/ {totalPages}</span>
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages - 1 || ocrLoading}
            className="nav-btn"
            aria-label="الصفحة التالية"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* TTS toggle + controls */}
        {ttsApiKey && currentText && (
          <div className="tts-section">
            <div className="tts-inline-controls">
              {!pageTTS.playing && !pageTTS.generating && (
                <button onClick={handlePlayCurrentPage} className="tts-play-btn" aria-label="تشغيل">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                </button>
              )}
              {pageTTS.generating && !pageTTS.playing && (
                <button disabled className="tts-play-btn generating">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" opacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                    </path>
                  </svg>
                </button>
              )}
              {pageTTS.playing && !pageTTS.paused && (
                <button onClick={pageTTS.pause} className="tts-play-btn" aria-label="إيقاف مؤقت">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </button>
              )}
              {pageTTS.playing && pageTTS.paused && (
                <button onClick={pageTTS.resume} className="tts-play-btn" aria-label="استئناف">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                </button>
              )}

              {(pageTTS.playing || pageTTS.paused) && (
                <>
                  {/* RTL flexbox: first = right side. Right = backward in time, Left = forward */}
                  <button onClick={() => pageTTS.seekBy(-10)} className="tts-seek-btn" aria-label="رجوع">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                  </button>
                  <button onClick={() => pageTTS.seekBy(10)} className="tts-seek-btn" aria-label="تقديم">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 4v6h-6" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                </>
              )}

              {(pageTTS.playing || pageTTS.generating) && (
                <button onClick={pageTTS.stop} className="tts-stop-btn" aria-label="إيقاف">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              )}

              <button
                onClick={() => setShowTTS(!showTTS)}
                className={`tts-settings-btn ${showTTS ? 'active' : ''}`}
                aria-label="إعدادات الصوت"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            {/* Expanded TTS settings panel */}
            {showTTS && (
              <div className="tts-panel">
                <RealtimeTTS
                  arabicVoices={pageTTS.arabicVoices}
                  selectedVoice={pageTTS.selectedVoice}
                  onVoiceChange={pageTTS.setSelectedVoice}
                  playing={pageTTS.playing}
                  paused={pageTTS.paused}
                  generating={pageTTS.generating}
                  autoRead={pageTTS.autoRead}
                  onAutoReadChange={pageTTS.setAutoRead}
                  currentPage={currentPage}
                  onPlay={handlePlayCurrentPage}
                  onPause={pageTTS.pause}
                  onResume={pageTTS.resume}
                  onStop={pageTTS.stop}
                  onSeekBy={pageTTS.seekBy}
                  onClearAudio={pageTTS.clearPageAudio}
                  isPageCached={pageTTS.isPageCached}
                  isPageSaved={pageTTS.isPageSaved}
                  error={pageTTS.error}
                  playbackRate={pageTTS.playbackRate}
                  onPlaybackRateChange={pageTTS.setPlaybackRate}
                />
              </div>
            )}
          </div>
        )}

        {pageTTS.error && (
          <div className="tts-error">{pageTTS.error}</div>
        )}
      </div>
    </div>
  );
}
