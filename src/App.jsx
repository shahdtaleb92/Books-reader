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

const CONCURRENT_OCR = 3;

function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || ''
  );
  const [ttsApiKey, setTtsApiKey] = useState(
    () => localStorage.getItem('tts_api_key') || ''
  );
  const [pages, setPages] = useState([]);
  const [texts, setTexts] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [fileName, setFileName] = useState('');
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 });
  const [converting, setConverting] = useState(false);

  const { extractText, loading, error } = useGeminiOCR(apiKey);
  const tts = useTTS(ttsApiKey);

  const handleTextFileSelect = useCallback((textContent, name) => {
    console.log(`%c[TXT] ملف نصي: ${name} (${textContent.length} حرف)`, 'color: #27ae60; font-weight: bold');
    tts.stop();
    setPages([]);
    setCurrentPage(0);
    setFileName(name);
    setOcrProgress({ current: 0, total: 0 });
    setTexts({ 0: textContent });
    console.log(`%c[TXT] ✓ النص جاهز — يمكنك الآن توليد الصوت مباشرة`, 'color: #27ae60; font-weight: bold');
  }, [tts]);

  const handleFileSelect = useCallback(
    async (file) => {
      console.log(`%c[App] ═══════════════════════════════════════`, 'color: #0f3460; font-weight: bold');
      console.log(`%c[App] ملف جديد: ${file.name}`, 'color: #0f3460; font-weight: bold');
      console.log(`%c[App] النوع: ${file.type} | الحجم: ${(file.size / 1024).toFixed(1)} KB`, 'color: #0f3460');
      console.log(`%c[App] ═══════════════════════════════════════`, 'color: #0f3460; font-weight: bold');
      tts.stop();
      setTexts({});
      setCurrentPage(0);
      setFileName(file.name);
      setOcrProgress({ current: 0, total: 0 });

      let imageList;
      if (file.type === 'application/pdf') {
        console.log(`%c[PDF] ⏳ جاري تحويل صفحات PDF إلى صور...`, 'color: #e67e22; font-weight: bold');
        setConverting(true);
        const startConvert = performance.now();
        imageList = await pdfToImages(file);
        const convertTime = ((performance.now() - startConvert) / 1000).toFixed(2);
        setConverting(false);
        console.log(`%c[PDF] ✓ تم تحويل ${imageList.length} صفحة في ${convertTime} ثانية`, 'color: #27ae60; font-weight: bold');
      } else {
        console.log(`%c[IMG] ⏳ جاري قراءة الصورة...`, 'color: #e67e22');
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        imageList = [base64];
        console.log(`%c[IMG] ✓ تم قراءة الصورة (${(base64.length / 1024).toFixed(1)} KB)`, 'color: #27ae60');
      }

      setPages(imageList);
      setOcrProgress({ current: 0, total: imageList.length });
      console.log(`%c[OCR] ═══════════════════════════════════════`, 'color: #8e44ad; font-weight: bold');
      console.log(`%c[OCR] ⏳ بدء استخراج النص من ${imageList.length} صفحة (${CONCURRENT_OCR} طلبات متوازية)...`, 'color: #8e44ad; font-weight: bold');

      const newTexts = {};
      let completed = 0;
      const startOcr = performance.now();

      // Process pages in parallel batches
      for (let batchStart = 0; batchStart < imageList.length; batchStart += CONCURRENT_OCR) {
        const batchEnd = Math.min(batchStart + CONCURRENT_OCR, imageList.length);
        const batch = [];

        for (let i = batchStart; i < batchEnd; i++) {
          batch.push(
            (async () => {
              const pageStart = performance.now();
              console.log(`%c[OCR] ⏳ صفحة ${i + 1}/${imageList.length}...`, 'color: #8e44ad');
              const text = await extractText(imageList[i]);
              const pageTime = ((performance.now() - pageStart) / 1000).toFixed(2);
              newTexts[i] = text;
              completed++;
              setOcrProgress({ current: completed, total: imageList.length });
              setTexts({ ...newTexts });
              console.log(`%c[OCR] ✓ صفحة ${i + 1} — ${pageTime} ثانية (${text.length} حرف)`, 'color: #27ae60');
            })()
          );
        }

        await Promise.all(batch);
      }

      const totalTime = ((performance.now() - startOcr) / 1000).toFixed(2);
      const totalChars = Object.values(newTexts).reduce((sum, t) => sum + t.length, 0);
      setOcrProgress({ current: imageList.length, total: imageList.length });
      console.log(`%c[OCR] ═══════════════════════════════════════`, 'color: #27ae60; font-weight: bold');
      console.log(`%c[OCR] ✓ اكتمل! ${imageList.length} صفحة في ${totalTime} ثانية (${totalChars} حرف إجمالي)`, 'color: #27ae60; font-weight: bold');
      console.log(`%c[OCR] ═══════════════════════════════════════`, 'color: #27ae60; font-weight: bold');
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

  const handleSaveText = useCallback(() => {
    const fullText = Object.keys(texts)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => texts[key])
      .filter(Boolean)
      .join('\n\n--- صفحة ---\n\n');

    if (!fullText) return;

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'extracted';
    a.download = `${baseName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`%c[App] ✓ تم حفظ النص: ${baseName}.txt`, 'color: #27ae60; font-weight: bold');
  }, [texts, fileName]);

  const hasTexts = Object.values(texts).some(Boolean);
  const currentText = texts[currentPage] || '';
  const audioFileName = fileName ? fileName.replace(/\.[^.]+$/, '') + '.wav' : 'audio.wav';

  return (
    <div className="app" dir="rtl" lang="ar">
      <header>
        <h1>قارئ الكتب العربية</h1>
        <p>استخراج النصوص العربية من PDF والصور وقراءتها بصوت عالٍ</p>
      </header>

      <main>
        <ApiKeyInput
          apiKey={apiKey}
          ttsApiKey={ttsApiKey}
          onSave={setApiKey}
          onSaveTTS={setTtsApiKey}
        />

        {(apiKey || ttsApiKey) && (
          <>
            <FileUploader
              onFileSelect={handleFileSelect}
              onTextFileSelect={handleTextFileSelect}
            />

            {fileName && (
              <div className="file-name">الملف: {fileName}</div>
            )}

            {error && <div className="error">خطأ OCR: {error}</div>}
            {tts.error && <div className="error">خطأ صوتي: {tts.error}</div>}

            {converting && (
              <div className="ocr-progress">
                <span>جاري تحويل صفحات PDF إلى صور...</span>
              </div>
            )}

            {!converting && ocrProgress.total > 0 && ocrProgress.current < ocrProgress.total && loading && (
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

            {pages.length > 1 && (
              <PageNavigator
                currentPage={currentPage}
                totalPages={pages.length}
                onPageChange={handlePageChange}
                loading={loading}
              />
            )}

            <TextEditor
              text={currentText}
              onChange={handleTextChange}
              loading={loading}
            />

            {hasTexts && (
              <div className="action-buttons">
                <button onClick={handleSaveText} className="save-btn">
                  حفظ النص كملف TXT
                </button>
              </div>
            )}

            {hasTexts && ttsApiKey && (
              <TTSControls
                arabicVoices={tts.arabicVoices}
                selectedVoice={tts.selectedVoice}
                onVoiceChange={tts.setSelectedVoice}
                speaking={tts.speaking}
                paused={tts.paused}
                onPlay={tts.play}
                onPause={tts.pause}
                onResume={tts.resume}
                onStop={tts.stop}
                onGenerate={() => tts.generateFullAudio(texts)}
                onDownload={tts.downloadAudio}
                generating={tts.generating}
                audioReady={!!tts.audioUrl}
                disabled={!hasTexts}
                progress={tts.progress}
                fileName={audioFileName}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
