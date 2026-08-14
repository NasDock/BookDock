/**
 * TTS Audio Service — Shared audio synthesis logic for TTSScreen and MiniPlayer.
 * 直接复制自 mobile/src/services/ttsAudio.ts,无 expo 依赖。
 */

import { getApiClient, type Paragraph } from "@bookdock/api-client";
import TrackPlayer from "react-native-track-player";

const TTS_CHUNK_MAX = 2500;

function splitForTts(text: string, maxLen: number): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const breakChars = ["，", "。", "！", "？", "；", "、", " ", "\n"];
      let found = false;
      for (let i = end - 1; i > start; i--) {
        if (breakChars.includes(text[i])) {
          end = i + 1;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let i = end - 1; i > start; i--) {
          if (/[a-zA-Z0-9]/.test(text[i])) {
            end = i + 1;
            found = true;
            break;
          }
        }
      }
      if (!found) end = start + maxLen;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

function resolveAudioUrl(
  url: string,
  apiClient: ReturnType<typeof getApiClient>,
) {
  if (url.startsWith("http")) return url;
  return `${apiClient.serverBaseURL}${url}`;
}

const prefetchedCache = new Map<string, string>();

export function clearPrefetchCache() {
  prefetchedCache.clear();
}

export async function prefetchParagraph(
  bookId: string,
  paragraph: Paragraph,
  provider: string,
  voiceId: string,
) {
  if (prefetchedCache.has(paragraph.id)) return;
  const chunks = splitForTts(paragraph.text, TTS_CHUNK_MAX);
  const apiClient = getApiClient();
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkParaId = chunks.length > 1 ? `${paragraph.id}#${i}` : paragraph.id;
      const r = await apiClient.synthesizeParagraph({
        bookId,
        paragraphId: chunkParaId,
        text: chunk,
        provider,
        voice: voiceId,
      });
      if (r.success && r.data) {
        prefetchedCache.set(
          chunkParaId,
          resolveAudioUrl(r.data.url, apiClient),
        );
      }
    }
  } catch {
    /* ignore prefetch errors */
  }
}

export async function synthesizeParagraphAudio(
  bookId: string,
  paragraph: Paragraph,
  provider: string,
  voiceId: string,
): Promise<string[]> {
  const chunks = splitForTts(paragraph.text, TTS_CHUNK_MAX);
  const apiClient = getApiClient();
  const uris: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkParaId = chunks.length > 1 ? `${paragraph.id}#${i}` : paragraph.id;
    let uri = prefetchedCache.get(chunkParaId);
    if (!uri) {
      const r = await apiClient.synthesizeParagraph({
        bookId,
        paragraphId: chunkParaId,
        text: chunk,
        provider,
        voice: voiceId,
      });
      if (!r.success || !r.data)
        throw new Error(r.error || "synthesize failed");
      uri = resolveAudioUrl(r.data.url, apiClient);
      prefetchedCache.set(chunkParaId, uri);
    }
    uris.push(uri);
  }
  return uris;
}

export async function playParagraphAudio(
  uris: string[],
  trackMeta: { id: string; title: string; artist: string; artwork?: string },
  startOffsetMs = 0,
) {
  const tracks = uris.map((uri, i) => ({
    id: `${trackMeta.id}-${i}`,
    url: uri,
    title: trackMeta.title,
    artist: trackMeta.artist,
    artwork: trackMeta.artwork,
    duration: 0,
  }));

  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  if (startOffsetMs > 0) {
    await TrackPlayer.seekTo(startOffsetMs / 1000);
  }
  await TrackPlayer.play();
}