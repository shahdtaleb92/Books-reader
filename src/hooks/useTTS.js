import { useState, useRef, useCallback } from 'react';
import {
  ARABIC_VOICES,
  splitTextIntoChunks,
  pcmToWav,
  base64ToArrayBuffer,
  synthesizeText,
} from '../utils/ttsUtils.js';

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

      const allPcmBuffers = [];

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (stoppedRef.current) {
            setGenerating(false);
            return;
          }
          setProgress({ current: i + 1, total: chunks.length });
          const audioBase64 = await synthesizeText(apiKey, chunks[i], selectedVoice.name);
          const pcmBuffer = base64ToArrayBuffer(audioBase64);
          allPcmBuffers.push(pcmBuffer);
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
      } catch (e) {
        setError(e.message);
      } finally {
        setGenerating(false);
      }
    },
    [apiKey, selectedVoice, audioUrl]
  );

  const play = useCallback(() => {
    if (!audioUrl) return;
    if (audioRef.current) audioRef.current.pause();
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
