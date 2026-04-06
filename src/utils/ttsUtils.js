export const TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent';

export const MAX_CHUNK_BYTES = 3500;

export const ARABIC_VOICES = [
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

export function splitTextIntoChunks(text) {
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

export function pcmToWav(pcmData, sampleRate, numChannels, bitsPerSample) {
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

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function synthesizeText(apiKey, text, voiceName) {
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
            prebuiltVoiceConfig: { voiceName },
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
}

export async function generateAudioForText(apiKey, text, voiceName) {
  if (!text || !text.trim()) return null;

  const chunks = splitTextIntoChunks(text);
  const allPcmBuffers = [];

  // Track chunk boundaries: each chunk's PCM byte length and word range
  const words = text.split(/\s+/).filter(Boolean);
  const chunkMeta = [];
  let wordOffset = 0;

  for (const chunk of chunks) {
    const audioBase64 = await synthesizeText(apiKey, chunk, voiceName);
    const pcmBuffer = base64ToArrayBuffer(audioBase64);
    allPcmBuffers.push(pcmBuffer);

    const chunkWords = chunk.split(/\s+/).filter(Boolean);
    chunkMeta.push({
      pcmBytes: pcmBuffer.byteLength,
      wordStart: wordOffset,
      wordEnd: wordOffset + chunkWords.length - 1,
      wordCount: chunkWords.length,
    });
    wordOffset += chunkWords.length;
  }

  const totalLength = allPcmBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of allPcmBuffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  // Build chunk timing from PCM byte lengths (24000 Hz, 16-bit mono = 48000 bytes/sec)
  const bytesPerSecond = 24000 * 1 * (16 / 8);
  let timeOffset = 0;
  const chunkTimings = chunkMeta.map((cm) => {
    const duration = cm.pcmBytes / bytesPerSecond;
    const timing = {
      startTime: timeOffset,
      endTime: timeOffset + duration,
      wordStart: cm.wordStart,
      wordEnd: cm.wordEnd,
      wordCount: cm.wordCount,
    };
    timeOffset += duration;
    return timing;
  });

  const wav = pcmToWav(combined.buffer, 24000, 1, 16);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(blob);

  return { audioUrl, chunkTimings };
}
