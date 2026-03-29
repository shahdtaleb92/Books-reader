import { useState, useCallback } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import FileUploader from './components/FileUploader';
import PageNavigator from './components/PageNavigator';
import TextEditor from './components/TextEditor';
import TTSControls from './components/TTSControls';
import { useGeminiOCR } from './hooks/useGeminiOCR';
import { useTTS } from './hooks/useTTS';
import { pdfToImages } from './utils/pdfToImages';
import './App.css';

function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [pages, setPages] = useState([]);
  const [texts, setTexts] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [fileName, setFileName] = useState('');

  const { extractText, loading, error } = useGeminiOCR(apiKey);
  const tts = useTTS();

  const handleFileSelect = useCallback(
    async (file) => {
      tts.stop();
      setTexts({});
      setCurrentPage(0);
      setFileName(file.name);

      let imageList;
      if (file.type === 'application/pdf') {
        imageList = await pdfToImages(file);
      } else {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        imageList = [base64];
      }

      setPages(imageList);

      if (imageList.length > 0) {
        const text = await extractText(imageList[0]);
        setTexts({ 0: text });
      }
    },
    [extractText, tts]
  );

  const handlePageChange = useCallback(
    async (pageIndex) => {
      tts.stop();
      setCurrentPage(pageIndex);

      if (texts[pageIndex] === undefined && pages[pageIndex]) {
        const text = await extractText(pages[pageIndex]);
        setTexts((prev) => ({ ...prev, [pageIndex]: text }));
      }
    },
    [pages, texts, extractText, tts]
  );

  const handleTextChange = useCallback(
    (newText) => {
      setTexts((prev) => ({ ...prev, [currentPage]: newText }));
    },
    [currentPage]
  );

  const currentText = texts[currentPage] || '';

  return (
    <div className="app" dir="rtl" lang="ar">
      <header>
        <h1>قارئ الكتب العربية</h1>
        <p>استخراج النصوص العربية من PDF والصور وقراءتها بصوت عالٍ</p>
      </header>

      <main>
        <ApiKeyInput apiKey={apiKey} onSave={setApiKey} />

        {apiKey && (
          <>
            <FileUploader onFileSelect={handleFileSelect} />

            {fileName && (
              <div className="file-name">الملف: {fileName}</div>
            )}

            {error && <div className="error">خطأ: {error}</div>}

            <PageNavigator
              currentPage={currentPage}
              totalPages={pages.length}
              onPageChange={handlePageChange}
              loading={loading}
            />

            <TextEditor
              text={currentText}
              onChange={handleTextChange}
              loading={loading}
            />

            {currentText && (
              <TTSControls
                arabicVoices={tts.arabicVoices}
                selectedVoice={tts.selectedVoice}
                onVoiceChange={tts.setSelectedVoice}
                rate={tts.rate}
                onRateChange={tts.setRate}
                speaking={tts.speaking}
                paused={tts.paused}
                onPlay={() => tts.speak(currentText)}
                onPause={tts.pause}
                onResume={tts.resume}
                onStop={tts.stop}
                noArabicVoice={tts.noArabicVoice}
                disabled={!currentText}
                progress={tts.progress}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
