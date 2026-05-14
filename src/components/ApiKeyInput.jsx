import { useState } from 'react';

export default function ApiKeyInput({ apiKey, ttsApiKey, onSave, onSaveTTS }) {
  const [key, setKey] = useState(apiKey);
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(!!apiKey);

  const handleSave = () => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
      localStorage.setItem('tts_api_key', trimmed);
      onSave(trimmed);
      onSaveTTS(trimmed);
      setCollapsed(true);
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
        {apiKey && (
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
      <p className="api-key-hint">
        احصل على المفتاح مجاناً من aistudio.google.com → Get API Key
      </p>
    </div>
  );
}
