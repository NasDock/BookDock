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
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  SafeAreaView,
  ScrollView,
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

  // ── Sync state from store when expanding from mini player ──────────
  useEffect(() => {
    if (ttsStore.currentBookId === book.id && ttsStore.paragraphs.length > 0) {
      setParagraphs(ttsStore.paragraphs);
      setChapterTitle(ttsStore.chapterTitle);
      setChapterIndex(ttsStore.chapterIndex);
      setCurrentParagraph(ttsStore.currentParagraph);
      if (ttsStore.selectedProvider) setProvider(ttsStore.selectedProvider);
      if (ttsStore.selectedVoice?.id) setVoiceId(ttsStore.selectedVoice.id);
      setLoading(false);
    }
  }, []);

  // ── Book + chapter state ─────────────────────────────────────────────
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterIndex, setChapterIndex] = useState(0);
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
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  // View mode: 'controls' = cover + controls, 'content' = paragraph list
  const [viewMode, setViewMode] = useState<'controls' | 'content'>('controls');

  // RNTP progress
  const playbackState = usePlaybackState();
  const progress = useProgress();

  // Use ttsStore state for UI to avoid flicker during paragraph transitions
  const isPlaying = ttsStore.state === 'playing';
  const isPaused = ttsStore.state === 'paused';
  const isLoadingAudio = ttsStore.state === 'loading' || playbackState === State.Connecting || playbackState === State.Buffering;

  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [paragraphProgress, setParagraphProgress] = useState(0);
  const [resumeOffsetMs, setResumeOffsetMs] = useState(0);

  const prefetchedRef = useRef<Map<string, string>>(new Map());
  const cancelledRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paragraphsScrollRef = useRef<ScrollView>(null);
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
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          progressUpdateEventInterval: 1,
        });
        // Only reset if nothing is playing (avoid interrupting playback from mini player)
        const state = await TrackPlayer.getPlaybackState();
        if (state.state !== State.Playing && state.state !== State.Buffering) {
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
      if (ttsStore.currentBookId === book.id && ttsStore.paragraphs.length > 0 && ttsStore.state === 'playing') {
        console.log('[TTSScreen] Already playing this book, skipping reload');
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setLoadError(null);
      try {
        const apiClient = getApiClient();
        console.log('[TTSScreen] Starting load, book.id:', book.id);
        
        // Save book data to store for mini player
        ttsStore.setCurrentBookData(book);

        // Providers
        const provRes = await apiClient.getTtsProviders();
        console.log('[TTSScreen] Providers response:', JSON.stringify(provRes));
        if (cancelled) return;
        const ps = (provRes.success && provRes.data?.providers) || [];
        setProviders(ps);
        const enabledNames = ps.filter((p) => p.enabled).map((p) => p.name);
        const finalProvider = enabledNames.includes(provider)
          ? provider
          : enabledNames[0] || "edge";
        console.log('[TTSScreen] Final provider:', finalProvider);
        if (finalProvider !== provider) setProvider(finalProvider);

        // Voices
        const vRes = await apiClient.getVoices(finalProvider);
        console.log('[TTSScreen] Voices response:', JSON.stringify(vRes));
        if (cancelled) return;
        const vs = (vRes.success && vRes.data) || [];
        setVoices(vs);
        if (!voiceId && vs[0]) setVoiceId(vs[0].id);

        // Chapters
        console.log('[TTSScreen] Loading chapters for book:', book.id);
        const chRes = await apiClient.getChapters(book.id);
        console.log('[TTSScreen] Chapters response:', JSON.stringify(chRes));
        if (cancelled) return;
        if (!chRes.success || !chRes.data || chRes.data.length === 0) {
          console.log('[TTSScreen] No chapters found');
          setLoadError("本书暂无章节内容，请先解析章节。");
          return;
        }
        setChapters(chRes.data);
        chaptersRef.current = chRes.data;

        // Load first chapter (loadChapter will skip empty ones)
        console.log('[TTSScreen] Loading chapter 0, voice:', vs[0]?.id || voiceId, 'provider:', finalProvider);
        await loadChapter(0, vs[0]?.id || voiceId, finalProvider);
      } catch (e) {
        console.error('[TTSScreen] Load error:', e);
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
        if (!vs.find((v) => v.id === voiceId)) {
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
    const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      console.log('[TTSScreen] Queue ended');
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
    });
    return () => sub.remove();
  }, [currentParagraph, paragraphs.length, chapterIndex, voiceId, provider, ttsStore]);

  // ── TrackPlayer event: active track changed → update current paragraph ─
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      if (event.index === undefined) return;
      
      // Get current track to determine which paragraph we're on
      const track = await TrackPlayer.getTrack(event.index);
      if (!track?.id) return;
      
      // Extract paragraph index from track ID (format: "paraId-chunkIdx")
      const paraId = track.id.split('-')[0];
      const paraIdx = paragraphs.findIndex(p => p.id === paraId);
      
      if (paraIdx >= 0 && paraIdx !== currentParagraph) {
        setCurrentParagraph(paraIdx);
        ttsStore.setCurrentParagraph(paraIdx);
        
        // Add next paragraph to queue for seamless playback
        try {
          const nextIdx = paraIdx + 1;
          if (nextIdx < paragraphs.length) {
            const nextUris = await synthesizeParagraph(nextIdx);
            if (nextUris.length > 0) {
              const nextTracks = nextUris.map((uri, i) => ({
                id: `${paragraphs[nextIdx].id}-${i}`,
                url: uri,
                title: `${book.title || '未知书籍'} - ${chapterTitle}`,
                artist: book.author || "未知作者",
                artwork: undefined,
                duration: 0,
              }));
              await TrackPlayer.add(nextTracks);
            }
          }
        } catch {
          // Ignore prefetch errors
        }
      }
    });
    return () => sub.remove();
  }, [ttsStore, paragraphs, currentParagraph, book, chapterTitle, synthesizeParagraph]);

  // Auto-scroll to current paragraph in content view
  useEffect(() => {
    if (viewMode === 'content' && currentParagraph >= 0) {
      const ref = paragraphRefs.current.get(currentParagraph);
      if (ref && paragraphsScrollRef.current) {
        ref.measureLayout(
          paragraphsScrollRef.current as any,
          (_x, y) => {
            paragraphsScrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
          },
          () => {}
        );
      }
    }
  }, [currentParagraph, viewMode]);

  const loadChapter = async (ci: number, vid: string, prov: string) => {
    console.log('[TTSScreen] loadChapter called, ci:', ci, 'vid:', vid, 'prov:', prov);
    setChapterIndex(ci);
    try {
      const apiClient = getApiClient();
      console.log('[TTSScreen] Fetching paragraphs for book:', book.id, 'chapter:', ci);
      const pRes = await apiClient.getChapterParagraphs(book.id, ci);
      console.log('[TTSScreen] Paragraphs response:', JSON.stringify(pRes).substring(0, 500));
      if (!pRes.success || !pRes.data) {
        console.log('[TTSScreen] Failed to load paragraphs:', pRes);
        setLoadError("加载章节失败");
        return;
      }
      console.log('[TTSScreen] Paragraphs loaded, count:', pRes.data.paragraphs?.length);

      // If chapter has no paragraphs, try next chapter
      if (!pRes.data.paragraphs || pRes.data.paragraphs.length === 0) {
        const nextChapter = ci + 1;
        if (nextChapter < chaptersRef.current.length) {
          console.log('[TTSScreen] Chapter empty, trying next:', nextChapter);
          return loadChapter(nextChapter, vid, prov);
        } else {
          setLoadError("没有可朗读的内容");
          return;
        }
      }

      setChapterTitle(pRes.data.title);
      setParagraphs(pRes.data.paragraphs);
      setCurrentParagraph(0);
      setParagraphProgress(0);
      setResumeOffsetMs(0);
      prefetchedRef.current.clear();
      ttsStore.setParagraphs(pRes.data.paragraphs);
      ttsStore.setTotalParagraphs(pRes.data.paragraphs.length);
      ttsStore.setChapterTitle(pRes.data.title);
      ttsStore.setChapterIndex(ci);

      // Resume from saved cloud progress
      try {
        const prog = await apiClient.getTtsProgress(book.id, ci);
        if (prog.success && prog.data && !Array.isArray(prog.data)) {
          const rec = prog.data;
          if (rec.provider) {
            setProvider(rec.provider);
            ttsStore.setSelectedProvider(rec.provider);
          }
          if (rec.voice) setVoiceId(rec.voice);
          setResumeOffsetMs(Math.max(0, rec.audioOffsetMs || 0));
          setCurrentParagraph(
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
      await persistProgress(currentParagraph, Math.round(progress.position * 1000));
      // Sync state to store
      ttsStore.setParagraphs(paragraphs);
      ttsStore.setTotalParagraphs(paragraphs.length);
      ttsStore.setChapterTitle(chapterTitle);
      ttsStore.setChapterIndex(chapterIndex);
      ttsStore.setCurrentParagraph(currentParagraph);
      ttsStore.setMiniPlayerVisible(true);
    });
    return unsubscribe;
  }, [currentParagraph, navigation, persistProgress, progress.position, ttsStore, paragraphs, chapterTitle, chapterIndex]);

  // ── Persist progress when app goes to background ────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        void persistProgress(currentParagraph, Math.round(progress.position * 1000));
      }
    });
    return () => subscription.remove();
  }, [currentParagraph, persistProgress, progress.position]);

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
        setCurrentParagraph(0);
        setParagraphProgress(0);
        ttsStore.setState("idle");
        return;
      }
      setCurrentParagraph(idx);
      setParagraphProgress(0);
      ttsStore.setCurrentParagraph(idx);
      const startOffsetMs = resumeOffsetMs;
      setResumeOffsetMs(0);

      try {
        // Synthesize current and next paragraph
        const uris = await synthesizeParagraph(idx);
        if (uris.length === 0) return;

        // Build tracks for current paragraph
        const tracks = uris.map((uri, i) => ({
          id: `${paragraphs[idx].id}-${i}`,
          url: uri,
          title: `${book.title || '未知书籍'} - ${chapterTitle}`,
          artist: book.author || "未知作者",
          artwork: undefined,
          duration: 0,
        }));

        // Reset and add current paragraph
        await TrackPlayer.reset();
        await TrackPlayer.add(tracks);

        // Try to add next paragraph to queue for seamless playback
        try {
          if (idx + 1 < paragraphs.length) {
            const nextUris = await synthesizeParagraph(idx + 1);
            if (nextUris.length > 0) {
              const nextTracks = nextUris.map((uri, i) => ({
                id: `${paragraphs[idx + 1].id}-${i}`,
                url: uri,
                title: `${book.title || '未知书籍'} - ${chapterTitle}`,
                artist: book.author || "未知作者",
                artwork: undefined,
                duration: 0,
              }));
              await TrackPlayer.add(nextTracks);
            }
          }
        } catch {
          // Ignore prefetch errors
        }

        if (startOffsetMs > 0) {
          await TrackPlayer.seekTo(startOffsetMs / 1000);
        }
        await TrackPlayer.play();
        ttsStore.setCurrentBook(book.id, idx, paragraphs.length);
        ttsStore.setState("playing");
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
      await persistProgress(currentParagraph, Math.round(progress.position * 1000));
      return;
    }
    if (!paragraphs.length) {
      Alert.alert("提示", "暂无内容可朗读");
      return;
    }
    await playParagraph(currentParagraph);
  }, [isPaused, isPlaying, paragraphs.length, playParagraph, currentParagraph, ttsStore, persistProgress, progress.position]);

  const handleStop = useCallback(async () => {
    await TrackPlayer.reset();
    ttsStore.setState("idle");
    setCurrentParagraph(0);
    setParagraphProgress(0);
  }, [ttsStore]);

  const handleJumpToParagraph = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= paragraphs.length) return;
      if (isPlaying || isPaused) {
        await playParagraph(idx);
      } else {
        setCurrentParagraph(idx);
        ttsStore.setCurrentParagraph(idx);
        void persistProgress(idx);
      }
    },
    [paragraphs.length, isPlaying, isPaused, playParagraph, persistProgress, ttsStore],
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
      console.log('[TTSScreen] handleChapterChange called, ci:', ci, 'chapterIndex:', chapterIndex);
      if (ci === chapterIndex) {
        console.log('[TTSScreen] Same chapter, skipping');
        return;
      }
      try {
        await TrackPlayer.reset();
        ttsStore.setState("idle");
        console.log('[TTSScreen] Loading chapter:', ci);
        await loadChapter(ci, voiceId, provider);
        console.log('[TTSScreen] Chapter loaded, closing picker');
        setShowChapterPicker(false);
      } catch (e) {
        console.error('[TTSScreen] handleChapterChange error:', e);
      }
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
    setViewMode((prev) => (prev === 'controls' ? 'content' : 'controls'));
  }, []);

  const handleMinimize = useCallback(() => {
    // Sync current state to store before minimizing
    ttsStore.setParagraphs(paragraphs);
    ttsStore.setTotalParagraphs(paragraphs.length);
    ttsStore.setChapterTitle(chapterTitle);
    ttsStore.setChapterIndex(chapterIndex);
    ttsStore.setCurrentParagraph(currentParagraph);
    ttsStore.setMiniPlayerVisible(true);
    navigation.goBack();
  }, [ttsStore, navigation, paragraphs, chapterTitle, chapterIndex, currentParagraph]);

  // ── Progress calculation ─────────────────────────────────────────────
  const overallProgress = paragraphs.length
    ? (currentParagraph + paragraphProgress) / paragraphs.length
    : 0;

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.muted}>加载听书内容…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !paragraphs.length) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
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
      </SafeAreaView>
    );
  }

  // ── Controls View ────────────────────────────────────────────────────
  if (viewMode === 'controls') {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleMinimize} style={styles.headerButton}>
            <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{book.title || '未知书籍'}</Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowSettings(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.controlsContent}>
          {/* Book Cover - tap to switch to content view */}
          <TouchableOpacity
            style={styles.coverSection}
            onPress={handleToggleViewMode}
            activeOpacity={0.9}
          >
            <View style={[styles.bookCoverLarge, { backgroundColor: theme.colors.surface }]}>
              {book.coverUrl ? (
                <Image
                  source={{ uri: getCoverImageUrl(book.coverUrl) }}
                  style={styles.bookCoverImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.coverInitialLarge}>{(book.title || '?').charAt(0)}</Text>
              )}
            </View>
            {sleepMinutes > 0 && (
              <View style={[styles.sleepBadge, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="moon" size={12} color="#fff" />
                <Text style={styles.sleepBadgeText}>
                  {Math.floor(sleepRemaining / 60)}m
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Chapter Info */}
          <Text style={styles.chapterTitleLarge} numberOfLines={2}>
            {chapterTitle}
          </Text>
          <Text style={styles.bookAuthorLarge}>{book.author}</Text>

          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelsRow}>
              <Text style={styles.muted}>
                第 {currentParagraph + 1} 段 / 共 {paragraphs.length} 段
              </Text>
              <Text style={styles.muted}>{Math.round(overallProgress * 100)}%</Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.border + '40' }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.colors.primary, width: `${overallProgress * 100}%` },
                ]}
              />
            </View>
          </View>

          {/* Playback Controls - compact row */}
          <View style={styles.controlsRow}>
            {/* Settings */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
            </TouchableOpacity>

            {/* Speed */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={() => setShowSpeedPicker(!showSpeedPicker)}
            >
              <Ionicons name="speedometer-outline" size={20} color={theme.colors.text} />
              {ttsStore.playbackRate !== 1.0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.badgeText}>{ttsStore.playbackRate.toFixed(1)}x</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Skip back */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={handleSkipBack}
            >
              <Ionicons name="play-skip-back-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            {/* Play/Pause */}
            <TouchableOpacity
              style={[styles.playButtonLarge, { backgroundColor: isPlaying ? theme.colors.error : theme.colors.primary }]}
              onPress={handlePlayPause}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            {/* Skip forward */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={handleSkipForward}
            >
              <Ionicons name="play-skip-forward-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            {/* Chapter picker */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={() => setShowChapterPicker(true)}
            >
              <Ionicons name="book-outline" size={20} color={theme.colors.text} />
            </TouchableOpacity>

            {/* Sleep timer */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
              onPress={() => setShowTimerPicker(!showTimerPicker)}
            >
              <Ionicons name="time-outline" size={20} color={theme.colors.text} />
              {sleepMinutes > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.warning }]}>
                  <Text style={styles.badgeText}>{Math.floor(sleepRemaining / 60)}m</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Book description */}
          {book.description && (
            <View style={styles.descriptionPanel}>
              <Text style={styles.settingsLabel}>简介</Text>
              <Text style={styles.descriptionText} numberOfLines={6}>
                {book.description}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Chapter Picker Modal */}
        {showChapterPicker && (
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowChapterPicker(false)} />
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>章节列表</Text>
                <TouchableOpacity onPress={() => setShowChapterPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {chapters.map((c) => {
                  const active = chapterIndex === c.index;
                  return (
                    <TouchableOpacity
                      key={c.index}
                      onPress={() => handleChapterChange(c.index)}
                      style={[
                        styles.chapterListItem,
                        active && { backgroundColor: theme.colors.primary + '20' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chapterListText,
                          { color: active ? theme.colors.primary : theme.colors.text },
                        ]}
                      >
                        <Text style={styles.chapterListNumber}>{c.index + 1}. </Text>
                        {c.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Speed Picker Modal */}
        {showSpeedPicker && (
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSpeedPicker(false)} />
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
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
                      ttsStore.playbackRate === r && { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <Text style={[styles.sleepOptionText, ttsStore.playbackRate === r && { color: '#fff' }]}>
                      {r}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Timer Picker Modal */}
        {showTimerPicker && (
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowTimerPicker(false)} />
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
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
                      sleepMinutes === minutes && { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <Text style={[styles.sleepOptionText, sleepMinutes === minutes && { color: '#fff' }]}>
                      {minutes === 0 ? '关闭' : `${minutes} 分钟`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Settings Bottom Sheet */}
        {showSettings && (
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettings(false)} />
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>播放设置</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {/* Provider section */}
                <Text style={styles.settingsLabel}>TTS 服务商</Text>
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
                            backgroundColor: active ? theme.colors.primary : theme.colors.background,
                            opacity: p.enabled ? 1 : 0.4,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#fff' : theme.colors.text }]}>
                          {providerLabel(p.name)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Voice section */}
                <Text style={styles.settingsLabel}>音色</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {voices.map((v) => {
                    const active = voiceId === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => {
                          setVoiceId(v.id);
                          ttsStore.setSelectedVoice(v);
                        }}
                        style={[
                          styles.chip,
                          { backgroundColor: active ? theme.colors.primary : theme.colors.background },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#fff' : theme.colors.text }]}>
                          {v.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </ScrollView>
            </View>
          </View>
        )}

      </SafeAreaView>
    );
  }

  // ── Content View (Paragraph List) ────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleToggleViewMode} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerSubtitle} numberOfLines={1}>{chapterTitle}</Text>
      </View>
        <View style={styles.headerButton} />
      </View>

      {/* Paragraph list */}
      <ScrollView ref={paragraphsScrollRef} style={styles.paragraphsScroll}>
        {paragraphs.map((p, idx) => {
          const isCurrent = idx === currentParagraph;
          const isPast = idx < currentParagraph;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => handleJumpToParagraph(idx)}
              ref={(ref) => { if (ref) paragraphRefs.current.set(idx, ref as any); }}
              style={[
                styles.paragraphItem,
                isCurrent && { backgroundColor: theme.colors.primary + '25' },
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
                    fontWeight: isCurrent ? '600' : '400',
                    opacity: isPast ? 0.55 : 1,
                  },
                ]}
              >
                {p.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    muted: {
      color: theme.colors.textSecondary,
      fontSize: fontSizes.sm,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: fontSizes.md,
      textAlign: 'center',
    },
    button: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    buttonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    headerButton: {
      padding: spacing.sm,
      width: 48,
      alignItems: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    headerSubtitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    // Controls view
    controlsContent: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
      alignItems: 'center',
    },
    coverSection: {
      alignItems: 'center',
      marginBottom: spacing.lg,
      position: 'relative',
    },
    bookCoverLarge: {
      width: 160,
      height: 224,
      borderRadius: borderRadius.xl,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
      overflow: 'hidden',
    },
    bookCoverImage: {
      width: '100%',
      height: '100%',
    },
    coverInitialLarge: {
      fontSize: 52,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    tapHint: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
    sleepBadge: {
      position: 'absolute',
      top: spacing.sm,
      right: '20%',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      gap: spacing.xs,
    },
    sleepBadgeText: {
      fontSize: fontSizes.xs,
      color: '#fff',
      fontWeight: '600',
    },
    chapterTitleLarge: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    bookAuthorLarge: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    progressSection: {
      width: '100%',
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    progressLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    progressBar: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    // Controls row
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    playButtonLarge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      borderRadius: borderRadius.sm,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    badgeText: {
      fontSize: 10,
      color: '#fff',
      fontWeight: '600',
    },
    // Picker dropdown
    pickerDropdown: {
      width: '100%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
    },
    // Settings
    settingsPanel: {
      width: '100%',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    settingsTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.xs,
    },
    settingsLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
      width: '100%',
    },
    descriptionText: {
      fontSize: fontSizes.sm,
      color: theme.colors.text,
      lineHeight: fontSizes.sm * 1.6,
    },
    // Content view
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
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '70%',
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      padding: spacing.lg,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
    },
    chapterListItem: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border + '30',
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
      alignItems: 'center',
    },
    sleepOptionText: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
  });
}
