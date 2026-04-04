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

    // Weight each word: base weight of 1.0 per word (TTS gives ~equal time per word)
    // + extra weight for punctuation pauses at end of words
    const PAUSE_FULL = 1.8;    // . ؟ ! — long pause
    const PAUSE_MEDIUM = 1.2;  // ، ؛ : — medium pause
    const PAUSE_NEWLINE = 1.5; // paragraph breaks

    const weights = words.map((w, i) => {
      let weight = 1.0;
      const lastChar = w[w.length - 1];
      if ('.؟!。'.includes(lastChar)) weight += PAUSE_FULL;
      else if ('،؛:,;'.includes(lastChar)) weight += PAUSE_MEDIUM;
      // Check if next word starts a new paragraph (large gap in original text)
      if (i < words.length - 1) {
        const pos = text.indexOf(words[i + 1], text.indexOf(w) + w.length);
        const gap = text.substring(text.indexOf(w) + w.length, pos);
        if (gap.includes('\n')) weight += PAUSE_NEWLINE;
      }
      return weight;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const cumulative = [];
    let acc = 0;
    for (const w of weights) {
      acc += w;
      cumulative.push(acc / totalWeight);
    }

    // Slight backward offset so highlighting trails speech rather than leads it
    const LAG_OFFSET = 0.02;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.max(0, (audio.currentTime / audio.duration) - LAG_OFFSET);
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
