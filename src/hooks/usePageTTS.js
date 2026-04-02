import { useState, useRef, useCallback, useEffect } from 'react';
import { ARABIC_VOICES, generateAudioForText } from '../utils/ttsUtils.js';

export function usePageTTS(apiKey) {
  const [selectedVoice, setSelectedVoice] = useState(ARABIC_VOICES[0]);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [currentReadingPage, setCurrentReadingPage] = useState(-1);
  const [error, setError] = useState(null);

  const audioCacheRef = useRef(new Map()); // pageNum -> audioUrl
  const audioRef = useRef(null);
  const generatingPagesRef = useRef(new Set());
  const stoppedRef = useRef(false);

  // Generate audio for a specific page
  const generatePageAudio = useCallback(
    async (pageNum, text) => {
      if (!apiKey || !text || !text.trim()) return null;
      if (audioCacheRef.current.has(pageNum)) return audioCacheRef.current.get(pageNum);
      if (generatingPagesRef.current.has(pageNum)) return null;

      generatingPagesRef.current.add(pageNum);
      setGenerating(true);

      try {
        const audioUrl = await generateAudioForText(apiKey, text, selectedVoice.name);
        if (audioUrl) {
          audioCacheRef.current.set(pageNum, audioUrl);
        }
        return audioUrl;
      } catch (e) {
        console.error(`[PageTTS] Error generating page ${pageNum}:`, e.message);
        setError(e.message);
        return null;
      } finally {
        generatingPagesRef.current.delete(pageNum);
        if (generatingPagesRef.current.size === 0) {
          setGenerating(false);
        }
      }
    },
    [apiKey, selectedVoice]
  );

  // Play audio for a specific page
  const playPage = useCallback(
    async (pageNum, text) => {
      stoppedRef.current = false;
      setError(null);

      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setCurrentReadingPage(pageNum);
      setGenerating(true);

      const audioUrl = await generatePageAudio(pageNum, text);
      if (!audioUrl || stoppedRef.current) {
        setGenerating(false);
        return;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlaying(false);
        setPaused(false);
        setCurrentReadingPage(-1);
      };

      audio.onerror = () => {
        setPlaying(false);
        setPaused(false);
        setError('Error playing audio');
      };

      await audio.play();
      setPlaying(true);
      setPaused(false);
      setGenerating(false);
    },
    [generatePageAudio]
  );

  // Pre-fetch surrounding pages
  const prefetchPages = useCallback(
    (currentPage, texts) => {
      const pagesToFetch = [currentPage - 1, currentPage, currentPage + 1];
      for (const p of pagesToFetch) {
        if (p >= 0 && texts[p] && !audioCacheRef.current.has(p)) {
          generatePageAudio(p, texts[p]);
        }
      }
    },
    [generatePageAudio]
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
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
    setPaused(false);
    setCurrentReadingPage(-1);
  }, []);

  // Clear cache when voice changes
  useEffect(() => {
    // Revoke old URLs
    for (const url of audioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    audioCacheRef.current.clear();
    stop();
  }, [selectedVoice, stop]);

  const isPageCached = useCallback((pageNum) => {
    return audioCacheRef.current.has(pageNum);
  }, []);

  return {
    arabicVoices: ARABIC_VOICES,
    selectedVoice,
    setSelectedVoice,
    playing,
    paused,
    generating,
    autoRead,
    setAutoRead,
    currentReadingPage,
    error,
    playPage,
    pause,
    resume,
    stop,
    prefetchPages,
    isPageCached,
  };
}
