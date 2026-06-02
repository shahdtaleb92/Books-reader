import { useState } from 'react';
import { cleanupOldAudio } from '../utils/api.js';
import { clearAllCachedAudio } from '../utils/offlineCache.js';

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
  highlightOffset,
  onHighlightOffsetChange,
}) {
  const cached = isPageCached(currentPage);
  const saved = isPageSaved(currentPage);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const result = await cleanupOldAudio();
      await clearAllCachedAudio();
      setCleanupResult(
        result.deleted > 0
          ? `تم حذف ${result.deleted} ملف صوتي قديم`
          : 'لا توجد ملفات قديمة للحذف'
      );
    } catch {
      setCleanupResult('حدث خطأ أثناء الحذف');
    } finally {
      setCleaning(false);
    }
  };

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
          <label htmlFor="rt-speed">السرعة {playbackRate}x</label>
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

        <div className="speed-control">
          <label htmlFor="rt-highlight">تزامن التظليل {Math.round(highlightOffset * 1000)}ms</label>
          <input
            id="rt-highlight"
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={highlightOffset}
            onChange={(e) => onHighlightOffsetChange(parseFloat(e.target.value))}
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

        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="clear-audio-btn"
        >
          {cleaning ? 'جاري الحذف...' : 'حذف الصوت القديم (أكثر من 30 يوم)'}
        </button>
        {cleanupResult && (
          <span style={{ fontSize: '0.75rem', color: '#888' }}>{cleanupResult}</span>
        )}
      </div>
    </div>
  );
}
