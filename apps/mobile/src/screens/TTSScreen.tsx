/**
 * Mobile TTS Screen — paragraph-by-paragraph audio reading.
 *
 *  - Loads paragraphs via /books/:id/paragraphs?chapter=N
 *  - Synthesises one paragraph at a time, plays it through expo-av,
 *    auto-advances to the next paragraph on completion
 *  - Real-time paragraph highlight (active paragraph gets a tinted
 *    background and font-weight bump)
 *  - Click any paragraph to jump there
 *  - Provider / voice / rate / volume can be tweaked locally for this
 *    page; defaults are loaded from ttsStore (set in Settings)
 *  - Reading position is saved to /tts/progress on each paragraph change
 */
import {
  getApiClient,
  Paragraph,
  TTSProvider,
  TTSVoice,
} from "@bookdock/api-client";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { RootStackParamList } from "../navigation/types";
import { useThemeStore, useTTSStore } from "../stores";
import { borderRadius, fontSizes, getTheme, spacing } from "../utils/theme";

type TTSScreenRouteProp = RouteProp<RootStackParamList, "TTSScreen">;

const providerLabel = (name: string) => {
  if (name === "edge") return "Microsoft Edge TTS";
  if (name === "mi") return "小米 TTS";
  return name;
};

/**
 * Split a paragraph into ≤ maxLen-character chunks. Breaks on sentence
 * boundaries (CJK + Western), then hard-cuts at whitespace as a
 * last resort. Mirrors the helper in @bookdock/tts.
 */
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

const TTS_CHUNK_MAX = 2500;

export function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute<TTSScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === "dark");
  const ttsStore = useTTSStore();

  // ── Book + chapter state ─────────────────────────────────────────────
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<{ title: string; index: number }[]>(
    [],
  );
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [paragraphProgress, setParagraphProgress] = useState(0); // 0..1 within the current paragraph
  /** ms offset within the saved paragraph to resume at, populated
   *  by loadChapter() and consumed on the next play. */
  const [resumeOffsetMs, setResumeOffsetMs] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const prefetchedRef = useRef<Map<string, string>>(new Map()); // paragraphId → audio URI
  const cancelledRef = useRef(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Load providers + voices + chapter content ──────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const apiClient = getApiClient();

        // Providers
        const provRes = await apiClient.getTtsProviders();
        if (cancelled) return;
        const ps = (provRes.success && provRes.data?.providers) || [];
        setProviders(ps);
        // Default to a known-enabled provider if the stored one isn't in the list
        const enabledNames = ps.filter((p) => p.enabled).map((p) => p.name);
        const finalProvider = enabledNames.includes(provider)
          ? provider
          : enabledNames[0] || "edge";
        if (finalProvider !== provider) setProvider(finalProvider);

        // Voices
        const vRes = await apiClient.getVoices(finalProvider);
        if (cancelled) return;
        const vs = (vRes.success && vRes.data) || [];
        setVoices(vs);
        if (!voiceId && vs[0]) setVoiceId(vs[0].id);

        // Chapters
        const chRes = await apiClient.getChapters(book.id);
        if (cancelled) return;
        if (!chRes.success || !chRes.data || chRes.data.length === 0) {
          setLoadError("本书暂无章节内容，请先解析章节。");
          return;
        }
        setChapters(chRes.data);

        // Load first chapter paragraphs
        await loadChapter(0, vs[0]?.id || voiceId, finalProvider);
      } catch (e) {
        setLoadError((e as Error).message || "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanupAudio();
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

  const loadChapter = async (ci: number, vid: string, prov: string) => {
    setChapterIndex(ci);
    try {
      const apiClient = getApiClient();
      const pRes = await apiClient.getChapterParagraphs(book.id, ci);
      if (!pRes.success || !pRes.data) {
        setLoadError("加载章节失败");
        return;
      }
      setChapterTitle(pRes.data.title);
      setParagraphs(pRes.data.paragraphs);
      setCurrentParagraph(0);
      setParagraphProgress(0);
      setResumeOffsetMs(0);
      prefetchedRef.current.clear();
      // Resume from saved cloud progress (cross-device sync)
      try {
        const prog = await apiClient.getTtsProgress(book.id, ci);
        if (prog.success && prog.data && !Array.isArray(prog.data)) {
          const rec = prog.data;
          // Apply saved voice/provider so the first synthesis uses them
          if (rec.provider) {
            setProvider(rec.provider);
            ttsStore.setSelectedProvider(rec.provider);
          }
          if (rec.voice) {
            setVoiceId(rec.voice);
          }
          // Stash the byte offset for the next play() call
          setResumeOffsetMs(Math.max(0, rec.audioOffsetMs || 0));
          setCurrentParagraph(
            Math.min(rec.paragraphIndex, pRes.data.paragraphs.length - 1),
          );
        }
      } catch {
        /* ignore */
      }
      // Save provider/voice in the store so the user only configures once
      ttsStore.setSelectedProvider(prov);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };

  const cleanupAudio = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
    }
  }, []);

  const persistProgress = useCallback(
    (idx: number, audioOffsetMs = 0) => {
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
      Promise.all([
        apiClient.saveTtsProgress(ttsPayload).catch(() => {
          /* ignore */
        }),
        apiClient.saveBookLastRead(lastReadPayload).catch(() => {
          /* ignore */
        }),
      ]);
    },
    [book.id, chapterIndex, paragraphs.length, voiceId, provider],
  );

  const resolveAudioUrl = (
    url: string,
    apiClient: ReturnType<typeof getApiClient>,
  ) => {
    if (url.startsWith("http")) return url;
    return `${apiClient.serverBaseURL}${url}`;
  };

  // ── Persist latest position when user leaves the screen ─────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", async () => {
      try {
        const status = await soundRef.current?.getStatusAsync();
        const offsetMs =
          status?.isLoaded && typeof status.positionMillis === "number"
            ? status.positionMillis
            : 0;
        persistProgress(currentParagraph, offsetMs);
      } catch {
        persistProgress(currentParagraph, 0);
      }
    });
    return unsubscribe;
  }, [currentParagraph, navigation, persistProgress]);

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

  const playParagraph = useCallback(
    async (idx: number) => {
      if (idx >= paragraphs.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentParagraph(0);
        setParagraphProgress(0);
        ttsStore.setState("idle");
        return;
      }
      const para = paragraphs[idx];
      setCurrentParagraph(idx);
      setParagraphProgress(0);
      // The first call after a saved cloud resume carries the offset
      // we want to skip into; persist progress only once we've actually
      // landed at that position.
      const startOffsetMs = resumeOffsetMs;
      setResumeOffsetMs(0);
      // Prefetch the next paragraph in the background
      prefetchParagraph(idx + 1);

      setIsLoadingAudio(true);
      try {
        await cleanupAudio();
        const apiClient = getApiClient();
        const chunks = splitForTts(para.text, TTS_CHUNK_MAX);
        // Synthesize all chunks (use prefetched URI where available).
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
        // Play chunks sequentially. Chained via status callback.
        await playChunksSequentially(uris, idx, startOffsetMs);
      } catch (e) {
        console.error("TTS paragraph error", e);
        setIsLoadingAudio(false);
        setIsPlaying(false);
        ttsStore.setState("idle");
        Alert.alert("TTS 错误", (e as Error).message || "语音合成失败");
        return;
      }
    },
    [
      book.id,
      cleanupAudio,
      paragraphs,
      prefetchParagraph,
      provider,
      resumeOffsetMs,
      ttsStore,
      voiceId,
      voices,
    ],
  );

  /** Play a list of audio URIs sequentially. After the last one finishes,
   *  auto-advance to the next paragraph. */
  const playChunksSequentially = useCallback(
    async (uris: string[], paraIdx: number, startOffsetMs = 0) => {
      if (uris.length === 0) return;
      const apiClient = getApiClient();
      // Mark progress at chunk 0
      setIsLoadingAudio(false);
      setIsPlaying(true);
      setIsPaused(false);
      ttsStore.setState("playing");
      for (let i = 0; i < uris.length; i++) {
        const isLast = i === uris.length - 1;
        await new Promise<void>((resolve, reject) => {
          Audio.Sound.createAsync(
            { uri: uris[i] },
            {
              shouldPlay: true,
              rate: ttsStore.playbackRate,
              volume: ttsStore.volume,
            },
            (status) => {
              if (!status.isLoaded) return;
              const total = status.durationMillis || 1;
              // Approximate per-chunk progress within the paragraph
              const chunkFrac = status.positionMillis / total;
              setParagraphProgress((i + chunkFrac) / uris.length);
              if (status.didJustFinish) {
                if (isLast) {
                  // Hand off to next paragraph
                  playParagraph(paraIdx + 1).catch((e) =>
                    console.error("auto-advance failed", e),
                  );
                }
                resolve();
              }
            },
          )
            .then(({ sound }) => {
              soundRef.current = sound;
              // Seek into the audio when the caller asked to resume at
              // a specific offset (set by cloud-progress restore).
              // Only the first chunk honors the offset; subsequent
              // chunks start from 0.
              if (i === 0 && startOffsetMs > 0) {
                sound
                  .setStatusAsync({ positionMillis: startOffsetMs })
                  .catch(() => {
                    /* seek failures are non-fatal */
                  });
              }
            })
            .catch(reject);
        });
      }
      // After all chunks are done, the last callback already advanced
      // to the next paragraph. Store the chosen voice for persistence
      // and overwrite the just-restored paragraph record with the
      // current audioOffsetMs so subsequent saves don't collapse to 0.
      const v = voices.find((x) => x.id === voiceId);
      if (v) ttsStore.setSelectedVoice(v);
      try {
        const status = await soundRef.current?.getStatusAsync();
        if (status?.isLoaded && typeof status.positionMillis === "number") {
          persistProgress(paraIdx, status.positionMillis);
        }
      } catch {
        /* ignore */
      }
    },
    [persistProgress, playParagraph, ttsStore, voiceId, voices],
  );

  const handlePlayPause = useCallback(async () => {
    if (isPaused && soundRef.current) {
      try {
        await soundRef.current.playAsync();
        setIsPaused(false);
        setIsPlaying(true);
        ttsStore.setState("playing");
      } catch {
        Alert.alert("错误", "恢复播放失败");
      }
      return;
    }
    if (!paragraphs.length) {
      Alert.alert("提示", "暂无内容可朗读");
      return;
    }
    await playParagraph(currentParagraph);
  }, [isPaused, paragraphs.length, playParagraph, currentParagraph, ttsStore]);

  const handlePause = useCallback(async () => {
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        setIsPaused(true);
        ttsStore.setState("paused");
        if (status?.isLoaded && typeof status.positionMillis === "number") {
          persistProgress(currentParagraph, status.positionMillis);
        }
      } catch {
        /* ignore */
      }
    }
  }, [currentParagraph, persistProgress, ttsStore]);

  const handleStop = useCallback(async () => {
    persistProgress(currentParagraph, 0);
    await cleanupAudio();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraph(0);
    setParagraphProgress(0);
    ttsStore.setState("idle");
  }, [cleanupAudio, currentParagraph, persistProgress, ttsStore]);

  const handleJumpToParagraph = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= paragraphs.length) return;
      if (isPlaying || isPaused) {
        playParagraph(idx);
      } else {
        setCurrentParagraph(idx);
        persistProgress(idx);
      }
    },
    [paragraphs.length, isPlaying, isPaused, playParagraph, persistProgress],
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
      await cleanupAudio();
      setIsPlaying(false);
      setIsPaused(false);
      await loadChapter(ci, voiceId, provider);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterIndex, voiceId, provider, cleanupAudio],
  );

  const handleRateChange = useCallback(
    async (r: number) => {
      const newRate = Math.max(0.5, Math.min(2.0, r));
      ttsStore.setPlaybackRate(newRate);
      if (soundRef.current) {
        try {
          await soundRef.current.setRateAsync(newRate, true);
        } catch {
          /* ignore */
        }
      }
    },
    [ttsStore],
  );

  const handleVolumeChange = useCallback(
    async (v: number) => {
      ttsStore.setVolume(v);
      if (soundRef.current) {
        try {
          await soundRef.current.setVolumeAsync(v);
        } catch {
          /* ignore */
        }
      }
    },
    [ttsStore],
  );

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

  // Chapter progress
  const overallProgress = paragraphs.length
    ? (currentParagraph + paragraphProgress) / paragraphs.length
    : 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        {/* Book info */}
        <View
          style={[styles.bookInfo, { backgroundColor: theme.colors.surface }]}
        >
          <View
            style={[
              styles.bookCover,
              { backgroundColor: theme.colors.primary + "20" },
            ]}
          >
            <Text style={styles.bookCoverText}>
              {book.title.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.bookMeta}>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {book.title}
            </Text>
            <Text style={styles.bookAuthor}>{book.author}</Text>
            <Text style={styles.bookType}>
              {chapterTitle} · {currentParagraph + 1}/{paragraphs.length}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View
          style={[styles.controls, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.mainControls}>
            <TouchableOpacity onPress={handleStop} style={styles.controlButton}>
              <Ionicons name="stop" size={28} color={theme.colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSkipBack}
              style={styles.controlButton}
            >
              <Ionicons
                name="play-skip-back"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={isPlaying ? handlePause : handlePlayPause}
              style={[
                styles.playButton,
                { backgroundColor: theme.colors.primary },
              ]}
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
              onPress={handleSkipForward}
              style={styles.controlButton}
            >
              <Ionicons
                name="play-skip-forward"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSettings(!showSettings)}
              style={styles.controlButton}
            >
              <Ionicons
                name="options-outline"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Overall progress */}
          <View style={styles.progressContainer}>
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
            <View style={styles.progressLabels}>
              <Text style={styles.muted}>
                第 {currentParagraph + 1} 段 / 共 {paragraphs.length} 段
              </Text>
              <Text style={styles.muted}>
                {Math.round(overallProgress * 100)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Settings panel */}
        {showSettings && (
          <View
            style={[
              styles.settingsPanel,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={styles.settingsTitle}>本页语音设置</Text>

            <Text style={styles.settingsLabel}>服务商</Text>
            <View style={styles.chipRow}>
              {providers.length === 0 ? (
                <Text style={styles.muted}>{providerLabel(provider)}</Text>
              ) : (
                providers.map((p) => {
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
                        {p.status === "needs_config" ? " *" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <Text style={styles.settingsLabel}>语音</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {voices.length === 0 && (
                <Text style={styles.muted}>加载语音中…</Text>
              )}
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
                      {
                        backgroundColor: active
                          ? theme.colors.primary
                          : theme.colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? "#fff" : theme.colors.text },
                      ]}
                    >
                      {v.name} · {v.language || v.lang}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.settingsLabel}>
              语速 {ttsStore.playbackRate.toFixed(1)}x
            </Text>
            <View style={styles.chipRow}>
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => handleRateChange(r)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        ttsStore.playbackRate === r
                          ? theme.colors.primary
                          : theme.colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          ttsStore.playbackRate === r
                            ? "#fff"
                            : theme.colors.text,
                      },
                    ]}
                  >
                    {r}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.settingsLabel}>
              音量 {Math.round(ttsStore.volume * 100)}%
            </Text>
            <View style={styles.chipRow}>
              {[0, 0.25, 0.5, 0.75, 1.0].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => handleVolumeChange(v)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        Math.abs(ttsStore.volume - v) < 0.01
                          ? theme.colors.primary
                          : theme.colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          Math.abs(ttsStore.volume - v) < 0.01
                            ? "#fff"
                            : theme.colors.text,
                      },
                    ]}
                  >
                    {Math.round(v * 100)}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {chapters.length > 1 && (
              <>
                <Text style={styles.settingsLabel}>章节</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {chapters.map((c) => {
                    const active = chapterIndex === c.index;
                    return (
                      <TouchableOpacity
                        key={c.index}
                        onPress={() => handleChapterChange(c.index)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active
                              ? theme.colors.primary
                              : theme.colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? "#fff" : theme.colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {c.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
        )}

        {/* Paragraph list with highlight */}
        <View
          style={[
            styles.paragraphsPanel,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={styles.previewTitle}>朗读内容</Text>
          <ScrollView style={styles.paragraphsScroll}>
            {paragraphs.map((p, idx) => {
              const isCurrent = idx === currentParagraph;
              const isPast = idx < currentParagraph;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handleJumpToParagraph(idx)}
                  style={[
                    styles.paragraphItem,
                    isCurrent && {
                      backgroundColor: theme.colors.primary + "25",
                    },
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
                    {p.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      padding: spacing.md,
      gap: spacing.md,
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
    bookInfo: {
      flexDirection: "row",
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: "center",
    },
    bookCover: {
      width: 60,
      height: 80,
      borderRadius: borderRadius.sm,
      justifyContent: "center",
      alignItems: "center",
    },
    bookCoverText: {
      fontSize: fontSizes.xxxl,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
    bookMeta: {
      flex: 1,
      marginLeft: spacing.md,
    },
    bookTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "600",
      color: theme.colors.text,
    },
    bookAuthor: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    bookType: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    controls: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.md,
    },
    mainControls: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.md,
    },
    controlButton: {
      padding: spacing.sm,
    },
    playButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
    },
    progressContainer: {
      gap: spacing.xs,
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
    progressLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    settingsPanel: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
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
    paragraphsPanel: {
      flex: 1,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    previewTitle: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    paragraphsScroll: {
      flex: 1,
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
  });
}
