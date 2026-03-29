import { useState, useCallback } from 'react';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROMPT =
  'استخرج كل النص العربي الموجود في هذه الصورة بدقة. أعد النص فقط محافظاً على ترتيب الفقرات وتسلسل الأسطر. لا تضف أي تعليقات أو ملاحظات.';

export function useGeminiOCR(apiKey) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extractText = useCallback(
    async (base64Image) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: base64Image,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || `API error ${res.status}`);
        }

        const data = await res.json();
        const text =
          data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return text;
      } catch (e) {
        setError(e.message);
        return '';
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

  return { extractText, loading, error };
}
