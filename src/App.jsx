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
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 });
  const [converting, setConverting] = useState(false);

  const { extractText, loading, error } = useGeminiOCR(apiKey);
  const tts = useTTS();

  const handleFileSelect = useCallback(
    async (file) => {
      tts.stop();
      setTexts({});
      setCurrentPage(0);
      setFileName(file.name);
      setOcrProgress({ current: 0, total: 0 });

      let imageList;
      if (file.type === 'application/pdf') {
        setConverting(true);
        imageList = await pdfToImages(file);
        setConverting(false);
      } else {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        imageList = [base64];
      }

      setPages(imageList);
      setOcrProgress({ current: 0, total: imageList.length });

      const newTexts = {};
      for (let i = 0; i < imageList.length; i++) {
        setOcrProgress({ current: i + 1, total: imageList.length });
        const text = await extractText(imageList[i]);
        newTexts[i] = text;
        setTexts({ ...newTexts });
      }

      setOcrProgress({ current: imageList.length, total: imageList.length });
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

            {converting && (
              <div className="ocr-progress">
                <span>جاري تحويل صفحات PDF إلى صور...</span>
              </div>
            )}

            {!converting && ocrProgress.total > 0 && ocrProgress.current <= ocrProgress.total && loading && (
              <div className="ocr-progress">
                <span>
                  جاري استخراج النص: صفحة {ocrProgress.current} من {ocrProgress.total}
                </span>
                <div className="ocr-progress-bar-container">
                  <div
                    className="ocr-progress-bar"
                    style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

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
