import { useState, useCallback, useEffect } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import Library from './components/Library';
import BookReader from './components/BookReader';
import { cleanupOldAudio } from './utils/api.js';
import './App.css';

function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [ttsApiKey, setTtsApiKey] = useState(
    () => localStorage.getItem('tts_api_key') || ''
  );

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
      <BookReader
        bookId={activeBookId}
        apiKey={apiKey}
        ttsApiKey={ttsApiKey}
        onBack={handleBackToLibrary}
      />
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
      </main>
    </div>
  );
}

export default App;
