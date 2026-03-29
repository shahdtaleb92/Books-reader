import { useState, useEffect, useRef, useCallback } from 'react';

export function useTTS() {
  const [voices, setVoices] = useState([]);
  const [arabicVoices, setArabicVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const utteranceRef = useRef(null);

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

  const speak = useCallback(
    (text) => {
      speechSynthesis.cancel();
      if (!text) return;

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'ar';
      utt.rate = rate;
      if (selectedVoice) utt.voice = selectedVoice;

      utt.onend = () => {
        setSpeaking(false);
        setPaused(false);
      };
      utt.onerror = () => {
        setSpeaking(false);
        setPaused(false);
      };

      utteranceRef.current = utt;
      setSpeaking(true);
      setPaused(false);
      speechSynthesis.speak(utt);
    },
    [rate, selectedVoice]
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
    speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  return {
    arabicVoices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    speaking,
    paused,
    speak,
    pause,
    resume,
    stop,
    noArabicVoice: voices.length > 0 && arabicVoices.length === 0,
  };
}
