import { useState, useCallback, useEffect } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import Library from './components/Library';
import BookReader from './components/BookReader';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import { cleanupOldAudio, logoutUser, deleteAllMyBooks } from './utils/api.js';
import { clearOfflineCacheOnly } from './utils/offlineCache.js';
import { isLoggedIn, onAuthChange, getUsername, clearAuth } from './utils/auth.js';
import './App.css';

function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [ttsApiKey, setTtsApiKey] = useState(
    () => localStorage.getItem('tts_api_key') || ''
  );
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeBookId, setActiveBookId] = useState(null);

  // Re-render on login/logout (including auto-logout on an expired session)
  useEffect(() => onAuthChange(() => {
    setAuthed(isLoggedIn());
    setActiveBookId(null);
  }), []);

  useEffect(() => {
    if (authed) cleanupOldAudio().catch(() => {});
  }, [authed]);

  const handleOpenBook = useCallback((bookId) => {
    setActiveBookId(bookId);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    setActiveBookId(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutUser();
    await clearOfflineCacheOnly();
    clearAuth();
  }, []);

  // Not logged in → show the login/register screen
  if (!authed) {
    return <Login />;
  }

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
        <div className="app-header-user">
          <span className="app-username">{getUsername()}</span>
          <button className="logout-btn" onClick={handleLogout}>
            خروج
          </button>
        </div>
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
            حذف جميع كتبي
          </button>
        ) : (
          <div className="clear-confirm-row">
            <span>هل أنت متأكد؟ سيتم حذف كل كتبك نهائياً</span>
            <button
              className="clear-all-data-btn confirm"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  await deleteAllMyBooks();
                } catch { /* ignore */ }
                await clearOfflineCacheOnly();
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
