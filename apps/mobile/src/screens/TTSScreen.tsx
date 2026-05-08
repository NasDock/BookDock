import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';
import type { TTSVoice } from '@bookdock/api-client';

type TTSScreenRouteProp = RouteProp<RootStackParamList, 'TTSScreen'>;

export function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute<TTSScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const ttsStore = useTTSStore();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Load available voices on mount
  useEffect(() => {
    const loadVoices = async () => {
      try {
        // Try to get voices from expo-speech
        const voices = await Speech.getAvailableVoicesAsync();
        const mapped: TTSVoice[] = voices.map((v, i) => ({
          id: v.identifier || `voice-${i}`,
          name: v.name,
          lang: v.language,
          local: true,
        }));
        setAvailableVoices(mapped);
        if (mapped.length > 0 && !ttsStore.selectedVoice) {
          ttsStore.setSelectedVoice(mapped[0]);
        }
      } catch {
        // Fallback: try server voices
        try {
          const apiClient = getApiClient();
          const response = await apiClient.getVoices();
          if (response.success && response.data) {
            setAvailableVoices(response.data);
          }
        } catch {
          setError('No TTS voices available');
        }
      }
    };

    loadVoices();

    // Cleanup speech on unmount
    return () => {
      Speech.stop();
    };
  }, []);

  // Fetch book content for TTS
  const fetchBookContent = useCallback(async () => {
    if (!book) return '';
    try {
      setIsLoading(true);
      const apiClient = getApiClient();
      const blob = await apiClient.getBookFile(book.id);
      const text = new TextDecoder('utf-8').decode(blob);
      // For EPUB/MOBI this would need proper parsing, but for TXT/PDF text extraction:
      setIsLoading(false);
      return text.slice(0, 5000); // Limit to first 5000 chars for demo
    } catch {
      setIsLoading(false);
      return `This is the book "${book.title}" by ${book.author}. The full text content would be loaded from the server for text-to-speech processing.`;
    }
  }, [book]);

  const handlePlay = useCallback(async () => {
    if (isPaused) {
      // Resume not directly supported by expo-speech, re-speak from current position
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    setIsLoading(true);
    const text = currentText || (await fetchBookContent());
    setCurrentText(text);
    setIsLoading(false);

    if (!text.trim()) {
      Alert.alert('Error', 'No text content available for speech');
      return;
    }

    setIsSpeaking(true);
    ttsStore.setState('playing');

    try {
      await Speech.speak(text, {
        language: ttsStore.selectedVoice?.lang || 'en-US',
        rate: ttsStore.playbackRate,
        pitch: 1.0,
        volume: ttsStore.volume,
        onDone: () => {
          setIsSpeaking(false);
          ttsStore.setState('idle');
        },
        onError: (err) => {
          console.error('TTS error:', err);
          setIsSpeaking(false);
          ttsStore.setState('idle');
          Alert.alert('TTS Error', 'Speech synthesis failed');
        },
      });
    } catch {
      setIsSpeaking(false);
      ttsStore.setState('idle');
      Alert.alert('Error', 'Failed to start speech synthesis');
    }
  }, [isPaused, currentText, ttsStore, fetchBookContent]);

  const handlePause = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
    setIsPaused(true);
    ttsStore.setState('paused');
  }, [ttsStore]);

  const handleStop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
    setIsPaused(false);
    ttsStore.setState('idle');
  }, [ttsStore]);

  const handleRateChange = useCallback((rate: number) => {
    const newRate = Math.max(0.5, Math.min(2.0, rate));
    ttsStore.setPlaybackRate(newRate);
    if (isSpeaking) {
      Speech.stop();
      setTimeout(() => handlePlay(), 100);
    }
  }, [ttsStore, isSpeaking, handlePlay]);

  const handleVolumeChange = useCallback((volume: number) => {
    ttsStore.setVolume(volume);
  }, [ttsStore]);

  const handleVoiceSelect = useCallback((voice: TTSVoice) => {
    ttsStore.setSelectedVoice(voice);
    setShowVoices(false);
  }, [ttsStore]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Book Info */}
        <View style={[styles.bookInfo, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.bookCover, { backgroundColor: theme.colors.primary + '20' }]}>
            <Text style={styles.bookCoverText}>{book.title.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.bookMeta}>
            <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
            <Text style={styles.bookAuthor}>{book.author}</Text>
            <Text style={styles.bookType}>{book.fileType.toUpperCase()}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={[styles.controls, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.mainControls}>
            <TouchableOpacity onPress={handleStop} style={styles.controlButton}>
              <Ionicons name="stop" size={28} color={theme.colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={isSpeaking ? handlePause : handlePlay}
              style={[styles.playButton, { backgroundColor: theme.colors.primary }]}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name={isSpeaking ? 'pause' : 'play'}
                  size={32}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowVoices(!showVoices)}
              style={styles.controlButton}
            >
              <Ionicons name="options-outline" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Rate Control */}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Speed: {ttsStore.playbackRate.toFixed(1)}x</Text>
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
                            ? '#fff'
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
            <Text style={styles.sliderLabel}>Volume: {Math.round(ttsStore.volume * 100)}%</Text>
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
                            ? '#fff'
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
          <View style={[styles.voicesPanel, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.voicesTitle}>Select Voice</Text>
            <ScrollView style={styles.voicesList}>
              {availableVoices.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[
                    styles.voiceItem,
                    ttsStore.selectedVoice?.id === voice.id && {
                      backgroundColor: theme.colors.primary + '20',
                    },
                  ]}
                  onPress={() => handleVoiceSelect(voice)}
                >
                  <Text style={styles.voiceName}>{voice.name}</Text>
                  <Text style={styles.voiceLang}>{voice.lang}</Text>
                  {ttsStore.selectedVoice?.id === voice.id && (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
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
        <View style={[styles.previewPanel, { backgroundColor: theme.colors.surface }]}>
          <Text style={styles.previewTitle}>Preview</Text>
          <ScrollView style={styles.previewScroll}>
            <Text style={[styles.previewText, { color: theme.colors.text }]} numberOfLines={10}>
              {currentText || 'Tap play to load and listen to the book content.'}
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
      flexDirection: 'row',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
    },
    bookCover: {
      width: 60,
      height: 80,
      borderRadius: borderRadius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bookCoverText: {
      fontSize: fontSizes.xxxl,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    bookMeta: {
      flex: 1,
      marginLeft: spacing.md,
    },
    bookTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
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
      textTransform: 'uppercase',
    },
    controls: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.md,
    },
    mainControls: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.lg,
    },
    controlButton: {
      padding: spacing.md,
    },
    playButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sliderContainer: {
      gap: spacing.sm,
    },
    sliderLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    rateButtons: {
      flexDirection: 'row',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    rateButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.border + '40',
    },
    rateButtonText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    voicesPanel: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      maxHeight: 250,
    },
    voicesTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    voicesList: {
      maxHeight: 200,
    },
    voiceItem: {
      flexDirection: 'row',
      alignItems: 'center',
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
      textAlign: 'center',
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
      fontWeight: '600',
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
