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
  onClearAudio,
  isPageCached,
  isPageSaved,
  error,
  playbackRate,
  onPlaybackRateChange,
}) {
  const cached = isPageCached(currentPage);
  const saved = isPageSaved(currentPage);

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

        <div className="speed-control">
          <label htmlFor="rt-speed">السرعة: {playbackRate}x</label>
          <input
            id="rt-speed"
            type="range"
            min="0.5"
            max="2"
            step="0.25"
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="auto-read-toggle">
          <label>
            <input
              type="checkbox"
              checked={autoRead}
              onChange={(e) => onAutoReadChange(e.target.checked)}
            />
            قراءة تلقائية
          </label>
        </div>
      </div>

      <div className="tts-buttons">
        {!playing && !generating && (
          <button onClick={onPlay}>
            قراءة الصفحة {currentPage + 1}
            {saved ? ' (محفوظة)' : cached ? ' (مؤقتة)' : ''}
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

        {(cached || saved) && !playing && !generating && (
          <button onClick={() => onClearAudio(currentPage)} className="clear-audio-btn">
            حذف الصوت وإعادة التوليد
          </button>
        )}
      </div>

      {error && (
        <div className="error" style={{ marginTop: '0.5rem' }}>
          {error}
          {!generating && !playing && (
            <button
              onClick={onPlay}
              style={{ marginRight: '0.5rem', marginTop: '0.5rem' }}
              className="retry-btn"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      )}
    </div>
  );
}
