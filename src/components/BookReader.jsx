import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBook, fetchPageTexts, savePageText, getBookPdfUrl, saveReadingPosition } from '../utils/api.js';
import { pdfToImages } from '../utils/pdfToImages.js';
import { useGeminiOCR } from '../hooks/useGeminiOCR.js';
import { usePageTTS } from '../hooks/usePageTTS.js';
import PageNavigator from './PageNavigator.jsx';
import TextEditor from './TextEditor.jsx';
import RealtimeTTS from './RealtimeTTS.jsx';

export default function BookReader({ bookId, apiKey, ttsApiKey, onBack }) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [texts, setTexts] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingBook, setLoadingBook] = useState(true);
  const [error, setError] = useState(null);
  const positionTimerRef = useRef(null);

  const { extractText, loading: ocrLoading } = useGeminiOCR(apiKey);
  const pageTTS = usePageTTS(ttsApiKey, bookId);

  // Load book data and texts
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

        // Restore reading position
        if (bookData.last_page > 0) {
          setCurrentPage(bookData.last_page);
        }

        // Load PDF pages as images (only for PDF books)
        if (bookData.source_type === 'pdf') {
          const pdfUrl = getBookPdfUrl(bookId);
          const res = await fetch(pdfUrl);
          const blob = await res.blob();
          const file = new File([blob], bookData.filename, { type: 'application/pdf' });
          const images = await pdfToImages(file);
          if (cancelled) return;
          setPages(images);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingBook(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  // Pre-fetch TTS for surrounding pages
  useEffect(() => {
    if (ttsApiKey && Object.keys(texts).length > 0) {
      pageTTS.prefetchPages(currentPage, texts);
    }
  }, [currentPage, texts, ttsApiKey]);

  // Auto-read on page change
  useEffect(() => {
    if (pageTTS.autoRead && ttsApiKey && texts[currentPage]) {
      pageTTS.playPage(currentPage, texts[currentPage]);
    }
  }, [currentPage, pageTTS.autoRead]);

  // Save reading position (debounced)
  useEffect(() => {
    if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
    positionTimerRef.current = setTimeout(() => {
      saveReadingPosition(bookId, currentPage).catch(() => {});
    }, 1000);
    return () => {
      if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
    };
  }, [currentPage, bookId]);

  const totalPages = book?.source_type === 'pdf' ? pages.length : (book?.total_pages || 0);

  const handlePageChange = useCallback(
    async (pageIndex) => {
      pageTTS.stop();
      setCurrentPage(pageIndex);

      // If text not extracted yet for PDF, run OCR
      if (texts[pageIndex] === undefined && pages[pageIndex] && apiKey) {
        const text = await extractText(pages[pageIndex]);
        setTexts((prev) => ({ ...prev, [pageIndex]: text }));
        savePageText(bookId, pageIndex, text).catch(console.error);
      }
    },
    [pages, texts, extractText, pageTTS, bookId, apiKey]
  );

  const handleTextChange = useCallback(
    (newText) => {
      setTexts((prev) => ({ ...prev, [currentPage]: newText }));
    },
    [currentPage]
  );

  const handlePlayCurrentPage = useCallback(() => {
    const text = texts[currentPage];
    if (text) {
      pageTTS.playPage(currentPage, text);
    }
  }, [currentPage, texts, pageTTS]);

  const currentText = texts[currentPage] || '';

  if (loadingBook) {
    return (
      <div className="book-reader">
        <div className="loading">جاري تحميل الكتاب...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="book-reader">
        <div className="error">{error}</div>
        <button onClick={onBack}>العودة للمكتبة</button>
      </div>
    );
  }

  return (
    <div className="book-reader">
      <div className="reader-header">
        <button onClick={onBack} className="back-btn">العودة للمكتبة</button>
        {book && <h2>{book.title}</h2>}
      </div>

      {totalPages > 1 && (
        <PageNavigator
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          loading={ocrLoading}
        />
      )}

      <TextEditor
        text={currentText}
        onChange={handleTextChange}
        loading={ocrLoading}
        playing={pageTTS.playing}
        currentWordIndex={pageTTS.currentWordIndex}
      />

      {ttsApiKey && currentText && (
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
          onClearAudio={pageTTS.clearPageAudio}
          isPageCached={pageTTS.isPageCached}
          isPageSaved={pageTTS.isPageSaved}
          error={pageTTS.error}
          playbackRate={pageTTS.playbackRate}
          onPlaybackRateChange={pageTTS.setPlaybackRate}
        />
      )}
    </div>
  );
}
