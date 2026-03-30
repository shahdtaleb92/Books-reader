export default function TTSControls({
  arabicVoices,
  selectedVoice,
  onVoiceChange,
  speaking,
  paused,
  onPlay,
  onPause,
  onResume,
  onStop,
  onGenerate,
  onDownload,
  generating,
  audioReady,
  disabled,
  progress,
  fileName,
}) {
  return (
    <div className="tts-controls">
      <h3>القراءة الصوتية (Gemini TTS)</h3>

      <div className="tts-row">
        <div className="voice-select">
          <label htmlFor="voice">الصوت:</label>
          <select
            id="voice"
            value={selectedVoice?.name || ''}
            onChange={(e) => {
              const voice = arabicVoices.find((v) => v.name === e.target.value);
              if (voice) onVoiceChange(voice);
            }}
            disabled={generating}
          >
            {arabicVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tts-buttons">
        {!audioReady && !generating && (
          <button onClick={onGenerate} disabled={disabled}>
            توليد الملف الصوتي لجميع الصفحات
          </button>
        )}

        {generating && (
          <button disabled className="generating-btn">
            جاري التوليد...
          </button>
        )}

        {audioReady && !generating && (
          <>
            {!speaking && (
              <button onClick={onPlay}>تشغيل</button>
            )}
            {speaking && !paused && (
              <button onClick={onPause}>إيقاف مؤقت</button>
            )}
            {speaking && paused && (
              <button onClick={onResume}>استئناف</button>
            )}
            {speaking && (
              <button onClick={onStop} className="stop-btn">إيقاف</button>
            )}
            <button onClick={() => onDownload(fileName)} className="download-btn">
              تحميل الملف الصوتي
            </button>
            <button onClick={onGenerate} disabled={disabled}>
              إعادة التوليد
            </button>
          </>
        )}
      </div>

      {generating && progress.total > 0 && (
        <div className="tts-progress">
          <div
            className="tts-progress-bar"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
          <span className="tts-progress-text">
            {progress.current} / {progress.total}
          </span>
        </div>
      )}
    </div>
  );
}
