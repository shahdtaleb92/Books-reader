import { useState, useEffect, useCallback } from 'react';
import { fetchBooks, uploadBook, deleteBook, saveExtractedTexts } from '../utils/api.js';
import { pdfToImages } from '../utils/pdfToImages.js';
import { useGeminiOCR } from '../hooks/useGeminiOCR.js';

const CONCURRENT_OCR = 3;

export default function Library({ apiKey, onOpenBook }) {
  const [books, setBooks] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(null);
  const [error, setError] = useState(null);
  const { extractText } = useGeminiOCR(apiKey);

  const loadBooks = useCallback(async () => {
    try {
      const data = await fetchBooks();
      setBooks(data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    e.target.value = '';

    setUploading(true);
    setError(null);

    try {
      // Convert PDF to images for OCR
      setExtractionProgress({ stage: 'converting', current: 0, total: 0 });
      const images = await pdfToImages(file);

      // Upload PDF to server
      const book = await uploadBook(file, images.length);

      // Run OCR on all pages
      setExtractionProgress({ stage: 'extracting', current: 0, total: images.length });
      const texts = {};
      let completed = 0;

      for (let batchStart = 0; batchStart < images.length; batchStart += CONCURRENT_OCR) {
        const batchEnd = Math.min(batchStart + CONCURRENT_OCR, images.length);
        const batch = [];

        for (let i = batchStart; i < batchEnd; i++) {
          batch.push(
            (async () => {
              const text = await extractText(images[i]);
              texts[i] = text;
              completed++;
              setExtractionProgress({ stage: 'extracting', current: completed, total: images.length });
            })()
          );
        }
        await Promise.all(batch);
      }

      // Save all extracted texts to server
      setExtractionProgress({ stage: 'saving', current: 0, total: 0 });
      await saveExtractedTexts(book.id, texts, images.length);

      setExtractionProgress(null);
      await loadBooks();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setExtractionProgress(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="library">
      <div className="library-header">
        <h2>المكتبة</h2>
        <label className="upload-btn" htmlFor="library-upload">
          {uploading ? 'جاري الرفع...' : 'رفع كتاب جديد'}
        </label>
        <input
          id="library-upload"
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="error">{error}</div>}

      {extractionProgress && (
        <div className="extraction-progress">
          {extractionProgress.stage === 'converting' && (
            <span>جاري تحويل صفحات PDF إلى صور...</span>
          )}
          {extractionProgress.stage === 'extracting' && (
            <>
              <span>
                جاري استخراج النص: {extractionProgress.current} من {extractionProgress.total}
              </span>
              <div className="ocr-progress-bar-container">
                <div
                  className="ocr-progress-bar"
                  style={{
                    width: `${(extractionProgress.current / extractionProgress.total) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
          {extractionProgress.stage === 'saving' && <span>جاري حفظ النصوص...</span>}
        </div>
      )}

      {books.length === 0 && !uploading && (
        <div className="library-empty">
          <p>لا توجد كتب بعد. ارفع كتاب PDF للبدء.</p>
        </div>
      )}

      <div className="book-grid">
        {books.map((book) => (
          <div key={book.id} className="book-card" onClick={() => onOpenBook(book.id)}>
            <div className="book-icon">📖</div>
            <div className="book-info">
              <h3>{book.title}</h3>
              <p>{book.total_pages} صفحة</p>
              <p className="book-date">
                {new Date(book.created_at).toLocaleDateString('ar-EG')}
              </p>
            </div>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(book.id);
              }}
              title="حذف"
            >
              حذف
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
