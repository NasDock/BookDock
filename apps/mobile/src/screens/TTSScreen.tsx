import type { TTSVoice } from "@bookdock/api-client";
import { getApiClient } from "@bookdock/api-client";
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
import { useTTSStore, useThemeStore } from "../stores";
import { borderRadius, fontSizes, getTheme, spacing } from "../utils/theme";

type TTSScreenRouteProp = RouteProp<RootStackParamList, "TTSScreen">;

export function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute<TTSScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === "dark");
  const ttsStore = useTTSStore();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const audioUriRef = useRef<string | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Load available voices from server
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getVoices();
        if (response.success && response.data) {
          setAvailableVoices(response.data);
          if (response.data.length > 0 && !ttsStore.selectedVoice) {
            ttsStore.setSelectedVoice(response.data[0]);
          }
        }
      } catch {
        setError("暂无可用语音");
      }
    };

    loadVoices();

    // Cleanup audio on unmount
    return () => {
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      soundRef.current = null;
    }
    if (audioUriRef.current) {
      audioUriRef.current = null;
    }
  };

  // Fetch book content for TTS via server-parsed chapters
  const fetchBookContent = useCallback(async () => {
    if (!book) return "";
    try {
      setIsLoading(true);
      const apiClient = getApiClient();
      const chaptersRes = await apiClient.getChapters(book.id);
      if (
        chaptersRes.success &&
        chaptersRes.data &&
        chaptersRes.data.length > 0
      ) {
        const contents = await Promise.all(
          chaptersRes.data.map(async (ch) => {
            const contentRes = await apiClient.getChapterContent(
              book.id,
              ch.index,
            );
            return contentRes.success && contentRes.data
              ? contentRes.data.content
              : "";
          }),
        );
        const text = contents.join("\n\n");
        setIsLoading(false);
        return text.slice(0, 5000);
      }
      setIsLoading(false);
      return `《${book.title}》作者：${book.author}。完整内容将从服务器加载用于语音朗读。`;
    } catch {
      setIsLoading(false);
      return `《${book.title}》作者：${book.author}。完整内容将从服务器加载用于语音朗读。`;
    }
  }, [book]);

  const handlePlay = useCallback(async () => {
    if (isPaused && soundRef.current) {
      // Resume playback
      try {
        await soundRef.current.playAsync();
        setIsPaused(false);
        setIsSpeaking(true);
        ttsStore.setState("playing");
      } catch {
        Alert.alert("错误", "恢复播放失败");
      }
      return;
    }

    setIsLoading(true);
    const text = currentText || (await fetchBookContent());
    setCurrentText(text);

    if (!text.trim()) {
      setIsLoading(false);
      Alert.alert("错误", "没有可用于朗读的文本内容");
      return;
    }

    try {
      // Cleanup previous audio
      await cleanupAudio();

      const apiClient = getApiClient();
      const voiceId = ttsStore.selectedVoice?.id;
      // Use the new paragraph-level endpoint which returns a URL to a
      // cached mp3 file. The full migration to per-paragraph playback
      // happens after this baseline; for now we just synthesize the
      // joined text as one paragraph and stream it.
      const result = await apiClient.synthesizeParagraph({
        bookId: book.id,
        paragraphId: "full",
        text,
        provider: "edge",
        voice: voiceId,
      });
      const url = result.success && result.data ? result.data.url : null;
      let audioUri: string | undefined;
      if (url) {
        // Resolve relative /audio/<hash>.mp3 against API base URL.
        const base = apiClient.baseURL || "";
        audioUri = url.startsWith("http")
          ? url
          : `${base.replace(/\/$/, "")}${url}`;
      } else {
        // Fallback to legacy blob path if the new endpoint isn't available.
        const blob = await apiClient.convertToSpeech(
          text,
          voiceId || "default",
        );
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(",")[1]);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const base64Data = await base64Promise;
        audioUri = `data:audio/mpeg;base64,${base64Data}`;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay: true,
          rate: ttsStore.playbackRate,
          volume: ttsStore.volume,
        },
        (status) => {
          if (status.isLoaded) {
            setPlaybackProgress(
              status.positionMillis / (status.durationMillis || 1),
            );
            if (status.didJustFinish) {
              setIsSpeaking(false);
              setIsPaused(false);
              ttsStore.setState("idle");
            }
          }
        },
      );

      soundRef.current = sound;
      setIsLoading(false);
      setIsSpeaking(true);
      setIsPaused(false);
      ttsStore.setState("playing");
    } catch (err) {
      console.error("TTS error:", err);
      setIsLoading(false);
      setIsSpeaking(false);
      ttsStore.setState("idle");
      Alert.alert("TTS 错误", "语音合成失败，请检查网络和后端服务");
    }
  }, [isPaused, currentText, ttsStore, fetchBookContent]);

  const handlePause = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
        setIsSpeaking(false);
        setIsPaused(true);
        ttsStore.setState("paused");
      } catch {
        Alert.alert("错误", "暂停播放失败");
      }
    }
  }, [ttsStore]);

  const handleStop = useCallback(async () => {
    await cleanupAudio();
    setIsSpeaking(false);
    setIsPaused(false);
    setPlaybackProgress(0);
    ttsStore.setState("idle");
  }, [ttsStore]);

  const handleRateChange = useCallback(
    async (rate: number) => {
      const newRate = Math.max(0.5, Math.min(2.0, rate));
      ttsStore.setPlaybackRate(newRate);
      if (soundRef.current) {
        try {
          await soundRef.current.setRateAsync(newRate, true);
        } catch {
          // Ignore rate change errors
        }
      }
    },
    [ttsStore],
  );

  const handleVolumeChange = useCallback(
    async (volume: number) => {
      ttsStore.setVolume(volume);
      if (soundRef.current) {
        try {
          await soundRef.current.setVolumeAsync(volume);
        } catch {
          // Ignore volume change errors
        }
      }
    },
    [ttsStore],
  );

  const handleVoiceSelect = useCallback(
    (voice: TTSVoice) => {
      ttsStore.setSelectedVoice(voice);
      setShowVoices(false);
    },
    [ttsStore],
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        {/* Book Info */}
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
              {(book.fileType || book.format || "unknown").toUpperCase()}
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
              onPress={isSpeaking ? handlePause : handlePlay}
              style={[
                styles.playButton,
                { backgroundColor: theme.colors.primary },
              ]}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name={isSpeaking ? "pause" : "play"}
                  size={32}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowVoices(!showVoices)}
              style={styles.controlButton}
            >
              <Ionicons
                name="options-outline"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
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
                    width: `${playbackProgress * 100}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Rate Control */}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>
              Speed: {ttsStore.playbackRate.toFixed(1)}x
            </Text>
            <View style={styles.rateButtons}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.rateButton,
                    ttsStore.playbackRate === rate && {
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() => handleRateChange(rate)}
                >
                  <Text
                    style={[
                      styles.rateButtonText,
                      {
                        color:
                          ttsStore.playbackRate === rate
                            ? "#fff"
                            : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {rate}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Volume Control */}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>
              Volume: {Math.round(ttsStore.volume * 100)}%
            </Text>
            <View style={styles.rateButtons}>
              {[0, 25, 50, 75, 100].map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[
                    styles.rateButton,
                    Math.round(ttsStore.volume * 100) === pct && {
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() => handleVolumeChange(pct / 100)}
                >
                  <Text
                    style={[
                      styles.rateButtonText,
                      {
                        color:
                          Math.round(ttsStore.volume * 100) === pct
                            ? "#fff"
                            : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {pct}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Voice Selector */}
        {showVoices && (
          <View
            style={[
              styles.voicesPanel,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={styles.voicesTitle}>Select Voice</Text>
            <ScrollView style={styles.voicesList}>
              {availableVoices.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[
                    styles.voiceItem,
                    ttsStore.selectedVoice?.id === voice.id && {
                      backgroundColor: theme.colors.primary + "20",
                    },
                  ]}
                  onPress={() => handleVoiceSelect(voice)}
                >
                  <Text style={styles.voiceName}>{voice.name}</Text>
                  <Text style={styles.voiceLang}>{voice.lang}</Text>
                  {ttsStore.selectedVoice?.id === voice.id && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={theme.colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
              {availableVoices.length === 0 && (
                <Text style={styles.emptyVoices}>No voices available</Text>
              )}
            </ScrollView>
          </View>
        )}

        {/* Preview Text */}
        <View
          style={[
            styles.previewPanel,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={styles.previewTitle}>Preview</Text>
          <ScrollView style={styles.previewScroll}>
            <Text
              style={[styles.previewText, { color: theme.colors.text }]}
              numberOfLines={10}
            >
              {currentText || "点击播放加载并收听书籍内容"}
            </Text>
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
      textTransform: "uppercase",
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
      gap: spacing.lg,
    },
    controlButton: {
      padding: spacing.md,
    },
    playButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    progressContainer: {
      marginTop: spacing.sm,
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 2,
    },
    sliderContainer: {
      gap: spacing.sm,
    },
    sliderLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    rateButtons: {
      flexDirection: "row",
      gap: spacing.xs,
      flexWrap: "wrap",
    },
    rateButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.border + "40",
    },
    rateButtonText: {
      fontSize: fontSizes.sm,
      fontWeight: "500",
    },
    voicesPanel: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      maxHeight: 250,
    },
    voicesTitle: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    voicesList: {
      maxHeight: 200,
    },
    voiceItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      borderRadius: borderRadius.md,
    },
    voiceName: {
      flex: 1,
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    voiceLang: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginRight: spacing.sm,
    },
    emptyVoices: {
      textAlign: "center",
      color: theme.colors.textSecondary,
      padding: spacing.md,
    },
    previewPanel: {
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
    previewScroll: {
      flex: 1,
    },
    previewText: {
      fontSize: fontSizes.md,
      lineHeight: fontSizes.md * 1.6,
    },
  });
}
