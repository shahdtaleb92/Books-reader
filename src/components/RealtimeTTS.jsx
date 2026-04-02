export default function RealtimeTTS({
  arabicVoices,
  selectedVoice,
  onVoiceChange,
  playing,
  paused,
  generating,
  autoRead,
  onAutoReadChange,
  currentPage,
  onPlay,
  onPause,
  onResume,
  onStop,
  isPageCached,
  error,
}) {
  return (
    <div className="realtime-tts">
      <h3>القراءة الصوتية الفورية</h3>

      <div className="tts-row">
        <div className="voice-select">
          <label htmlFor="rt-voice">الصوت:</label>
          <select
            id="rt-voice"
            value={selectedVoice?.name || ''}
            onChange={(e) => {
              const voice = arabicVoices.find((v) => v.name === e.target.value);
              if (voice) onVoiceChange(voice);
            }}
            disabled={generating || playing}
          >
            {arabicVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="auto-read-toggle">
          <label>
            <input
              type="checkbox"
              checked={autoRead}
              onChange={(e) => onAutoReadChange(e.target.checked)}
            />
            قراءة تلقائية عند تغيير الصفحة
          </label>
        </div>
      </div>

      <div className="tts-buttons">
        {!playing && !generating && (
          <button onClick={onPlay}>
            قراءة الصفحة {currentPage + 1}
            {isPageCached(currentPage) ? ' (محفوظة)' : ''}
          </button>
        )}

        {generating && !playing && (
          <button disabled className="generating-btn">
            جاري تجهيز الصوت...
          </button>
        )}

        {playing && !paused && (
          <button onClick={onPause}>إيقاف مؤقت</button>
        )}

        {playing && paused && (
          <button onClick={onResume}>استئناف</button>
        )}

        {(playing || generating) && (
          <button onClick={onStop} className="stop-btn">إيقاف</button>
        )}
      </div>

      {error && <div className="error" style={{ marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}
