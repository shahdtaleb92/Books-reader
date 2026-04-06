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

  const audioCacheRef = useRef(new Map()); // pageNum -> { audioUrl, chunkTimings }
  const audioRef = useRef(null);
  const generatingPagesRef = useRef(new Set());
  const stoppedRef = useRef(false);
  const animFrameRef = useRef(null);
  const textsRef = useRef({});
  const totalPagesRef = useRef(0);
  const chunkTimingsRef = useRef(null); // current page's chunk timings
  // Callback when a page finishes playing — used by BookReader for auto page flip
  const onPageFinishedRef = useRef(null);

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

  // Build per-word cumulative weights for a segment of words
  // Lead offset pushes the highlight slightly ahead so it stays in sync with speech
  const LEAD_OFFSET = 0.06;

  const buildWordWeights = useCallback((words, text) => {
    const PAUSE_FULL = 0.4;
    const PAUSE_MEDIUM = 0.2;
    const PAUSE_NEWLINE = 0.3;

    const weights = words.map((w, i) => {
      // Base weight proportional to word length (longer Arabic words take longer to say)
      let weight = Math.max(1.0, w.length * 0.4);
      const lastChar = w[w.length - 1];
      if ('.؟!。'.includes(lastChar)) weight += PAUSE_FULL;
      else if ('،؛:,;'.includes(lastChar)) weight += PAUSE_MEDIUM;
      if (i < words.length - 1 && text) {
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
    return cumulative;
  }, []);

  // Chunk-aware word tracking: use exact chunk time boundaries, estimate only within each chunk
  const startWordTracking = useCallback((text) => {
    if (!text) return;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const timings = chunkTimingsRef.current;

    // Pre-compute per-chunk word weights for fast lookup
    let chunkWeights = null;
    if (timings && timings.length > 0) {
      chunkWeights = timings.map((chunk) => {
        const chunkWords = words.slice(chunk.wordStart, chunk.wordEnd + 1);
        return buildWordWeights(chunkWords, text);
      });
    }

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Add lead offset so highlight stays ahead of (not behind) the speech
      const currentTime = audio.currentTime + LEAD_OFFSET * (audio.playbackRate || 1);
      let idx = 0;

      if (timings && timings.length > 0 && chunkWeights) {
        // Find which chunk we're in based on exact time boundaries
        let chunkIdx = timings.findIndex((c) => currentTime < c.endTime);
        if (chunkIdx === -1) chunkIdx = timings.length - 1;
        const chunk = timings[chunkIdx];
        const cumulative = chunkWeights[chunkIdx];

        // Progress within this chunk (0 to 1)
        const chunkDuration = chunk.endTime - chunk.startTime;
        const chunkProgress = chunkDuration > 0
          ? Math.max(0, Math.min(1, (currentTime - chunk.startTime) / chunkDuration))
          : 0;

        // Find word within chunk
        let localIdx = cumulative.findIndex((c) => c >= chunkProgress);
        if (localIdx === -1) localIdx = chunk.wordCount - 1;

        idx = chunk.wordStart + localIdx;
      } else {
        // Fallback: simple proportional estimation (no chunk data)
        const cumulative = buildWordWeights(words, text);
        const progress = audio.duration > 0 ? Math.min(1, currentTime / audio.duration) : 0;
        idx = cumulative.findIndex((c) => c >= progress);
        if (idx === -1) idx = words.length - 1;
      }

      setCurrentWordIndex(idx);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [buildWordWeights]);

  const stopWordTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCurrentWordIndex(-1);
  }, []);

  // Find next non-empty page starting from given page
  const findNextNonEmptyPage = useCallback((fromPage) => {
    const texts = textsRef.current;
    const total = totalPagesRef.current;
    for (let p = fromPage; p < total; p++) {
      if (texts[p] && texts[p].trim()) return p;
    }
    return -1; // no more pages with content
  }, []);

  // Generate audio for a specific page (check server first)
  // Returns { audioUrl, chunkTimings } or null
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
            // Server cache has no chunk timings — store without them
            const cached = { audioUrl: serverAudio, chunkTimings: null };
            audioCacheRef.current.set(pageNum, cached);
            generatingPagesRef.current.delete(pageNum);
            if (generatingPagesRef.current.size === 0) setGenerating(false);
            return cached;
          }
        }

        // Generate fresh audio — returns { audioUrl, chunkTimings }
        const result = await generateAudioForText(apiKey, text, selectedVoice.name);
        if (result) {
          audioCacheRef.current.set(pageNum, result);

          // Save to server in background
          if (bookId) {
            fetch(result.audioUrl)
              .then((r) => r.blob())
              .then((blob) => {
                savePageAudio(bookId, pageNum, selectedVoice.name, blob).catch(() => {});
                setSavedPages((prev) => new Set([...prev, pageNum]));
              })
              .catch(() => {});
          }
        }
        return result;
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

  // Pre-generate audio for upcoming non-empty pages
  const prefetchAhead = useCallback(
    (fromPage) => {
      const texts = textsRef.current;
      const total = totalPagesRef.current;
      let fetched = 0;
      for (let p = fromPage; p < total && fetched < 2; p++) {
        if (texts[p] && texts[p].trim() && !audioCacheRef.current.has(p)) {
          generatePageAudio(p, texts[p]);
          fetched++;
        }
      }
    },
    [generatePageAudio]
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

      const result = await generatePageAudio(pageNum, text);
      if (!result || stoppedRef.current) {
        setGenerating(false);
        return;
      }

      // Store chunk timings for word tracking
      chunkTimingsRef.current = result.chunkTimings || null;

      const audio = new Audio(result.audioUrl);
      audio.playbackRate = playbackRate;
      audioRef.current = audio;

      audio.onended = () => {
        setPlaying(false);
        setPaused(false);
        setCurrentReadingPage(-1);
        stopWordTracking();
        chunkTimingsRef.current = null;

        // Notify BookReader to auto-advance to next page
        if (onPageFinishedRef.current) {
          onPageFinishedRef.current(pageNum);
        }
      };

      audio.onerror = () => {
        setPlaying(false);
        setPaused(false);
        setError('خطأ في تشغيل الصوت');
        stopWordTracking();
        chunkTimingsRef.current = null;
      };

      await audio.play();
      setPlaying(true);
      setPaused(false);
      setGenerating(false);
      startWordTracking(text);

      // Pre-generate next non-empty pages while current plays
      prefetchAhead(pageNum + 1);
    },
    [generatePageAudio, playbackRate, startWordTracking, stopWordTracking, prefetchAhead]
  );

  // Play from a specific word index (click-to-read-from)
  const playFromPosition = useCallback(
    (wordIndex, text) => {
      if (!audioRef.current || !text) return;
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length === 0 || wordIndex < 0 || wordIndex >= words.length) return;

      const audio = audioRef.current;
      const timings = chunkTimingsRef.current;

      if (timings && timings.length > 0) {
        // Find which chunk this word belongs to
        const chunkIdx = timings.findIndex(
          (c) => wordIndex >= c.wordStart && wordIndex <= c.wordEnd
        );
        if (chunkIdx >= 0) {
          const chunk = timings[chunkIdx];
          const chunkWords = words.slice(chunk.wordStart, chunk.wordEnd + 1);
          const cumulative = buildWordWeights(chunkWords, text);
          const localIdx = wordIndex - chunk.wordStart;

          // Get proportional position within this chunk
          const chunkProportion = localIdx > 0 ? cumulative[localIdx - 1] : 0;
          const chunkDuration = chunk.endTime - chunk.startTime;
          audio.currentTime = chunk.startTime + chunkProportion * chunkDuration;
        }
      } else {
        // Fallback: proportional across full audio
        const cumulative = buildWordWeights(words, text);
        const proportion = wordIndex > 0 ? cumulative[wordIndex - 1] : 0;
        audio.currentTime = proportion * audio.duration;
      }

      if (audio.paused) {
        audio.play();
        setPlaying(true);
        setPaused(false);
        startWordTracking(text);
      }
    },
    [startWordTracking, buildWordWeights]
  );

  const prefetchPages = useCallback(
    (currentPage, texts) => {
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
    chunkTimingsRef.current = null;
  }, [stopWordTracking]);

  // Seek forward/backward by seconds
  const seekBy = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }, []);

  // Delete cached/saved audio for a page so it can be regenerated
  const clearPageAudio = useCallback(
    async (pageNum) => {
      const cached = audioCacheRef.current.get(pageNum);
      if (cached) {
        URL.revokeObjectURL(cached.audioUrl);
        audioCacheRef.current.delete(pageNum);
      }

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

  // Clear browser cache when voice changes
  useEffect(() => {
    for (const entry of audioCacheRef.current.values()) {
      URL.revokeObjectURL(entry.audioUrl);
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
    playFromPosition,
    pause,
    resume,
    stop,
    seekBy,
    prefetchPages,
    isPageCached,
    isPageSaved,
    clearPageAudio,
    playbackRate,
    setPlaybackRate,
    onPageFinishedRef,
    findNextNonEmptyPage,
  };
}
