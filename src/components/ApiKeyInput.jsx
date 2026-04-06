import { useState } from 'react';

export default function ApiKeyInput({ apiKey, ttsApiKey, onSave, onSaveTTS }) {
  const [key, setKey] = useState(apiKey);
  const [ttsKey, setTtsKey] = useState(ttsApiKey);
  const [visible, setVisible] = useState(false);
  const [ttsVisible, setTtsVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(!!(apiKey && ttsApiKey));

  const handleSave = () => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
      onSave(trimmed);
    }
  };

  const handleSaveTTS = () => {
    const trimmed = ttsKey.trim();
    if (trimmed) {
      localStorage.setItem('tts_api_key', trimmed);
      onSaveTTS(trimmed);
      if (key.trim()) setCollapsed(true);
    }
  };

  if (collapsed) {
    return (
      <div className="api-key-collapsed">
        <button onClick={() => setCollapsed(false)} className="settings-toggle-btn">
          اعدادات API
        </button>
      </div>
    );
  }

  return (
    <div className="api-key-section">
      <div className="api-key-header">
        <label htmlFor="api-key">مفتاح Gemini API</label>
        {apiKey && ttsApiKey && (
          <button onClick={() => setCollapsed(true)} className="collapse-btn">
            اخفاء
          </button>
        )}
      </div>
      <div className="api-key-row">
        <input
          id="api-key"
          type={visible ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="أدخل مفتاح Gemini API هنا..."
          dir="ltr"
        />
        <button type="button" onClick={() => setVisible(!visible)}>
          {visible ? 'إخفاء' : 'إظهار'}
        </button>
        <button type="button" onClick={handleSave}>
          حفظ
        </button>
      </div>

      <label htmlFor="tts-api-key" style={{ marginTop: '0.85rem', display: 'block', fontWeight: 600, marginBottom: '0.45rem', fontSize: '0.88rem' }}>
        مفتاح TTS API
      </label>
      <div className="api-key-row">
        <input
          id="tts-api-key"
          type={ttsVisible ? 'text' : 'password'}
          value={ttsKey}
          onChange={(e) => setTtsKey(e.target.value)}
          placeholder="أدخل مفتاح Text-to-Speech API هنا..."
          dir="ltr"
        />
        <button type="button" onClick={() => setTtsVisible(!ttsVisible)}>
          {ttsVisible ? 'إخفاء' : 'إظهار'}
        </button>
        <button type="button" onClick={handleSaveTTS}>
          حفظ
        </button>
      </div>
      <p className="api-key-hint">
        يمكن استخدام نفس المفتاح لكليهما
      </p>
    </div>
  );
}
