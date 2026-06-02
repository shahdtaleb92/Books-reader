import { useState, useEffect, useCallback } from 'react';
import { fetchBooks, uploadBook, deleteBook, saveExtractedTexts, createTextBook, createBookFromUrl } from '../utils/api.js';
import { pdfToImages } from '../utils/pdfToImages.js';
import { useGeminiOCR } from '../hooks/useGeminiOCR.js';

const CONCURRENT_OCR = 3;

// Book cover color palette
const COVER_COLORS = [
  ['#2D1B69', '#1a1145'],
  ['#1B3A4B', '#0f2330'],
  ['#4A1942', '#2d0f28'],
  ['#1B4332', '#0f2a1f'],
  ['#3D2B1F', '#261a13'],
  ['#1E3A5F', '#122540'],
  ['#5C2D2D', '#3b1c1c'],
  ['#2D4A3E', '#1a2e26'],
];

function getCoverColor(id) {
  const idx = typeof id === 'string'
    ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    : id;
  return COVER_COLORS[idx % COVER_COLORS.length];
}

const SourceBadge = ({ type }) => {
  const labels = { pdf: 'PDF', text: 'TXT', url: 'URL', docx: 'DOCX' };
  return <span className="cover-badge">{labels[type] || 'TXT'}</span>;
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

  useEffect(() => { loadBooks(); }, [loadBooks]);

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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt' || file.type === 'text/plain') {
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
      } catch (e) { setError(e.message); }
      finally { setUploading(false); }
    } else if (ext === 'docx') {
      setUploading(true);
      setError(null);
      try { await uploadBook(file); await loadBooks(); }
      catch (e) { setError(e.message); }
      finally { setUploading(false); }
    } else if (ext === 'pdf' || file.type === 'application/pdf') {
      await handlePdfUpload(file);
    } else {
      setError('نوع الملف غير مدعوم. الأنواع المدعومة: PDF, TXT, DOCX');
    }
  };

  const handlePaste = async () => {
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) { setError('الحافظة فارغة'); return; }
      setUploading(true);
      await createTextBook('نص ملصوق - ' + new Date().toLocaleDateString('ar-EG'), text);
      await loadBooks();
    } catch (e) { setError('تعذر القراءة من الحافظة: ' + e.message); }
    finally { setUploading(false); }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    setLoadingUrl(true);
    setError(null);
    try {
      await createBookFromUrl(urlInput.trim());
      setUrlInput('');
      await loadBooks();
    } catch (e) { setError(e.message); }
    finally { setLoadingUrl(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف هذا الكتاب؟')) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) { setError(e.message); }
  };

  const filteredBooks = search
    ? books.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
    : books;

  return (
    <div className="library">
      {/* Add sources */}
      <div className="add-sources">
        <div className="source-row">
          <label className="upload-btn" htmlFor="library-upload">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'جاري الرفع...' : 'رفع ملف'}
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            لصق نص
          </button>
        </div>

        <div className="url-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="رابط مقال..."
            dir="ltr"
            disabled={loadingUrl}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          />
          <button onClick={handleUrlSubmit} disabled={loadingUrl || !urlInput.trim()}>
            {loadingUrl ? '...' : 'جلب'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {extractionProgress && (
        <div className="extraction-progress">
          {extractionProgress.stage === 'converting' && <span>جاري تحويل الصفحات...</span>}
          {extractionProgress.stage === 'extracting' && (
            <>
              <span>استخراج النص: {extractionProgress.current}/{extractionProgress.total}</span>
              <div className="ocr-progress-bar-container">
                <div className="ocr-progress-bar" style={{ width: `${(extractionProgress.current / extractionProgress.total) * 100}%` }} />
              </div>
            </>
          )}
          {extractionProgress.stage === 'saving' && <span>جاري الحفظ...</span>}
        </div>
      )}

      {/* Search */}
      {books.length > 3 && (
        <div className="library-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث..."
            dir="rtl"
          />
        </div>
      )}

      {books.length === 0 && !uploading && (
        <div className="library-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <p>ارفع ملف أو الصق نص للبدء</p>
        </div>
      )}

      {/* Book grid */}
      <div className="book-grid">
        {filteredBooks.map((book) => {
          const [bg, bgDark] = getCoverColor(book.id);
          return (
            <div key={book.id} className="book-card" onClick={() => onOpenBook(book.id)}>
              <div className="book-cover" style={{ background: `linear-gradient(145deg, ${bg}, ${bgDark})` }}>
                <SourceBadge type={book.source_type} />
                <div className="cover-title">{book.title}</div>
                <div className="cover-pages">{book.total_pages} صفحة</div>
              </div>
              <div className="book-meta">
                <span className="book-meta-title">{book.title}</span>
                <span className="book-meta-date">{new Date(book.created_at).toLocaleDateString('ar-EG')}</span>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => { e.stopPropagation(); handleDelete(book.id); }}
                aria-label="حذف الكتاب"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
