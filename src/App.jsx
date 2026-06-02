import { useState, useCallback, useEffect } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import Library from './components/Library';
import BookReader from './components/BookReader';
import ErrorBoundary from './components/ErrorBoundary';
import { cleanupOldAudio } from './utils/api.js';
import { clearAllData } from './utils/offlineCache.js';
import './App.css';

function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [ttsApiKey, setTtsApiKey] = useState(
    () => localStorage.getItem('tts_api_key') || ''
  );
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    cleanupOldAudio().catch(() => {});
  }, []);
  const [activeBookId, setActiveBookId] = useState(null);

  const handleOpenBook = useCallback((bookId) => {
    setActiveBookId(bookId);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    setActiveBookId(null);
  }, []);

  // Reader mode: full-screen immersive
  if (apiKey && activeBookId) {
    return (
      <ErrorBoundary
        key={activeBookId}
        onBack={handleBackToLibrary}
        onReset={() => {}}
      >
        <BookReader
          bookId={activeBookId}
          apiKey={apiKey}
          ttsApiKey={ttsApiKey}
          onBack={handleBackToLibrary}
        />
      </ErrorBoundary>
    );
  }

  // Library mode
  return (
    <div className="app-shell" dir="rtl" lang="ar">
      <header className="app-header">
        <h1>مكتبتي</h1>
      </header>

      <main className="app-main">
        <ApiKeyInput
          apiKey={apiKey}
          ttsApiKey={ttsApiKey}
          onSave={setApiKey}
          onSaveTTS={setTtsApiKey}
        />

        {apiKey && (
          <Library apiKey={apiKey} onOpenBook={handleOpenBook} />
        )}

        {!clearConfirm ? (
          <button
            className="clear-all-data-btn"
            onClick={() => setClearConfirm(true)}
          >
            مسح جميع البيانات المحفوظة
          </button>
        ) : (
          <div className="clear-confirm-row">
            <span>هل أنت متأكد؟ سيتم حذف كل شيء</span>
            <button
              className="clear-all-data-btn confirm"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                await clearAllData();
                window.location.reload();
              }}
            >
              {clearing ? 'جاري الحذف...' : 'نعم، احذف'}
            </button>
            <button
              className="clear-all-data-btn"
              onClick={() => setClearConfirm(false)}
            >
              إلغاء
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
