import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_CHUNK_LENGTH = 200;

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

export function useTTS() {
  const [voices, setVoices] = useState([]);
  const [arabicVoices, setArabicVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const chunksRef = useRef([]);
  const currentIndexRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => {
      const allVoices = speechSynthesis.getVoices();
      setVoices(allVoices);
      const arabic = allVoices.filter((v) => v.lang.startsWith('ar'));
      setArabicVoices(arabic);
      if (arabic.length > 0 && !selectedVoice) {
        setSelectedVoice(arabic[0]);
      }
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () =>
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const speakChunk = useCallback(
    (index) => {
      if (stoppedRef.current || index >= chunksRef.current.length) {
        setSpeaking(false);
        setPaused(false);
        setProgress({ current: 0, total: 0 });
        return;
      }

      const utt = new SpeechSynthesisUtterance(chunksRef.current[index]);
      utt.lang = 'ar';
      utt.rate = rate;
      if (selectedVoice) utt.voice = selectedVoice;

      utt.onend = () => {
        currentIndexRef.current = index + 1;
        setProgress((p) => ({ ...p, current: index + 1 }));
        speakChunk(index + 1);
      };
      utt.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setSpeaking(false);
        setPaused(false);
      };

      speechSynthesis.speak(utt);
    },
    [rate, selectedVoice]
  );

  const speak = useCallback(
    (text) => {
      speechSynthesis.cancel();
      if (!text) return;

      const chunks = splitTextIntoChunks(text);
      chunksRef.current = chunks;
      currentIndexRef.current = 0;
      stoppedRef.current = false;

      setSpeaking(true);
      setPaused(false);
      setProgress({ current: 0, total: chunks.length });

      speakChunk(0);
    },
    [speakChunk]
  );

  const pause = useCallback(() => {
    speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    speechSynthesis.resume();
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    speechSynthesis.cancel();
    chunksRef.current = [];
    currentIndexRef.current = 0;
    setSpeaking(false);
    setPaused(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    arabicVoices,
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
    noArabicVoice: voices.length > 0 && arabicVoices.length === 0,
  };
}
