/**
 * TTSScreen — Mobile TTS audiobook reader with background playback.
 *
 *  - Paragraph-by-paragraph audio reading via react-native-track-player
 *  - Two view modes: "controls" (cover + playback controls) and "content" (paragraph list)
 *  - Tap cover to toggle between modes (like music player cover/lyrics switch)
 *  - Background playback with notification controls
 *  - Mini player mode triggered by down-arrow in header
 */

import {
  getApiClient,
  Paragraph,
  TTSProvider,
  TTSVoice,
} from "@bookdock/api-client";
// mobile2:去掉 @expo/vector-icons,改用 react-native-vector-icons (P4 复制)
import Ionicons from 'react-native-vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import TrackPlayer, {
  Capability,
  Event,
  State,
  usePlaybackState,
  useProgress,
} from "react-native-track-player";
import type { RootStackParamList } from "../navigation/types";
import { getCoverImageUrl } from "../services/api";
import { useThemeStore, useTTSStore } from "../stores";
import { borderRadius, fontSizes, getTheme, spacing } from "../utils/theme";

type TTSScreenRouteProp = RouteProp<RootStackParamList, "TTSScreen">;

const providerLabel = (name: string) => {
  if (name === "edge") return "Edge";
  if (name === "mi") return "小米";
  return name;
};

/**
 * Format voice name for display.
 *
 * The TTS backend (tts-service) already converts verbose Edge TTS
 * FriendlyName strings like
 *   "Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)"
 * into short labels like "晓晓·陆" before returning the voice list.
 * So in the common case we just return `voice.name` as-is.
 *
 * This helper only handles the fallback (e.g. cached older responses,
 * or non-Edge providers that don't pre-translate): truncate overly
 * long names so the picker stays readable.
 */
function formatVoiceName(voice: TTSVoice, _providerName: string): string {
  const name = voice.name || "";
  if (!name) return "默认";
  if (name.length > 20) {
    return name.slice(0, 18) + "...";
  }
  return name;
}

const TTS_CHUNK_MAX = 2500;

function splitForTts(text: string, maxLen: number): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const sentenceEnd = /(?<=[.!?。！？；;])\s*/g;
  const sentences = text.split(sentenceEnd).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > maxLen) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      let rest = s;
      while (rest.length > maxLen) {
        let cutAt = rest.lastIndexOf(" ", maxLen);
        if (cutAt <= 0) cutAt = maxLen;
        out.push(rest.slice(0, cutAt));
        rest = rest.slice(cutAt).trimStart();
      }
      if (rest) buf = rest;
      continue;
    }
    if ((buf + " " + s).trim().length > maxLen) {
      if (buf) out.push(buf);
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute<TTSScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === "dark");
  const ttsStore = useTTSStore();

  // mobile2:RN 0.81 没有 SafeAreaView,用 StatusBar.currentHeight 推 top inset
  const insets = { top: StatusBar.currentHeight || 24, bottom: 0 };

  // Derived state from store (single source of truth)
  const paragraphs = ttsStore.paragraphs;
  const chapterTitle = ttsStore.chapterTitle;
  const chapterIndex = ttsStore.chapterIndex;
  const currentParagraph = ttsStore.currentParagraph;

  // Local setters for chapter data (since these come from API, not store)
  const setParagraphs = useCallback(
    (p: Paragraph[]) => ttsStore.setParagraphs(p),
    [ttsStore],
  );
  const setChapterTitle = useCallback(
    (t: string) => ttsStore.setChapterTitle(t),
    [ttsStore],
  );
  const setChapterIndex = useCallback(
    (i: number) => ttsStore.setChapterIndex(i),
    [ttsStore],
  );

  // ── Local UI state ──────────────────────────────────────────────────
  const [chapters, setChapters] = useState<{ title: string; index: number }[]>(
    [],
  );
  const chaptersRef = useRef<{ title: string; index: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── TTS state ────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [provider, setProvider] = useState<string>(
    ttsStore.selectedProvider || "edge",
  );
  const [voiceId, setVoiceId] = useState<string>(
    ttsStore.selectedVoice?.id || "",
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  // View mode: 'controls' = cover + controls, 'content' = paragraph list
  const [viewMode, setViewMode] = useState<"controls" | "content">("controls");

  // Screen width for responsive layout
  const [screenWidth, setScreenWidth] = useState(
    Dimensions.get("window").width,
  );
  const isWideScreen = screenWidth > 600;

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  // RNTP progress
  const playbackState = usePlaybackState();
  const progress = useProgress();

  // Use ttsStore state for UI to avoid flicker during paragraph transitions
  const isPlaying = ttsStore.state === "playing";
  const isPaused = ttsStore.state === "paused";
  // mobile2: track-player v5 移除了 State.Connecting, 留 Buffering 一种。
  const isLoadingAudio =
    ttsStore.state === "loading" ||
    (playbackState as any)?.state === State.Buffering;

  const [paragraphProgress, setParagraphProgress] = useState(0);
  const [resumeOffsetMs, setResumeOffsetMs] = useState(0);

  const prefetchedRef = useRef<Map<string, string>>(new Map());
  const cancelledRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const paragraphRefs = useRef<Map<number, View>>(new Map());

  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Setup TrackPlayer on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.JumpForward,
            Capability.JumpBackward,
          ],
          // mobile2: track-player v5 移除了 compactCapabilities 选项,新版 capabilities 全展开
          progressUpdateEventInterval: 1,
        });
        // Only reset if nothing is playing (avoid interrupting playback from mini player)
        if (ttsStore.state !== "playing") {
          await TrackPlayer.reset();
        }
      } catch (e) {
        // Player may already be set up
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load providers + voices + chapter content ──────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If already playing this book (expanding from mini player), skip reload
      if (
        ttsStore.currentBookId === book.id &&
        ttsStore.paragraphs.length > 0 &&
        ttsStore.state === "playing"
      ) {
        console.log("[TTSScreen] Already playing this book, skipping reload");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const apiClient = getApiClient();
        console.log("[TTSScreen] Starting load, book.id:", book.id);

        // Save book data to store for mini player
        ttsStore.setCurrentBookData(book);

        // Providers
        const provRes = await apiClient.getTtsProviders();
        console.log("[TTSScreen] Providers response:", JSON.stringify(provRes));
        if (cancelled) return;
        const ps = (provRes.success && provRes.data?.providers) || [];
        setProviders(ps);
        const enabledNames = ps.filter((p: any) => p.enabled).map((p: any) => p.name);
        const finalProvider = enabledNames.includes(provider)
          ? provider
          : enabledNames[0] || "edge";
        console.log("[TTSScreen] Final provider:", finalProvider);
        if (finalProvider !== provider) setProvider(finalProvider);

        // Voices
        const vRes = await apiClient.getVoices(finalProvider);
        console.log("[TTSScreen] Voices response:", JSON.stringify(vRes));
        if (cancelled) return;
        const vs = (vRes.success && vRes.data) || [];
        setVoices(vs);
        if (!voiceId && vs[0]) setVoiceId(vs[0].id);

        // Chapters
        console.log("[TTSScreen] Loading chapters for book:", book.id);
        const chRes = await apiClient.getChapters(book.id);
        console.log("[TTSScreen] Chapters response:", JSON.stringify(chRes));
        if (cancelled) return;
        if (!chRes.success || !chRes.data || chRes.data.length === 0) {
          console.log("[TTSScreen] No chapters found");
          setLoadError("本书暂无章节内容，请先解析章节。");
          return;
        }
        setChapters(chRes.data);
        chaptersRef.current = chRes.data;
        ttsStore.setChapters(chRes.data);

        // Load first chapter. skipEmpty: true so EPUBs that open with
        // a cover/copyright page silently advance to the first chapter
        // with readable text instead of dropping the user into the
        // empty-state error page.
        console.log(
          "[TTSScreen] Loading chapter 0, voice:",
          vs[0]?.id || voiceId,
          "provider:",
          finalProvider,
        );
        await loadChapter(0, vs[0]?.id || voiceId, finalProvider, {
          skipEmpty: true,
        });
      } catch (e) {
        console.error("[TTSScreen] Load error:", e);
        setLoadError((e as Error).message || "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // ── Auto-open chapter picker if requested via route params ──────────
  useEffect(() => {
    if (route.params?.showChapterPicker && chapters.length > 0 && !loading) {
      setShowChapterPicker(true);
    }
  }, [route.params?.showChapterPicker, chapters.length, loading]);

  // ── Reload voices when provider changes ─────────────────────────────
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    (async () => {
      try {
        const apiClient = getApiClient();
        const vRes = await apiClient.getVoices(provider);
        if (cancelled) return;
        const vs = (vRes.success && vRes.data) || [];
        setVoices(vs);
        if (!vs.find((v: any) => v.id === voiceId)) {
          setVoiceId(vs[0]?.id || "");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // ── Sleep timer ──────────────────────────────────────────────────────

  // Update paragraph progress from RNTP progress
  useEffect(() => {
    if (progress.duration > 0) {
      setParagraphProgress(progress.position / progress.duration);
    }
  }, [progress.position, progress.duration]);

  useEffect(() => {
    if (sleepMinutes <= 0) {
      setSleepRemaining(0);
      return;
    }
    setSleepRemaining(sleepMinutes * 60);
    sleepTimerRef.current = setInterval(() => {
      setSleepRemaining((s) => {
        if (s <= 1) {
          TrackPlayer.pause();
          setSleepMinutes(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, [sleepMinutes]);

  // ── TrackPlayer event: track ended → auto advance ───────────────────
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(
      Event.PlaybackQueueEnded,
      async () => {
        console.log("[TTSScreen] Queue ended");
        const nextIdx = currentParagraph + 1;
        if (nextIdx < paragraphs.length) {
          // More paragraphs in chapter, continue playing
          await playParagraph(nextIdx);
        } else {
          // Chapter ended, try next chapter
          const nextChapter = chapterIndex + 1;
          if (nextChapter < chaptersRef.current.length) {
            await loadChapter(nextChapter, voiceId, provider);
            await playParagraph(0);
          } else {
            // Truly done - no more chapters
            ttsStore.setState("idle");
          }
        }
      },
    );
    return () => sub.remove();
  }, [
    currentParagraph,
    paragraphs.length,
    chapterIndex,
    voiceId,
    provider,
    ttsStore,
  ]);

  // ── TrackPlayer event: track changed (user clicked next/prev in system UI) ──
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      async (event: any) => {
        // event.nextTrack is the new track index
        // When user clicks "next" in system UI, we need to update currentParagraph
        if (event.nextTrack !== undefined && event.nextTrack !== null) {
          // The track index corresponds to the paragraph index within the queue
          // Our queue has: [currentParagraph chunks..., nextParagraph chunks...]
          // So we need to map track index back to paragraph index
          const trackIndex = event.nextTrack;
          // Count how many tracks belong to current paragraph
          const currentParaTrackCount = await TrackPlayer.getQueue()
            .then((q) => {
              let count = 0;
              for (let i = 0; i < q.length; i++) {
                if (q[i].id.startsWith(`${paragraphs[currentParagraph]?.id}`)) {
                  count++;
                } else {
                  break;
                }
              }
              return count;
            })
            .catch(() => 1);

          if (trackIndex >= currentParaTrackCount) {
            // User moved to next paragraph
            const nextParagraphIdx = currentParagraph + 1;
            if (nextParagraphIdx < paragraphs.length) {
              ttsStore.setCurrentParagraph(nextParagraphIdx);
              // Pre-load next next paragraph for continuous playback
              prefetchParagraph(nextParagraphIdx + 1);
            }
          }
        }
      },
    );
    return () => sub.remove();
  }, [currentParagraph, paragraphs, ttsStore]);

  // Auto-scroll to current paragraph when it changes
  useEffect(() => {
    if (flatListRef.current && currentParagraph >= 0 && paragraphs.length > 0) {
      const timeout = setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: currentParagraph,
            animated: true,
            viewPosition: 0.5,
          });
        } catch (e) {
          // Fallback to scrollToOffset if scrollToIndex fails
          console.warn("scrollToIndex failed, falling back");
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [currentParagraph, paragraphs.length]);

  // Scroll to current paragraph when entering content view (initial mount)
  useEffect(() => {
    if (
      viewMode === "content" &&
      flatListRef.current &&
      currentParagraph >= 0 &&
      paragraphs.length > 0
    ) {
      const timeout = setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: currentParagraph,
            animated: false,
            viewPosition: 0.5,
          });
        } catch (e) {
          console.warn("Initial scrollToIndex failed:", e);
        }
      }, 300);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const loadChapter = async (
    ci: number,
    vid: string,
    prov: string,
    options: { skipEmpty?: boolean } = {},
  ) => {
    setChapterIndex(ci);
    try {
      const apiClient = getApiClient();
      // Some EPUBs have leading chapters (cover, copyright, dedication,
      // table of contents) that contain only images or whitespace and
      // would otherwise leave the TTS screen with an empty state. When
      // the caller has not explicitly chosen this chapter, silently
      // advance to the next chapter that has at least one paragraph.
      // User navigation (chapter picker, deep-link, queue-end
      // auto-advance) is still honoured verbatim.
      let pRes = await apiClient.getChapterParagraphs(book.id, ci);
      let effectiveCi = ci;
      if (
        options.skipEmpty &&
        (!pRes.success || !pRes.data || pRes.data.paragraphs.length === 0) &&
        chaptersRef.current.length > 1
      ) {
        for (let i = ci + 1; i < chaptersRef.current.length; i++) {
          const tryRes = await apiClient.getChapterParagraphs(book.id, i);
          if (
            tryRes.success &&
            tryRes.data &&
            tryRes.data.paragraphs.length > 0
          ) {
            console.log(
              `[TTSScreen] Chapter ${ci} has no readable text; auto-advancing to ${i}`,
            );
            effectiveCi = i;
            setChapterIndex(i);
            pRes = tryRes;
            break;
          }
        }
      }
      if (!pRes.success || !pRes.data) {
        setLoadError("加载章节失败");
        return;
      }
      setChapterTitle(pRes.data.title);
      setParagraphs(pRes.data.paragraphs);
      setParagraphProgress(0);
      setResumeOffsetMs(0);
      prefetchedRef.current.clear();
      ttsStore.setParagraphs(pRes.data.paragraphs);
      ttsStore.setTotalParagraphs(pRes.data.paragraphs.length);
      ttsStore.setChapterTitle(pRes.data.title);
      ttsStore.setChapterIndex(effectiveCi);

      // Resume from saved cloud progress
      try {
        const prog = await apiClient.getTtsProgress(book.id, effectiveCi);
        if (prog.success && prog.data && !Array.isArray(prog.data)) {
          const rec = prog.data;
          if (rec.provider) {
            setProvider(rec.provider);
            ttsStore.setSelectedProvider(rec.provider);
          }
          if (rec.voice) setVoiceId(rec.voice);
          setResumeOffsetMs(Math.max(0, rec.audioOffsetMs || 0));
          ttsStore.setCurrentParagraph(
            Math.min(rec.paragraphIndex, pRes.data.paragraphs.length - 1),
          );
        }
      } catch {
        /* ignore */
      }
      ttsStore.setSelectedProvider(prov);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };

  const resolveAudioUrl = (
    url: string,
    apiClient: ReturnType<typeof getApiClient>,
  ) => {
    if (url.startsWith("http")) return url;
    return `${apiClient.serverBaseURL}${url}`;
  };

  const persistProgress = useCallback(
    async (idx: number, audioOffsetMs = 0) => {
      const apiClient = getApiClient();
      const ttsPayload = {
        bookId: book.id,
        chapterIndex,
        paragraphIndex: idx,
        audioOffsetMs,
        voice: voiceId,
        provider,
        totalParagraphs: paragraphs.length,
      };
      const lastReadPayload = {
        bookId: book.id,
        chapterIndex,
        paragraphIndex: idx,
        audioOffsetMs,
      };
      try {
        await Promise.all([
          apiClient.saveTtsProgress(ttsPayload),
          apiClient.saveBookLastRead(lastReadPayload),
        ]);
      } catch {
        /* ignore */
      }
    },
    [book.id, chapterIndex, paragraphs.length, voiceId, provider],
  );

  // ── Persist latest position when user leaves the screen ─────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", async () => {
      await persistProgress(
        currentParagraph,
        Math.round(progress.position * 1000),
      );
      ttsStore.setMiniPlayerVisible(true);
    });
    return unsubscribe;
  }, [
    currentParagraph,
    navigation,
    persistProgress,
    progress.position,
    ttsStore,
  ]);

  // ── Persist progress when app goes to background ────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        void persistProgress(
          currentParagraph,
          Math.round(progress.position * 1000),
        );
      }
    });
    return () => subscription.remove();
  }, [currentParagraph, persistProgress, progress.position]);

  const prefetchParagraph = useCallback(
    async (idx: number) => {
      if (idx >= paragraphs.length) return;
      const para = paragraphs[idx];
      if (prefetchedRef.current.has(para.id)) return;
      const chunks = splitForTts(para.text, TTS_CHUNK_MAX);
      const apiClient = getApiClient();
      try {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkParaId = chunks.length > 1 ? `${para.id}#${i}` : para.id;
          const r = await apiClient.synthesizeParagraph({
            bookId: book.id,
            paragraphId: chunkParaId,
            text: chunk,
            provider,
            voice: voiceId,
          });
          if (r.success && r.data) {
            prefetchedRef.current.set(
              chunkParaId,
              resolveAudioUrl(r.data.url, apiClient),
            );
          }
        }
      } catch {
        /* ignore */
      }
    },
    [book.id, paragraphs, provider, voiceId],
  );

  const synthesizeParagraph = useCallback(
    async (idx: number): Promise<string[]> => {
      if (idx >= paragraphs.length) return [];
      const para = paragraphs[idx];
      const chunks = splitForTts(para.text, TTS_CHUNK_MAX);
      const apiClient = getApiClient();
      const uris: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkParaId = chunks.length > 1 ? `${para.id}#${i}` : para.id;
        let uri = prefetchedRef.current.get(chunkParaId);
        if (!uri) {
          const r = await apiClient.synthesizeParagraph({
            bookId: book.id,
            paragraphId: chunkParaId,
            text: chunk,
            provider,
            voice: voiceId,
          });
          if (!r.success || !r.data)
            throw new Error(r.error || "synthesize failed");
          uri = resolveAudioUrl(r.data.url, apiClient);
          prefetchedRef.current.set(chunkParaId, uri);
        }
        uris.push(uri);
      }
      return uris;
    },
    [book.id, paragraphs, provider, voiceId],
  );

  const playParagraph = useCallback(
    async (idx: number) => {
      if (idx >= paragraphs.length) {
        ttsStore.setCurrentParagraph(0);
        setParagraphProgress(0);
        ttsStore.setState("idle");
        return;
      }
      ttsStore.setCurrentParagraph(idx);
      setParagraphProgress(0);
      const startOffsetMs = resumeOffsetMs;
      setResumeOffsetMs(0);
      prefetchParagraph(idx + 1);

      try {
        const uris = await synthesizeParagraph(idx);
        if (uris.length === 0) return;

        // Build tracks for RNTP - current paragraph + next paragraph (if available)
        const coverUri = getCoverImageUrl(book.coverUrl);
        const tracks = uris.map((uri, i) => ({
          id: `${paragraphs[idx].id}-${i}`,
          url: uri,
          title: `${book.title} - ${chapterTitle}`,
          artist: book.author || "未知作者",
          artwork: coverUri,
          duration: 0,
        }));

        // Pre-synthesize next paragraph and add to queue if available
        const nextIdx = idx + 1;
        let nextTracks: any[] = [];
        if (nextIdx < paragraphs.length) {
          try {
            const nextUris = await synthesizeParagraph(nextIdx);
            if (nextUris.length > 0) {
              nextTracks = nextUris.map((uri, i) => ({
                id: `${paragraphs[nextIdx].id}-${i}`,
                url: uri,
                title: `${book.title} - ${chapterTitle}`,
                artist: book.author || "未知作者",
                artwork: coverUri,
                duration: 0,
              }));
            }
          } catch (e) {
            console.warn(
              "[TTSScreen] Pre-synthesize next paragraph failed:",
              e,
            );
          }
        }

        await TrackPlayer.reset();
        await TrackPlayer.add([...tracks, ...nextTracks]);
        if (startOffsetMs > 0) {
          await TrackPlayer.seekTo(startOffsetMs / 1000);
        }
        await TrackPlayer.play();
        ttsStore.setState("playing");
        ttsStore.setCurrentBook(book.id, idx, paragraphs.length);
      } catch (e) {
        console.error("TTS paragraph error", e);
        ttsStore.setState("idle");
        Alert.alert("TTS 错误", (e as Error).message || "语音合成失败");
      }
    },
    [
      book.id,
      book.title,
      book.author,
      chapterTitle,
      paragraphs,
      prefetchParagraph,
      synthesizeParagraph,
      resumeOffsetMs,
      ttsStore,
    ],
  );

  const handlePlayPause = useCallback(async () => {
    if (isPaused) {
      await TrackPlayer.play();
      ttsStore.setState("playing");
      return;
    }
    if (isPlaying) {
      await TrackPlayer.pause();
      ttsStore.setState("paused");
      await persistProgress(
        currentParagraph,
        Math.round(progress.position * 1000),
      );
      return;
    }
    if (!paragraphs.length) {
      Alert.alert("提示", "暂无内容可朗读");
      return;
    }
    await playParagraph(currentParagraph);
  }, [
    isPaused,
    isPlaying,
    paragraphs.length,
    playParagraph,
    currentParagraph,
    ttsStore,
    persistProgress,
    progress.position,
  ]);

  const handleStop = useCallback(async () => {
    await TrackPlayer.pause();
    await TrackPlayer.reset();
    ttsStore.setState("idle");
    ttsStore.setCurrentParagraph(0);
    setParagraphProgress(0);
  }, [ttsStore]);

  const handleJumpToParagraph = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= paragraphs.length) return;
      if (isPlaying || isPaused) {
        await playParagraph(idx);
      } else {
        ttsStore.setCurrentParagraph(idx);
        void persistProgress(idx);
      }
    },
    [
      paragraphs.length,
      isPlaying,
      isPaused,
      playParagraph,
      persistProgress,
      ttsStore,
    ],
  );

  const handleSkipBack = useCallback(() => {
    handleJumpToParagraph(Math.max(0, currentParagraph - 1));
  }, [currentParagraph, handleJumpToParagraph]);

  const handleSkipForward = useCallback(() => {
    handleJumpToParagraph(
      Math.min(paragraphs.length - 1, currentParagraph + 1),
    );
  }, [currentParagraph, paragraphs.length, handleJumpToParagraph]);

  const handleChapterChange = useCallback(
    async (ci: number) => {
      if (ci === chapterIndex) return;
      await TrackPlayer.pause();
      await TrackPlayer.reset();
      ttsStore.setState("idle");
      await loadChapter(ci, voiceId, provider);
      setShowChapterPicker(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterIndex, voiceId, provider],
  );

  const handleRateChange = useCallback(
    async (r: number) => {
      const newRate = Math.max(0.5, Math.min(2.0, r));
      ttsStore.setPlaybackRate(newRate);
      await TrackPlayer.setRate(newRate);
    },
    [ttsStore],
  );

  const handleVolumeChange = useCallback(
    async (v: number) => {
      ttsStore.setVolume(v);
      await TrackPlayer.setVolume(v);
    },
    [ttsStore],
  );

  const handleSleepTimerSet = useCallback((minutes: number) => {
    setSleepMinutes(minutes);
    setShowSettings(false);
    if (minutes === 0) {
      Alert.alert("睡眠定时", "已取消睡眠定时");
    } else {
      Alert.alert("睡眠定时", `${minutes} 分钟后将暂停播放`);
    }
  }, []);

  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "controls" ? "content" : "controls"));
  }, []);

  const handleMinimize = useCallback(() => {
    ttsStore.setMiniPlayerVisible(true);
    navigation.goBack();
  }, [ttsStore, navigation]);

  // ── Progress calculation ─────────────────────────────────────────────
  const overallProgress = paragraphs.length
    ? (currentParagraph + paragraphProgress) / paragraphs.length
    : 0;

  // ── Render helpers ─────────────────────────────────────────────────
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleMinimize} style={styles.headerButton}>
        <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
      </TouchableOpacity>
      {!isWideScreen && (
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={handleToggleViewMode}
        >
          <Ionicons
            name={
              viewMode === "controls"
                ? "document-text-outline"
                : "image-outline"
            }
            size={22}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => setShowSettings(true)}
      >
        <Ionicons
          name="ellipsis-vertical"
          size={22}
          color={theme.colors.text}
        />
      </TouchableOpacity>
    </View>
  );

  const renderCover = () => (
    <TouchableOpacity
      style={styles.coverSection}
      onPress={handleToggleViewMode}
      activeOpacity={0.9}
    >
      <View
        style={[
          styles.bookCoverLarge,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        {book.coverUrl ? (
          <Image
            source={{ uri: getCoverImageUrl(book.coverUrl) }}
            style={styles.bookCoverImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.coverInitialLarge}>
            {(book.title || "?").charAt(0)}
          </Text>
        )}
      </View>
      {sleepMinutes > 0 && (
        <View
          style={[styles.sleepBadge, { backgroundColor: theme.colors.primary }]}
        >
          <Ionicons name="moon" size={12} color="#fff" />
          <Text style={styles.sleepBadgeText}>
            {Math.floor(sleepRemaining / 60)}m
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderChapterInfo = () => (
    <Text style={styles.chapterTitleLarge} numberOfLines={2}>
      {book.title || "未知书籍"}
    </Text>
  );

  const renderDescription = () =>
    book.description && (
      <View style={styles.descriptionPanel}>
        <Text style={styles.settingsLabel}>简介</Text>
        <Text style={styles.descriptionText} numberOfLines={6}>
          {book.description}
        </Text>
      </View>
    );

  const renderProgress = () => (
    <View style={styles.progressSection}>
      <View style={styles.progressLabelsRow}>
        <Text style={styles.muted} numberOfLines={1}>
          {chapterTitle}
        </Text>
        <Text style={styles.muted}>{Math.round(overallProgress * 100)}%</Text>
      </View>
      <View
        style={[
          styles.progressBar,
          { backgroundColor: theme.colors.border + "40" },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.colors.primary,
              width: `${overallProgress * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );

  const handleReadBook = useCallback(() => {
    navigation.navigate("Reader", { book });
  }, [navigation, book]);

  const renderControls = () => (
    <View style={styles.controlsRow}>
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
        onPress={handleReadBook}
      >
        <Ionicons name="book-outline" size={20} color={theme.colors.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
        onPress={handleSkipBack}
      >
        <Ionicons
          name="play-skip-back-outline"
          size={22}
          color={theme.colors.text}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.playButtonLarge,
          {
            backgroundColor: isPlaying
              ? theme.colors.error
              : theme.colors.primary,
          },
        ]}
        onPress={handlePlayPause}
        disabled={isLoadingAudio}
      >
        {isLoadingAudio ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={32}
            color="#fff"
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
        onPress={handleSkipForward}
      >
        <Ionicons
          name="play-skip-forward-outline"
          size={22}
          color={theme.colors.text}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
        onPress={() => setShowChapterPicker(true)}
      >
        <Ionicons name="list-outline" size={20} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  );

  const renderBottomBar = () => (
    <View
      style={[styles.bottomBar, { backgroundColor: theme.colors.background }]}
    >
      {renderProgress()}
      {renderControls()}
    </View>
  );

  const renderParagraphList = () => (
    <FlatList
      ref={flatListRef}
      data={paragraphs}
      keyExtractor={(item) => item.id}
      style={styles.paragraphsScroll}
      renderItem={({ item, index }) => {
        const isCurrent = index === currentParagraph;
        const isPast = index < currentParagraph;
        return (
          <TouchableOpacity
            onPress={() => handleJumpToParagraph(index)}
            style={[
              styles.paragraphItem,
              isCurrent && { backgroundColor: theme.colors.primary + "25" },
            ]}
          >
            <Text
              style={[
                styles.paragraphText,
                {
                  color: isCurrent
                    ? theme.colors.text
                    : isPast
                      ? theme.colors.textSecondary
                      : theme.colors.text,
                  fontWeight: isCurrent ? "600" : "400",
                  opacity: isPast ? 0.55 : 1,
                },
              ]}
            >
              {item.text}
            </Text>
          </TouchableOpacity>
        );
      }}
      getItemLayout={(data, index) => {
        // Estimate item height based on text length (approx 40 chars per line, 24px per line + padding)
        const text = data?.[index]?.text || "";
        const lines = Math.max(1, Math.ceil(text.length / 40));
        const height = lines * 24 + 16; // 16px for padding (8 top + 8 bottom)
        return { length: height, offset: height * index, index };
      }}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
      onScrollToIndexFailed={(info) => {
        console.warn("Scroll to index failed:", info);
        // Fallback: scroll to approximate offset
        flatListRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: true,
        });
      }}
    />
  );

  const renderModals = () => (
    <>
      {/* Speed Picker Modal */}
      <Modal
        visible={showSpeedPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpeedPicker(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
            onPress={() => setShowSpeedPicker(false)}
          />
          <View
            style={[
              styles.sheetWrapper,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetInner}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>倍速</Text>
                <TouchableOpacity onPress={() => setShowSpeedPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.sleepOptions}>
                {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => {
                      handleRateChange(r);
                      setShowSpeedPicker(false);
                    }}
                    style={[
                      styles.sleepOption,
                      ttsStore.playbackRate === r && {
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sleepOptionText,
                        ttsStore.playbackRate === r && { color: "#fff" },
                      ]}
                    >
                      {r}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Timer Picker Modal */}
      <Modal
        visible={showTimerPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimerPicker(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
            onPress={() => setShowTimerPicker(false)}
          />
          <View
            style={[
              styles.sheetWrapper,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetInner}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>定时关闭</Text>
                <TouchableOpacity onPress={() => setShowTimerPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.sleepOptions}>
                {[0, 5, 10, 15, 30, 45, 60].map((minutes) => (
                  <TouchableOpacity
                    key={minutes}
                    onPress={() => {
                      handleSleepTimerSet(minutes);
                      setShowTimerPicker(false);
                    }}
                    style={[
                      styles.sleepOption,
                      sleepMinutes === minutes && {
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sleepOptionText,
                        sleepMinutes === minutes && { color: "#fff" },
                      ]}
                    >
                      {minutes === 0 ? "关闭" : `${minutes} 分钟`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Bottom Sheet - More Options */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
            onPress={() => setShowSettings(false)}
          />
          <View
            style={[
              styles.sheetWrapper,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetInner}>
              <View style={styles.sheetHandle} />

              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>
                更多选项
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => {
                    setShowSettings(false);
                    setShowSpeedPicker(true);
                  }}
                >
                  <Ionicons
                    name="speedometer-outline"
                    size={22}
                    color={theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.sheetOptionText,
                      { color: theme.colors.text },
                    ]}
                  >
                    播放倍速
                  </Text>
                  <Text
                    style={[
                      styles.sheetOptionValue,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {ttsStore.playbackRate.toFixed(1)}x
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => {
                    setShowSettings(false);
                    setShowTimerPicker(true);
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={22}
                    color={theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.sheetOptionText,
                      { color: theme.colors.text },
                    ]}
                  >
                    定时关闭
                  </Text>
                  <Text
                    style={[
                      styles.sheetOptionValue,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {sleepMinutes > 0 ? `${sleepMinutes}分钟` : "关闭"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => {
                    setShowSettings(false);
                    setShowTTSConfig(true);
                  }}
                >
                  <Ionicons
                    name="options-outline"
                    size={22}
                    color={theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.sheetOptionText,
                      { color: theme.colors.text },
                    ]}
                  >
                    TTS 设置
                  </Text>
                  <Text
                    style={[
                      styles.sheetOptionValue,
                      { color: theme.colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {providerLabel(provider)} ·{" "}
                    {(() => {
                      const v = voices.find((v) => v.id === voiceId);
                      return v ? formatVoiceName(v, provider) : "默认";
                    })()}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                <View
                  style={[
                    styles.sheetDivider,
                    { backgroundColor: theme.colors.border + "40" },
                  ]}
                />
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* TTS Config Modal */}
      <Modal
        visible={showTTSConfig}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTTSConfig(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
            onPress={() => setShowTTSConfig(false)}
          />
          <View
            style={[
              styles.sheetWrapper,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetInner}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>
                TTS 设置
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text
                  style={[
                    styles.sheetSectionTitle,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  TTS 服务商
                </Text>
                <View style={styles.chipRow}>
                  {providers.map((p) => {
                    const active = provider === p.name;
                    return (
                      <TouchableOpacity
                        key={p.name}
                        disabled={!p.enabled}
                        onPress={() => setProvider(p.name)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active
                              ? theme.colors.primary
                              : theme.colors.background,
                            opacity: p.enabled ? 1 : 0.4,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? "#fff" : theme.colors.text },
                          ]}
                        >
                          {providerLabel(p.name)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={[
                    styles.sheetSectionTitle,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  音色
                </Text>
                <View style={styles.voiceList}>
                  {voices
                    .filter((v) => {
                      const lang = (v.language || v.lang || "").toLowerCase();
                      return lang.startsWith("zh");
                    })
                    .map((v) => {
                      const active = voiceId === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => {
                            setVoiceId(v.id);
                            ttsStore.setSelectedVoice(v);
                          }}
                          style={[
                            styles.voiceListItem,
                            active && {
                              backgroundColor: theme.colors.primary + "20",
                              borderColor: theme.colors.primary,
                            },
                          ]}
                        >
                          <View style={styles.voiceListLeft}>
                            <Text
                              style={[
                                styles.voiceListName,
                                {
                                  color: active
                                    ? theme.colors.primary
                                    : theme.colors.text,
                                },
                              ]}
                            >
                              {formatVoiceName(v, provider)}
                            </Text>
                            <Text style={styles.voiceListLang}>
                              {v.language || v.lang || "zh-CN"}
                            </Text>
                          </View>
                          {active && (
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color={theme.colors.primary}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Chapter Picker Modal */}
      <Modal
        visible={showChapterPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChapterPicker(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
            onPress={() => setShowChapterPicker(false)}
          />
          <View
            style={[
              styles.sheetWrapper,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetInner}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>章节列表</Text>
                <TouchableOpacity onPress={() => setShowChapterPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {chapters.map((c) => {
                  const active = chapterIndex === c.index;
                  return (
                    <TouchableOpacity
                      key={c.index}
                      onPress={() => handleChapterChange(c.index)}
                      style={[
                        styles.chapterListItem,
                        active && {
                          backgroundColor: theme.colors.primary + "20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chapterListText,
                          {
                            color: active
                              ? theme.colors.primary
                              : theme.colors.text,
                          },
                        ]}
                      >
                        <Text style={styles.chapterListNumber}>
                          {c.index + 1}.{" "}
                        </Text>
                        {c.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.muted}>加载听书内容…</Text>
        </View>
      </View>
    );
  }

  if (loadError || !paragraphs.length) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      >
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>{loadError || "无法加载内容"}</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.buttonText}>返回</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Wide Screen Layout (tablet/desktop) ──────────────────────────────
  if (isWideScreen) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      >
        {renderHeader()}
        <View style={styles.wideContainer}>
          {/* Left Panel: Cover + Info + Controls */}
          <View style={styles.wideLeftPanel}>
            <ScrollView contentContainerStyle={styles.wideLeftContent}>
              {renderCover()}
              {renderChapterInfo()}
              {renderDescription()}
            </ScrollView>
            {renderBottomBar()}
          </View>

          {/* Right Panel: Paragraph List */}
          <View style={styles.wideRightPanel}>
            <Text style={styles.wideRightHeader}>{chapterTitle}</Text>
            {renderParagraphList()}
          </View>
        </View>
        {renderModals()}
      </View>
    );
  }

  // ── Mobile Layout: Controls View ───────────────────────────────────
  if (viewMode === "controls") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      >
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.controlsContent}>
          {renderCover()}
          {renderChapterInfo()}
          {renderDescription()}
        </ScrollView>
        {renderBottomBar()}
        {renderModals()}
      </View>
    );
  }

  // ── Mobile Layout: Content View ────────────────────────────────────
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
    >
      {renderHeader()}
      <View style={styles.contentViewContainer}>
        {renderParagraphList()}
        {renderBottomBar()}
      </View>
      {renderModals()}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    muted: {
      color: theme.colors.textSecondary,
      fontSize: fontSizes.sm,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: fontSizes.md,
      textAlign: "center",
    },
    button: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    buttonText: {
      color: "#fff",
      fontSize: fontSizes.md,
      fontWeight: "600",
    },
    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    headerButton: {
      padding: spacing.sm,
      width: 48,
      alignItems: "center",
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
    },
    headerTitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    headerSubtitle: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: theme.colors.text,
    },
    // Wide screen layout
    wideContainer: {
      flex: 1,
      flexDirection: "row",
    },
    wideLeftPanel: {
      width: 360,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border + "30",
    },
    wideLeftContent: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
      alignItems: "center",
    },
    wideRightPanel: {
      flex: 1,
    },
    wideRightHeader: {
      fontSize: fontSizes.lg,
      fontWeight: "600",
      color: theme.colors.text,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    // Controls view
    controlsContent: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
      alignItems: "center",
    },
    coverSection: {
      alignItems: "center",
      marginBottom: spacing.lg,
      position: "relative",
    },
    bookCoverLarge: {
      width: 160,
      height: 224,
      borderRadius: borderRadius.xl,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
      overflow: "hidden",
    },
    bookCoverImage: {
      width: "100%",
      height: "100%",
    },
    coverInitialLarge: {
      fontSize: 52,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
    tapHint: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
    sleepBadge: {
      position: "absolute",
      top: spacing.sm,
      right: "20%",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      gap: spacing.xs,
    },
    sleepBadgeText: {
      fontSize: fontSizes.xs,
      color: "#fff",
      fontWeight: "600",
    },
    chapterTitleLarge: {
      fontSize: fontSizes.xl,
      fontWeight: "600",
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: spacing.xs,
    },
    bookAuthorLarge: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: spacing.lg,
    },
    progressSection: {
      width: "100%",
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    progressLabelsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
    },
    progressBar: {
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
    },
    // Controls row
    controlsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    playButtonLarge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      borderRadius: borderRadius.sm,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    badgeText: {
      fontSize: 10,
      color: "#fff",
      fontWeight: "600",
    },
    // Picker dropdown
    pickerDropdown: {
      width: "100%",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
    },
    // Settings
    settingsPanel: {
      width: "100%",
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    settingsTitle: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: spacing.xs,
    },
    settingsLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
    },
    chipText: {
      fontSize: fontSizes.sm,
    },
    // Description
    descriptionPanel: {
      width: "100%",
    },
    descriptionText: {
      fontSize: fontSizes.sm,
      color: theme.colors.text,
      lineHeight: fontSizes.sm * 1.6,
    },
    // Bottom fixed bar
    bottomBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border + "30",
    },
    contentViewContainer: {
      flex: 1,
    },
    paragraphsScroll: {
      flex: 1,
      padding: spacing.md,
    },
    paragraphItem: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
      marginBottom: spacing.xs,
    },
    paragraphText: {
      fontSize: fontSizes.md,
      lineHeight: fontSizes.md * 1.5,
    },
    // Modal
    modalOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    modalContent: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: "70%",
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      padding: spacing.lg,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "600",
      color: theme.colors.text,
    },
    chapterListItem: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border + "30",
    },
    chapterListText: {
      fontSize: fontSizes.md,
    },
    chapterListNumber: {
      color: theme.colors.textSecondary,
      fontSize: fontSizes.sm,
    },
    sleepOptions: {
      gap: spacing.sm,
    },
    sleepOption: {
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.background,
      alignItems: "center",
    },
    sleepOptionText: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    // Voice list (vertical)
    voiceList: {
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    voiceListItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border + "40",
      backgroundColor: theme.colors.background,
    },
    voiceListLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    voiceListName: {
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    voiceListLang: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    // Bottom Sheet (More Options)
    sheetWrapper: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      maxHeight: "60%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    sheetInner: {
      width: "100%",
      maxWidth: 600,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      backgroundColor: "rgba(150,150,150,0.3)",
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: spacing.md,
      marginTop: spacing.xs,
    },
    sheetTitle: {
      fontSize: fontSizes.xl,
      fontWeight: "600",
      textAlign: "center",
      marginBottom: spacing.lg,
    },
    sheetQuickControls: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    sheetQuickItem: {
      alignItems: "center",
      gap: spacing.xs,
      flex: 1,
    },
    sheetQuickIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    sheetQuickLabel: {
      fontSize: fontSizes.sm,
      fontWeight: "500",
    },
    sheetQuickValue: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
    },
    sheetDivider: {
      height: 1,
      marginVertical: spacing.sm,
    },
    sheetSectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sheetOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    sheetOptionText: {
      flex: 1,
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    sheetOptionValue: {
      fontSize: fontSizes.sm,
      marginRight: spacing.xs,
      maxWidth: 120,
    },
  });
}
