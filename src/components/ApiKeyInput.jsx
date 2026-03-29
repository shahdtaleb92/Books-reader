import { useState } from 'react';

export default function ApiKeyInput({ apiKey, onSave }) {
  const [key, setKey] = useState(apiKey);
  const [visible, setVisible] = useState(false);

  const handleSave = () => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
      onSave(trimmed);
    }
  };

  return (
    <div className="api-key-section">
      <label htmlFor="api-key">مفتاح Gemini API</label>
      <div className="api-key-row">
        <input
          id="api-key"
          type={visible ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="أدخل مفتاح API هنا..."
          dir="ltr"
        />
        <button type="button" onClick={() => setVisible(!visible)}>
          {visible ? 'إخفاء' : 'إظهار'}
        </button>
        <button type="button" onClick={handleSave}>
          حفظ
        </button>
      </div>
    </div>
  );
}
