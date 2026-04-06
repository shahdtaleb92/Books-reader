export default function RealtimeTTS({
  arabicVoices,
  selectedVoice,
  onVoiceChange,
  playing,
  generating,
  autoRead,
  onAutoReadChange,
  currentPage,
  onClearAudio,
  isPageCached,
  isPageSaved,
  playbackRate,
  onPlaybackRateChange,
}) {
  const cached = isPageCached(currentPage);
  const saved = isPageSaved(currentPage);

  return (
    <div className="tts-settings">
      <div className="tts-settings-row">
        <div className="voice-select">
          <label htmlFor="rt-voice">الصوت</label>
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
          <label htmlFor="rt-speed">{playbackRate}x</label>
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
      </div>

      <div className="tts-settings-actions">
        <label className="auto-read-label">
          <input
            type="checkbox"
            checked={autoRead}
            onChange={(e) => onAutoReadChange(e.target.checked)}
          />
          قراءة تلقائية
        </label>

        {(cached || saved) && !playing && !generating && (
          <button onClick={() => onClearAudio(currentPage)} className="clear-audio-btn">
            إعادة توليد الصوت
          </button>
        )}
      </div>
    </div>
  );
}
