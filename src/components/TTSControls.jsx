export default function TTSControls({
  arabicVoices,
  selectedVoice,
  onVoiceChange,
  rate,
  onRateChange,
  speaking,
  paused,
  onPlay,
  onPause,
  onResume,
  onStop,
  noArabicVoice,
  disabled,
  progress,
}) {
  return (
    <div className="tts-controls">
      <h3>التحكم بالقراءة الصوتية</h3>

      {noArabicVoice && (
        <div className="warning">
          لم يتم العثور على صوت عربي في المتصفح. قد لا تعمل القراءة الصوتية
          بشكل صحيح.
        </div>
      )}

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
          >
            {arabicVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="speed-control">
          <label htmlFor="speed">
            السرعة: {rate.toFixed(1)}x
          </label>
          <input
            id="speed"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => onRateChange(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="tts-buttons">
        {!speaking && (
          <button onClick={onPlay} disabled={disabled}>
            تشغيل
          </button>
        )}
        {speaking && !paused && (
          <button onClick={onPause}>إيقاف مؤقت</button>
        )}
        {speaking && paused && <button onClick={onResume}>استئناف</button>}
        {speaking && (
          <button onClick={onStop} className="stop-btn">
            إيقاف
          </button>
        )}
      </div>

      {speaking && progress.total > 0 && (
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
