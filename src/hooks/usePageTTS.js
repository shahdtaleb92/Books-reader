import { useState, useRef, useCallback, useEffect } from 'react';
import { ARABIC_VOICES, generateAudioForText } from '../utils/ttsUtils.js';
import { fetchPageAudio, savePageAudio, fetchSavedAudioPages, deletePageAudio } from '../utils/api.js';

export function usePageTTS(apiKey, bookId) {
  const [selectedVoice, setSelectedVoice] = useState(() => {
    const saved = localStorage.getItem('tts_voice');
    const found = ARABIC_VOICES.find((v) => v.name === saved);
    return found || ARABIC_VOICES[0];
  });
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [currentReadingPage, setCurrentReadingPage] = useState(-1);
  const [error, setError] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(() => {
    return parseFloat(localStorage.getItem('tts_speed') || '1');
  });
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [savedPages, setSavedPages] = useState(new Set());

  const audioCacheRef = useRef(new Map());
  const audioRef = useRef(null);
  const generatingPagesRef = useRef(new Set());
  const stoppedRef = useRef(false);
  const animFrameRef = useRef(null);
  // Store texts ref so onended can access them for next-page playback
  const textsRef = useRef({});
  const totalPagesRef = useRef(0);

  // Persist voice selection
  useEffect(() => {
    localStorage.setItem('tts_voice', selectedVoice.name);
  }, [selectedVoice]);

  // Persist playback speed
  useEffect(() => {
    localStorage.setItem('tts_speed', String(playbackRate));
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Load saved audio pages list from server
  useEffect(() => {
    if (bookId && selectedVoice) {
      fetchSavedAudioPages(bookId, selectedVoice.name)
        .then((pages) => setSavedPages(new Set(pages)))
        .catch(() => {});
    }
  }, [bookId, selectedVoice]);

  // Word tracking animation loop
  const startWordTracking = useCallback((text) => {
    if (!text) return;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const totalChars = words.reduce((sum, w) => sum + w.length, 0);
    const cumulative = [];
    let acc = 0;
    for (const w of words) {
      acc += w.length;
      cumulative.push(acc / totalChars);
    }

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = audio.currentTime / audio.duration;
      let idx = cumulative.findIndex((c) => c >= progress);
      if (idx === -1) idx = words.length - 1;
      setCurrentWordIndex(idx);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWordTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCurrentWordIndex(-1);
  }, []);

  // Generate audio for a specific page (check server first)
  const generatePageAudio = useCallback(
    async (pageNum, text) => {
      if (!apiKey || !text || !text.trim()) return null;
      if (audioCacheRef.current.has(pageNum)) return audioCacheRef.current.get(pageNum);
      if (generatingPagesRef.current.has(pageNum)) return null;

      generatingPagesRef.current.add(pageNum);
      setGenerating(true);

      try {
        // Check server cache first
        if (bookId) {
          const serverAudio = await fetchPageAudio(bookId, pageNum, selectedVoice.name);
          if (serverAudio) {
            audioCacheRef.current.set(pageNum, serverAudio);
            generatingPagesRef.current.delete(pageNum);
            if (generatingPagesRef.current.size === 0) setGenerating(false);
            return serverAudio;
          }
        }

        // Generate fresh audio
        const audioUrl = await generateAudioForText(apiKey, text, selectedVoice.name);
        if (audioUrl) {
          audioCacheRef.current.set(pageNum, audioUrl);

          // Save to server in background
          if (bookId) {
            fetch(audioUrl)
              .then((r) => r.blob())
              .then((blob) => {
                savePageAudio(bookId, pageNum, selectedVoice.name, blob).catch(() => {});
                setSavedPages((prev) => new Set([...prev, pageNum]));
              })
              .catch(() => {});
          }
        }
        return audioUrl;
      } catch (e) {
        setError(e.message);
        return null;
      } finally {
        generatingPagesRef.current.delete(pageNum);
        if (generatingPagesRef.current.size === 0) setGenerating(false);
      }
    },
    [apiKey, selectedVoice, bookId]
  );

  // Play audio for a specific page
  const playPage = useCallback(
    async (pageNum, text) => {
      stoppedRef.current = false;
      setError(null);
      stopWordTracking();

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
      audio.playbackRate = playbackRate;
      audioRef.current = audio;

      audio.onended = () => {
        setPlaying(false);
        setPaused(false);
        setCurrentReadingPage(-1);
        stopWordTracking();

        // Auto-prepare next page audio in background
        const nextPage = pageNum + 1;
        if (nextPage < totalPagesRef.current && textsRef.current[nextPage]) {
          generatePageAudio(nextPage, textsRef.current[nextPage]);
        }
      };

      audio.onerror = () => {
        setPlaying(false);
        setPaused(false);
        setError('خطأ في تشغيل الصوت');
        stopWordTracking();
      };

      await audio.play();
      setPlaying(true);
      setPaused(false);
      setGenerating(false);
      startWordTracking(text);

      // Also start preparing the next page right away while current plays
      const nextPage = pageNum + 1;
      if (nextPage < totalPagesRef.current && textsRef.current[nextPage] && !audioCacheRef.current.has(nextPage)) {
        generatePageAudio(nextPage, textsRef.current[nextPage]);
      }
    },
    [generatePageAudio, playbackRate, startWordTracking, stopWordTracking]
  );

  const prefetchPages = useCallback(
    (currentPage, texts) => {
      // Store refs for onended callback
      textsRef.current = texts;
      const maxPage = Math.max(...Object.keys(texts).map(Number), 0);
      totalPagesRef.current = maxPage + 1;

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
    stopWordTracking();
  }, [stopWordTracking]);

  // Delete cached/saved audio for a page so it can be regenerated
  const clearPageAudio = useCallback(
    async (pageNum) => {
      // Remove from browser cache
      const cached = audioCacheRef.current.get(pageNum);
      if (cached) {
        URL.revokeObjectURL(cached);
        audioCacheRef.current.delete(pageNum);
      }

      // Remove from server
      if (bookId) {
        try {
          await deletePageAudio(bookId, pageNum, selectedVoice.name);
          setSavedPages((prev) => {
            const next = new Set(prev);
            next.delete(pageNum);
            return next;
          });
        } catch (e) {
          // ignore
        }
      }
    },
    [bookId, selectedVoice]
  );

  // Clear browser cache when voice changes (server cache remains)
  useEffect(() => {
    for (const url of audioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    audioCacheRef.current.clear();
    stop();
  }, [selectedVoice, stop]);

  const isPageCached = useCallback((pageNum) => {
    return audioCacheRef.current.has(pageNum);
  }, []);

  const isPageSaved = useCallback((pageNum) => {
    return savedPages.has(pageNum);
  }, [savedPages]);

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
    currentWordIndex,
    error,
    playPage,
    pause,
    resume,
    stop,
    prefetchPages,
    isPageCached,
    isPageSaved,
    clearPageAudio,
    playbackRate,
    setPlaybackRate,
  };
}
