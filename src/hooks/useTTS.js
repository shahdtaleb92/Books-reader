import { useState, useRef, useCallback } from 'react';

const TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent';

const MAX_CHUNK_BYTES = 3500;

const ARABIC_VOICES = [
  { name: 'Aoede', label: 'Aoede' },
  { name: 'Charon', label: 'Charon' },
  { name: 'Fenrir', label: 'Fenrir' },
  { name: 'Kore', label: 'Kore' },
  { name: 'Leda', label: 'Leda' },
  { name: 'Orus', label: 'Orus' },
  { name: 'Puck', label: 'Puck' },
  { name: 'Zephyr', label: 'Zephyr' },
  { name: 'Achernar', label: 'Achernar' },
  { name: 'Gacrux', label: 'Gacrux' },
  { name: 'Sulafat', label: 'Sulafat' },
  { name: 'Vindemiatrix', label: 'Vindemiatrix' },
];

function splitTextIntoChunks(text) {
  const sentences = text.split(/(?<=[.؟!。\n])\s*/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const sentenceBytes = new TextEncoder().encode(sentence).length;
    if (sentenceBytes > MAX_CHUNK_BYTES) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      for (const word of words) {
        const combined = (wordChunk + ' ' + word).trim();
        if (new TextEncoder().encode(combined).length > MAX_CHUNK_BYTES) {
          if (wordChunk) chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = combined;
        }
      }
      if (wordChunk) chunks.push(wordChunk);
    } else {
      const combined = (current + ' ' + sentence).trim();
      if (new TextEncoder().encode(combined).length > MAX_CHUNK_BYTES) {
        if (current) chunks.push(current);
        current = sentence;
      } else {
        current = combined;
      }
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

function pcmToWav(pcmData, sampleRate, numChannels, bitsPerSample) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.byteLength, true);

  const wav = new Uint8Array(44 + pcmData.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(pcmData), 44);
  return wav;
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function useTTS(apiKey) {
  const [selectedVoice, setSelectedVoice] = useState(ARABIC_VOICES[0]);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const stoppedRef = useRef(false);

  const synthesizeChunk = useCallback(
    async (text) => {
      const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              languageCode: 'ar-XA',
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice.name,
                },
              },
            },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `TTS API error ${res.status}`);
      }

      const data = await res.json();
      const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error('No audio data in response');
      return audioData;
    },
    [apiKey, selectedVoice]
  );

  const generateFullAudio = useCallback(
    async (allTexts) => {
      const fullText = Object.keys(allTexts)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => allTexts[key])
        .filter(Boolean)
        .join('\n\n');

      if (!fullText) return;

      setGenerating(true);
      setError(null);
      stoppedRef.current = false;

      const chunks = splitTextIntoChunks(fullText);
      setProgress({ current: 0, total: chunks.length });
      console.log(`%c[TTS] ═══════════════════════════════════════`, 'color: #e67e22; font-weight: bold');
      console.log(`%c[TTS] ⏳ بدء توليد الصوت: ${chunks.length} جزء | الصوت: ${selectedVoice.name}`, 'color: #e67e22; font-weight: bold');
      console.log(`%c[TTS] إجمالي النص: ${fullText.length} حرف`, 'color: #e67e22');

      const allPcmBuffers = [];
      const startTime = performance.now();

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (stoppedRef.current) {
            setGenerating(false);
            return;
          }
          const chunkBytes = new TextEncoder().encode(chunks[i]).length;
          console.log(`%c[TTS] ⏳ جزء ${i + 1}/${chunks.length} (${chunkBytes} بايت)...`, 'color: #e67e22');
          setProgress({ current: i + 1, total: chunks.length });
          const chunkStart = performance.now();
          const audioBase64 = await synthesizeChunk(chunks[i]);
          const pcmBuffer = base64ToArrayBuffer(audioBase64);
          allPcmBuffers.push(pcmBuffer);
          const chunkTime = ((performance.now() - chunkStart) / 1000).toFixed(2);
          console.log(`%c[TTS] ✓ جزء ${i + 1} — ${chunkTime} ثانية (${(pcmBuffer.byteLength / 1024).toFixed(1)} KB صوت)`, 'color: #27ae60');
        }

        const totalLength = allPcmBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const buf of allPcmBuffers) {
          combined.set(new Uint8Array(buf), offset);
          offset += buf.byteLength;
        }

        const wav = pcmToWav(combined.buffer, 24000, 1, 16);
        const blob = new Blob([wav], { type: 'audio/wav' });

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
        const sizeMB = (wav.byteLength / (1024 * 1024)).toFixed(2);
        const durationSec = (combined.byteLength / (24000 * 2)).toFixed(1);
        console.log(`%c[TTS] ═══════════════════════════════════════`, 'color: #27ae60; font-weight: bold');
        console.log(`%c[TTS] ✓ اكتمل التوليد!`, 'color: #27ae60; font-weight: bold');
        console.log(`%c[TTS]   الوقت: ${totalTime} ثانية`, 'color: #27ae60');
        console.log(`%c[TTS]   الحجم: ${sizeMB} MB`, 'color: #27ae60');
        console.log(`%c[TTS]   المدة: ~${durationSec} ثانية صوت`, 'color: #27ae60');
        console.log(`%c[TTS] ═══════════════════════════════════════`, 'color: #27ae60; font-weight: bold');
      } catch (e) {
        console.error(`%c[TTS] ✗ خطأ: ${e.message}`, 'color: #e74c3c; font-weight: bold');
        setError(e.message);
      } finally {
        setGenerating(false);
      }
    },
    [synthesizeChunk, selectedVoice, audioUrl]
  );

  const play = useCallback(() => {
    if (!audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => {
      setSpeaking(false);
      setPaused(false);
    };
    audio.play();
    setSpeaking(true);
    setPaused(false);
  }, [audioUrl]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
      setPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
    setPaused(false);
  }, []);

  const downloadAudio = useCallback(
    (filename) => {
      if (!audioUrl) return;
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = filename || 'audio.wav';
      a.click();
    },
    [audioUrl]
  );

  return {
    arabicVoices: ARABIC_VOICES,
    selectedVoice,
    setSelectedVoice,
    speaking,
    paused,
    progress,
    generating,
    audioUrl,
    generateFullAudio,
    play,
    pause,
    resume,
    stop,
    downloadAudio,
    error,
  };
}
