import { useState, useEffect, useCallback } from 'react';
import { fetchBook, fetchPageTexts, savePageText, getBookPdfUrl } from '../utils/api.js';
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

  const { extractText, loading: ocrLoading } = useGeminiOCR(apiKey);
  const pageTTS = usePageTTS(ttsApiKey);

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

        // Load PDF pages as images for display
        const pdfUrl = getBookPdfUrl(bookId);
        const res = await fetch(pdfUrl);
        const blob = await res.blob();
        const file = new File([blob], bookData.filename, { type: 'application/pdf' });
        const images = await pdfToImages(file);
        if (cancelled) return;
        setPages(images);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingBook(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  // Pre-fetch TTS for surrounding pages when page changes
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

  const handlePageChange = useCallback(
    async (pageIndex) => {
      pageTTS.stop();
      setCurrentPage(pageIndex);

      // If text not extracted yet, run OCR
      if (texts[pageIndex] === undefined && pages[pageIndex] && apiKey) {
        const text = await extractText(pages[pageIndex]);
        setTexts((prev) => ({ ...prev, [pageIndex]: text }));
        // Save to server
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

      {pages.length > 1 && (
        <PageNavigator
          currentPage={currentPage}
          totalPages={pages.length}
          onPageChange={handlePageChange}
          loading={ocrLoading}
        />
      )}

      <TextEditor
        text={currentText}
        onChange={handleTextChange}
        loading={ocrLoading}
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
          isPageCached={pageTTS.isPageCached}
          error={pageTTS.error}
        />
      )}
    </div>
  );
}
