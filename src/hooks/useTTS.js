import { useState, useRef, useCallback } from 'react';

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_CHUNK_LENGTH = 4000;

const ARABIC_VOICES = [
  { name: 'ar-XA-Wavenet-A', label: 'Wavenet A (أنثى)', gender: 'FEMALE' },
  { name: 'ar-XA-Wavenet-B', label: 'Wavenet B (ذكر)', gender: 'MALE' },
  { name: 'ar-XA-Wavenet-C', label: 'Wavenet C (ذكر)', gender: 'MALE' },
  { name: 'ar-XA-Wavenet-D', label: 'Wavenet D (أنثى)', gender: 'FEMALE' },
  { name: 'ar-XA-Neural2-A', label: 'Neural2 A (أنثى)', gender: 'FEMALE' },
  { name: 'ar-XA-Neural2-C', label: 'Neural2 C (ذكر)', gender: 'MALE' },
  { name: 'ar-XA-Standard-A', label: 'Standard A (أنثى)', gender: 'FEMALE' },
  { name: 'ar-XA-Standard-B', label: 'Standard B (ذكر)', gender: 'MALE' },
  { name: 'ar-XA-Standard-C', label: 'Standard C (ذكر)', gender: 'MALE' },
  { name: 'ar-XA-Standard-D', label: 'Standard D (أنثى)', gender: 'FEMALE' },
];

function splitTextIntoChunks(text) {
  const sentences = text.split(/(?<=[.؟!。\n])\s*/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_LENGTH) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      for (const word of words) {
        if ((wordChunk + ' ' + word).trim().length > MAX_CHUNK_LENGTH) {
          if (wordChunk) chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = (wordChunk + ' ' + word).trim();
        }
      }
      if (wordChunk) chunks.push(wordChunk);
    } else if ((current + ' ' + sentence).trim().length > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export function useTTS(apiKey) {
  const [selectedVoice, setSelectedVoice] = useState(ARABIC_VOICES[0]);
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const chunksRef = useRef([]);
  const currentIndexRef = useRef(0);
  const stoppedRef = useRef(false);

  const synthesizeChunk = useCallback(
    async (text) => {
      const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'ar-XA',
            name: selectedVoice.name,
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: rate,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `TTS API error ${res.status}`);
      }

      const data = await res.json();
      return data.audioContent;
    },
    [apiKey, selectedVoice, rate]
  );

  const playChunk = useCallback(
    async (index) => {
      if (stoppedRef.current || index >= chunksRef.current.length) {
        setSpeaking(false);
        setPaused(false);
        if (!stoppedRef.current) {
          setProgress((p) => ({ ...p, current: p.total }));
        }
        return;
      }

      try {
        console.log(`[TTS] Synthesizing chunk ${index + 1}/${chunksRef.current.length}...`);
        const audioContent = await synthesizeChunk(chunksRef.current[index]);
        if (stoppedRef.current) return;

        const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
        audioRef.current = audio;

        audio.onended = () => {
          currentIndexRef.current = index + 1;
          setProgress((p) => ({ ...p, current: index + 1 }));
          playChunk(index + 1);
        };

        audio.onerror = () => {
          console.error('[TTS] Audio playback error');
          setSpeaking(false);
          setPaused(false);
        };

        setProgress((p) => ({ ...p, current: index + 1 }));
        audio.play();
      } catch (e) {
        console.error(`[TTS] Error:`, e.message);
        setError(e.message);
        setSpeaking(false);
        setPaused(false);
      }
    },
    [synthesizeChunk]
  );

  const speak = useCallback(
    (text) => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (!text) return;

      setError(null);
      const chunks = splitTextIntoChunks(text);
      chunksRef.current = chunks;
      currentIndexRef.current = 0;
      stoppedRef.current = false;

      setSpeaking(true);
      setPaused(false);
      setProgress({ current: 0, total: chunks.length });
      console.log(`[TTS] Starting playback: ${chunks.length} chunk(s), voice: ${selectedVoice.name}`);

      playChunk(0);
    },
    [playChunk, selectedVoice]
  );

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
      audioRef.current = null;
    }
    chunksRef.current = [];
    currentIndexRef.current = 0;
    setSpeaking(false);
    setPaused(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    arabicVoices: ARABIC_VOICES,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    speaking,
    paused,
    progress,
    speak,
    pause,
    resume,
    stop,
    error,
    noArabicVoice: false,
  };
}
