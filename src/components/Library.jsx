import { useState, useEffect, useCallback } from 'react';
import { fetchBooks, uploadBook, deleteBook, saveExtractedTexts, createTextBook, createBookFromUrl } from '../utils/api.js';
import { pdfToImages } from '../utils/pdfToImages.js';
import { useGeminiOCR } from '../hooks/useGeminiOCR.js';

const CONCURRENT_OCR = 3;

const SOURCE_ICONS = {
  pdf: '📕',
  text: '📝',
  url: '🌐',
  docx: '📄',
};

export default function Library({ apiKey, onOpenBook }) {
  const [books, setBooks] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
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

  // PDF upload with OCR
  const handlePdfUpload = async (file) => {
    setUploading(true);
    setError(null);
    try {
      setExtractionProgress({ stage: 'converting', current: 0, total: 0 });
      const images = await pdfToImages(file);

      const book = await uploadBook(file, images.length);

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

      setExtractionProgress({ stage: 'saving', current: 0, total: 0 });
      await saveExtractedTexts(book.id, texts, images.length);
      await loadBooks();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setExtractionProgress(null);
    }
  };

  // File input handler (PDF, TXT, DOCX)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt' || file.type === 'text/plain') {
      // Text file - read content and create text book
      setUploading(true);
      setError(null);
      try {
        const text = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsText(file, 'utf-8');
        });
        await createTextBook(file.name.replace(/\.txt$/i, ''), text);
        await loadBooks();
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(false);
      }
    } else if (ext === 'docx') {
      // DOCX - upload to server for mammoth processing
      setUploading(true);
      setError(null);
      try {
        await uploadBook(file);
        await loadBooks();
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(false);
      }
    } else if (file.type === 'application/pdf') {
      await handlePdfUpload(file);
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setError('الحافظة فارغة');
        return;
      }
      setUploading(true);
      await createTextBook('نص ملصوق - ' + new Date().toLocaleDateString('ar-EG'), text);
      await loadBooks();
    } catch (e) {
      setError('تعذر القراءة من الحافظة: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  // URL article extraction
  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    setLoadingUrl(true);
    setError(null);
    try {
      await createBookFromUrl(urlInput.trim());
      setUrlInput('');
      await loadBooks();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف هذا الكتاب؟')) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const filteredBooks = search
    ? books.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
    : books;

  return (
    <div className="library">
      <div className="library-header">
        <h2>المكتبة</h2>
      </div>

      {/* Add content sources */}
      <div className="add-sources">
        <div className="source-row">
          <label className="upload-btn" htmlFor="library-upload">
            {uploading ? 'جاري الرفع...' : 'رفع ملف (PDF, TXT, DOCX)'}
          </label>
          <input
            id="library-upload"
            type="file"
            accept=".pdf,.txt,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <button onClick={handlePaste} disabled={uploading} className="paste-btn">
            لصق من الحافظة
          </button>
        </div>

        <div className="url-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="أدخل رابط مقال..."
            dir="ltr"
            disabled={loadingUrl}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          />
          <button onClick={handleUrlSubmit} disabled={loadingUrl || !urlInput.trim()}>
            {loadingUrl ? 'جاري...' : 'جلب المقال'}
          </button>
        </div>
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

      {/* Search */}
      {books.length > 0 && (
        <div className="library-search">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في المكتبة..."
            dir="rtl"
          />
        </div>
      )}

      {books.length === 0 && !uploading && (
        <div className="library-empty">
          <p>لا توجد كتب بعد. ارفع ملف أو الصق نص للبدء.</p>
        </div>
      )}

      <div className="book-grid">
        {filteredBooks.map((book) => (
          <div key={book.id} className="book-card" onClick={() => onOpenBook(book.id)}>
            <div className="book-icon">{SOURCE_ICONS[book.source_type] || '📖'}</div>
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
