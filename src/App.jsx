import { useState, useCallback } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import Library from './components/Library';
import BookReader from './components/BookReader';
import './App.css';

function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [ttsApiKey, setTtsApiKey] = useState(
    () => localStorage.getItem('tts_api_key') || ''
  );
  const [activeBookId, setActiveBookId] = useState(null);

  const handleOpenBook = useCallback((bookId) => {
    setActiveBookId(bookId);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    setActiveBookId(null);
  }, []);

  return (
    <div className="app" dir="rtl" lang="ar">
      <header>
        <h1>قارئ الكتب العربية</h1>
        <p>استخراج النصوص العربية من PDF وقراءتها بصوت عالٍ</p>
      </header>

      <main>
        <ApiKeyInput
          apiKey={apiKey}
          ttsApiKey={ttsApiKey}
          onSave={setApiKey}
          onSaveTTS={setTtsApiKey}
        />

        {apiKey && !activeBookId && (
          <Library apiKey={apiKey} onOpenBook={handleOpenBook} />
        )}

        {apiKey && activeBookId && (
          <BookReader
            bookId={activeBookId}
            apiKey={apiKey}
            ttsApiKey={ttsApiKey}
            onBack={handleBackToLibrary}
          />
        )}
      </main>
    </div>
  );
}

export default App;
