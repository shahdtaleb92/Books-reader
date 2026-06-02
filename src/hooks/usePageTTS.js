import { useState, useRef, useCallback, useEffect } from 'react';
import { ARABIC_VOICES, generateAudioForText, reconstructChunkTimings, getWordSpokenWeight, detectSilences } from '../utils/ttsUtils.js';
import { fetchPageAudio, savePageAudio, fetchSavedAudioPages, deletePageAudio } from '../utils/api.js';
import { cacheAudio, getCachedAudio, deleteCachedAudio } from '../utils/offlineCache.js';

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

  const [highlightOffset, setHighlightOffset] = useState(() => {
    return parseFloat(localStorage.getItem('tts_highlight_offset') || '0.15');
  });
  const highlightOffsetRef = useRef(highlightOffset);

  useEffect(() => {
    highlightOffsetRef.current = highlightOffset;
    localStorage.setItem('tts_highlight_offset', String(highlightOffset));
  }, [highlightOffset]);

  const silencesRef = useRef([]);

  const buildWordWeights = useCallback((words) => {
    const weights = words.map((w) => getWordSpokenWeight(w));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      const flat = 1 / (words.length || 1);
      return words.map((_, i) => (i + 1) * flat);
    }
    const cumulative = [];
    let acc = 0;
    for (const w of weights) {
      acc += w;
      cumulative.push(acc / totalWeight);
    }
    return cumulative;
  }, []);

  // Chunk-aware tracking with silence detection — reads refs live each frame
  const startWordTracking = useCallback((text) => {
    if (!text) return;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let cachedChunkWeights = null;
    let cachedTimingsId = null;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const currentTime = audio.currentTime + highlightOffsetRef.current;
      const timings = chunkTimingsRef.current;
      const silences = silencesRef.current;
      let idx = 0;

      // Check if we're in a silence gap — freeze highlight on last word before gap
      if (silences.length > 0) {
        const inSilence = silences.find((s) => currentTime >= s.start && currentTime <= s.end);
        if (inSilence) {
          animFrameRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (timings && timings.length > 0) {
        // Re-compute chunk weights only if timings changed
        const timingsId = timings.length + ':' + timings[0].startTime;
        if (cachedTimingsId !== timingsId) {
          cachedChunkWeights = timings.map((chunk) => {
            const chunkWords = words.slice(chunk.wordStart, chunk.wordEnd + 1);
            return buildWordWeights(chunkWords);
          });
          cachedTimingsId = timingsId;
        }

        let chunkIdx = timings.findIndex((c) => currentTime < c.endTime);
        if (chunkIdx === -1) chunkIdx = timings.length - 1;
        const chunk = timings[chunkIdx];
        const cumulative = cachedChunkWeights[chunkIdx];

        const chunkDuration = chunk.endTime - chunk.startTime;
        const chunkProgress = chunkDuration > 0
          ? Math.max(0, Math.min(1, (currentTime - chunk.startTime) / chunkDuration))
          : 0;

        let localIdx = cumulative.findIndex((c) => c >= chunkProgress);
        if (localIdx === -1) localIdx = chunk.wordCount - 1;

        idx = chunk.wordStart + localIdx;
      } else {
        // Fallback: proportional across full audio
        const cumulative = buildWordWeights(words);
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
        // 1. Check local IndexedDB cache first (works offline)
        if (bookId) {
          const localResult = await getCachedAudio(bookId, pageNum, selectedVoice.name);
          if (localResult) {
            const audioUrl = URL.createObjectURL(localResult.blob);
            const cached = { audioUrl, chunkTimings: localResult.chunkTimings };
            audioCacheRef.current.set(pageNum, cached);
            generatingPagesRef.current.delete(pageNum);
            if (generatingPagesRef.current.size === 0) setGenerating(false);
            return cached;
          }
        }

        // 2. Check server cache
        if (bookId) {
          const serverResult = await fetchPageAudio(bookId, pageNum, selectedVoice.name);
          if (serverResult) {
            const cached = { audioUrl: serverResult.audioUrl, chunkTimings: serverResult.chunkTimings };
            audioCacheRef.current.set(pageNum, cached);
            cacheAudio(bookId, pageNum, selectedVoice.name, serverResult.blob, serverResult.chunkTimings);
            generatingPagesRef.current.delete(pageNum);
            if (generatingPagesRef.current.size === 0) setGenerating(false);
            return cached;
          }
        }

        // 3. Generate fresh audio
        const result = await generateAudioForText(apiKey, text, selectedVoice.name);
        if (result) {
          audioCacheRef.current.set(pageNum, result);

          // Save to server + IndexedDB in background WITH chunk timings
          if (bookId) {
            fetch(result.audioUrl)
              .then((r) => r.blob())
              .then((blob) => {
                savePageAudio(bookId, pageNum, selectedVoice.name, blob, result.chunkTimings).catch(() => {});
                cacheAudio(bookId, pageNum, selectedVoice.name, blob, result.chunkTimings);
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

      const audio = new Audio(result.audioUrl);
      audio.playbackRate = playbackRate;
      audioRef.current = audio;

      // Store chunk timings — reconstruct from text if missing (cached audio)
      if (result.chunkTimings) {
        chunkTimingsRef.current = result.chunkTimings;
      } else {
        chunkTimingsRef.current = null;
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && isFinite(audio.duration)) {
            chunkTimingsRef.current = reconstructChunkTimings(text, audio.duration);
          }
        }, { once: true });
      }

      // Detect silence gaps in the audio for precise highlight pausing
      silencesRef.current = [];
      detectSilences(result.audioUrl).then((s) => { silencesRef.current = s; }).catch(() => {});

      audio.onended = () => {
        setPlaying(false);
        setPaused(false);
        setCurrentReadingPage(-1);
        stopWordTracking();
        chunkTimingsRef.current = null;
        silencesRef.current = [];

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
        silencesRef.current = [];
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

  // Store texts for auto page flip (doesn't call API)
  const updateTexts = useCallback((texts) => {
    textsRef.current = texts;
    const maxPage = Math.max(...Object.keys(texts).map(Number), 0);
    totalPagesRef.current = maxPage + 1;
  }, []);

  // Only pre-generate audio for nearby pages (called during active playback only)
  const prefetchPages = useCallback(
    (currentPage, texts) => {
      updateTexts(texts);
      const pagesToFetch = [currentPage + 1, currentPage + 2];
      for (const p of pagesToFetch) {
        if (p >= 0 && texts[p] && texts[p].trim() && !audioCacheRef.current.has(p)) {
          generatePageAudio(p, texts[p]);
        }
      }
    },
    [generatePageAudio, updateTexts]
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
    silencesRef.current = [];
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
          deleteCachedAudio(bookId, pageNum, selectedVoice.name);
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
    updateTexts,
    isPageCached,
    isPageSaved,
    clearPageAudio,
    playbackRate,
    setPlaybackRate,
    highlightOffset,
    setHighlightOffset,
    onPageFinishedRef,
    findNextNonEmptyPage,
  };
}
