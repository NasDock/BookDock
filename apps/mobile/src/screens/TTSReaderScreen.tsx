/**
 * TTSReaderScreen - Dedicated TTS audiobook player screen
 * Provides immersive listening experience with full playback controls
 * Uses backend TTS API via expo-av for audio playback
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';
import type { TTSVoice } from '@bookdock/api-client';

type TTSReaderRouteProp = RouteProp<RootStackParamList, 'TTSScreen'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TTSReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<TTSReaderRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const ttsStore = useTTSStore();

  const [chapters, setChapters] = useState<Array<{ id: string; title: string; duration: number }>>([]);
  const [selectedChapter, setSelectedChapter] = useState('1');
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [volume, setVolume] = useState(ttsStore.volume);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const currentChapter = chapters.find((c) => c.id === selectedChapter) || chapters[0];

  // Load chapters and voices on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const apiClient = getApiClient();

        // Load chapters
        const chaptersRes = await apiClient.getChapters(book.id);
        if (chaptersRes.success && chaptersRes.data) {
          const loadedChapters = chaptersRes.data.map((ch, index) => ({
            id: String(ch.index || index),
            title: ch.title || `Chapter ${index + 1}`,
            duration: 1200, // Estimated duration
          }));
          setChapters(loadedChapters);
          if (loadedChapters.length > 0) {
            setSelectedChapter(loadedChapters[0].id);
          }
        }

        // Load voices
        const voicesRes = await apiClient.getVoices();
        if (voicesRes.success && voicesRes.data) {
          setAvailableVoices(voicesRes.data);
          if (voicesRes.data.length > 0 && !ttsStore.selectedVoice) {
            ttsStore.setSelectedVoice(voicesRes.data[0]);
          }
        }
      } catch {
        Alert.alert('错误', '加载书籍数据失败');
      }
    };

    loadData();

    return () => {
      cleanupAudio();
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [book.id]);

  // Sleep timer effect
  useEffect(() => {
    if (sleepTimer !== null && sleepTimer > 0) {
      sleepTimerRef.current = setInterval(() => {
        setSleepTimer((prev) => {
          if (prev === null || prev <= 1) {
            handlePause();
            Alert.alert('睡眠定时', '已按定时设置暂停播放');
            return null;
          }
          return prev - 1;
        });
      }, 60000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimer]);

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
  };

  const fetchChapterContent = async (chapterId: string): Promise<string> => {
    try {
      const apiClient = getApiClient();
      const chapterIndex = parseInt(chapterId, 10);
      const contentRes = await apiClient.getChapterContent(book.id, chapterIndex);
      return contentRes.success && contentRes.data ? contentRes.data.content : '';
    } catch {
      return '';
    }
  };

  const handlePlay = async () => {
    if (isLoading) return;

    // If paused and has sound, resume
    if (soundRef.current && !isLoading) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && !status.isPlaying) {
          await soundRef.current.playAsync();
          ttsStore.setState('playing');
          return;
        }
      } catch {
        // Fall through to play new
      }
    }

    setIsLoading(true);

    try {
      await cleanupAudio();

      const text = await fetchChapterContent(selectedChapter);
      if (!text.trim()) {
        setIsLoading(false);
        Alert.alert('错误', '本章暂无文本内容');
        return;
      }

      const apiClient = getApiClient();
      const voiceId = ttsStore.selectedVoice?.id;
      const blob = await apiClient.convertToSpeech(text, voiceId || 'default');

      // Convert blob to base64 for expo-av
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${base64Data}` },
        {
          shouldPlay: true,
          rate: ttsStore.playbackRate,
          volume: ttsStore.volume,
          positionMillis: currentPosition,
        },
        (status) => {
          if (status.isLoaded) {
            setCurrentPosition(status.positionMillis / 1000);
            setTotalDuration((status.durationMillis || 1) / 1000);
            setPlaybackProgress(status.positionMillis / (status.durationMillis || 1));
            if (status.didJustFinish) {
              ttsStore.setState('idle');
              setPlaybackProgress(0);
              setCurrentPosition(0);
            }
          }
        }
      );

      soundRef.current = sound;
      ttsStore.setCurrentBook(book.id, 0, 0);
      ttsStore.setState('playing');
    } catch (err) {
      console.error('TTS error:', err);
      Alert.alert('TTS 错误', '语音合成失败，请检查网络和后端服务');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
        ttsStore.setState('paused');
      } catch {
        // Ignore
      }
    }
  };

  const handlePlayPause = useCallback(() => {
    if (ttsStore.state === 'playing') {
      handlePause();
    } else {
      handlePlay();
    }
  }, [ttsStore.state]);

  const handleStop = async () => {
    await cleanupAudio();
    ttsStore.setState('idle');
    setPlaybackProgress(0);
    setCurrentPosition(0);
  };

  const handleSeek = useCallback(async (value: number) => {
    setCurrentPosition(value);
    if (soundRef.current) {
      try {
        await soundRef.current.setPositionAsync(value * 1000);
      } catch {
        // Ignore seek errors
      }
    }
  }, []);

  const handleSkipForward = useCallback(async () => {
    const newPosition = Math.min(currentPosition + 30, totalDuration);
    setCurrentPosition(newPosition);
    if (soundRef.current) {
      try {
        await soundRef.current.setPositionAsync(newPosition * 1000);
      } catch {
        // Ignore
      }
    }
  }, [currentPosition, totalDuration]);

  const handleSkipBackward = useCallback(async () => {
    const newPosition = Math.max(currentPosition - 30, 0);
    setCurrentPosition(newPosition);
    if (soundRef.current) {
      try {
        await soundRef.current.setPositionAsync(newPosition * 1000);
      } catch {
        // Ignore
      }
    }
  }, [currentPosition]);

  const handlePreviousChapter = useCallback(() => {
    const currentIndex = chapters.findIndex((c) => c.id === selectedChapter);
    if (currentIndex > 0) {
      setSelectedChapter(chapters[currentIndex - 1].id);
      setCurrentPosition(0);
      setPlaybackProgress(0);
      if (ttsStore.state === 'playing') {
        handleStop().then(() => handlePlay());
      }
    }
  }, [selectedChapter, chapters, ttsStore.state]);

  const handleNextChapter = useCallback(() => {
    const currentIndex = chapters.findIndex((c) => c.id === selectedChapter);
    if (currentIndex < chapters.length - 1) {
      setSelectedChapter(chapters[currentIndex + 1].id);
      setCurrentPosition(0);
      setPlaybackProgress(0);
      if (ttsStore.state === 'playing') {
        handleStop().then(() => handlePlay());
      }
    }
  }, [selectedChapter, chapters, ttsStore.state]);

  const handleVoiceSelect = useCallback((voice: TTSVoice) => {
    ttsStore.setSelectedVoice(voice);
    setShowVoicePicker(false);
  }, [ttsStore]);

  const handleSpeedSelect = useCallback(async (speed: number) => {
    ttsStore.setPlaybackRate(speed);
    setShowSpeedPicker(false);
    if (soundRef.current) {
      try {
        await soundRef.current.setRateAsync(speed, true);
      } catch {
        // Ignore
      }
    }
  }, [ttsStore]);

  const handleVolumeChange = useCallback(async (value: number) => {
    setVolume(value);
    ttsStore.setVolume(value);
    if (soundRef.current) {
      try {
        await soundRef.current.setVolumeAsync(value);
      } catch {
        // Ignore
      }
    }
  }, [ttsStore]);

  const handleSleepTimerSet = useCallback((minutes: number | null) => {
    setSleepTimer(minutes);
    setShowSleepTimer(false);
    if (minutes === null) {
      Alert.alert('睡眠定时', '已取消睡眠定时');
    } else {
      Alert.alert('睡眠定时', `${minutes} 分钟后将暂停播放`);
    }
  }, []);

  const handleChapterSelect = useCallback((chapterId: string) => {
    setSelectedChapter(chapterId);
    setCurrentPosition(0);
    setPlaybackProgress(0);
    if (ttsStore.state === 'playing') {
      handleStop().then(() => handlePlay());
    }
  }, [ttsStore.state]);

  const isCurrentChapter = ttsStore.currentBookId === book.id && ttsStore.state === 'playing';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        style={actualTheme === 'dark' ? 'light' : 'dark'}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Now Playing</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{book.title}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => setShowSleepTimer(true)}>
          <Ionicons
            name={sleepTimer ? 'moon' : 'moon-outline'}
            size={24}
            color={sleepTimer ? theme.colors.primary : theme.colors.text}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Book Cover */}
        <View style={styles.coverSection}>
          <View style={[styles.bookCover, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.coverInitial}>{book.title.charAt(0)}</Text>
          </View>
          {sleepTimer && (
            <View style={[styles.sleepBadge, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="moon" size={12} color="#fff" />
              <Text style={styles.sleepBadgeText}>{sleepTimer}m</Text>
            </View>
          )}
        </View>

        {/* Chapter Info */}
        <Text style={styles.chapterTitle} numberOfLines={2}>
          {currentChapter?.title || '加载中...'}
        </Text>
        <Text style={styles.bookAuthor}>{book.author}</Text>

        {/* Progress Slider */}
        <View style={styles.progressSection}>
          <Slider
            style={styles.progressSlider}
            minimumValue={0}
            maximumValue={totalDuration || 1}
            value={currentPosition}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.border}
            thumbTintColor={theme.colors.primary}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>
            <Text style={styles.timeText}>-{formatTime((totalDuration || 0) - currentPosition)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlButton} onPress={handleSkipBackward}>
            <Ionicons name="play-back" size={28} color={theme.colors.text} />
            <Text style={styles.skipLabel}>30</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handlePreviousChapter}
            disabled={chapters.length === 0 || selectedChapter === chapters[0]?.id}
          >
            <Ionicons
              name="play-skip-back"
              size={24}
              color={chapters.length === 0 || selectedChapter === chapters[0]?.id ? theme.colors.border : theme.colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: theme.colors.primary }]}
            onPress={handlePlayPause}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={isCurrentChapter ? 'pause' : 'play'}
                size={36}
                color="#fff"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleNextChapter}
            disabled={chapters.length === 0 || selectedChapter === chapters[chapters.length - 1]?.id}
          >
            <Ionicons
              name="play-skip-forward"
              size={24}
              color={chapters.length === 0 || selectedChapter === chapters[chapters.length - 1]?.id ? theme.colors.border : theme.colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={handleSkipForward}>
            <Ionicons name="play-forward" size={28} color={theme.colors.text} />
            <Text style={styles.skipLabel}>30</Text>
          </TouchableOpacity>
        </View>

        {/* Additional Controls */}
        <View style={styles.additionalControls}>
          {/* Voice Selection */}
          <TouchableOpacity
            style={[styles.additionalButton, { backgroundColor: theme.colors.surface }]}
            onPress={() => setShowVoicePicker(true)}
          >
            <Ionicons name="person" size={20} color={theme.colors.text} />
            <Text style={styles.additionalButtonText}>
              {ttsStore.selectedVoice?.name || '语音'}
            </Text>
          </TouchableOpacity>

          {/* Speed Control */}
          <TouchableOpacity
            style={[styles.additionalButton, { backgroundColor: theme.colors.surface }]}
            onPress={() => setShowSpeedPicker(true)}
          >
            <Ionicons name="speedometer" size={20} color={theme.colors.text} />
            <Text style={styles.additionalButtonText}>{ttsStore.playbackRate}x</Text>
          </TouchableOpacity>

          {/* Volume */}
          <View style={[styles.volumeContainer, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="volume-low" size={18} color={theme.colors.text} />
            <Slider
              style={styles.volumeSlider}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              onValueChange={handleVolumeChange}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.border}
              thumbTintColor={theme.colors.primary}
            />
            <Ionicons name="volume-high" size={18} color={theme.colors.text} />
          </View>
        </View>

        {/* Chapters List */}
        {chapters.length > 0 && (
          <View style={styles.chaptersSection}>
            <Text style={styles.sectionTitle}>Chapters</Text>
            {chapters.map((chapter, index) => {
              const isActive = chapter.id === selectedChapter;
              const isPlayed = chapters.findIndex((c) => c.id === selectedChapter) > index;
              return (
                <TouchableOpacity
                  key={chapter.id}
                  style={[
                    styles.chapterItem,
                    isActive && { backgroundColor: theme.colors.primary + '20' },
                  ]}
                  onPress={() => handleChapterSelect(chapter.id)}
                >
                  <View style={styles.chapterLeft}>
                    {isPlayed ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                    ) : (
                      <View
                        style={[
                          styles.chapterNumber,
                          { backgroundColor: isActive ? theme.colors.primary : theme.colors.border },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chapterNumberText,
                            { color: isActive ? '#fff' : theme.colors.textSecondary },
                          ]}
                        >
                          {index + 1}
                        </Text>
                      </View>
                    )}
                    <View style={styles.chapterInfo}>
                      <Text
                        style={[
                          styles.chapterItemTitle,
                          { color: isActive ? theme.colors.primary : theme.colors.text },
                        ]}
                      >
                        {chapter.title}
                      </Text>
                      <Text style={styles.chapterDuration}>{formatTime(chapter.duration)}</Text>
                    </View>
                  </View>
                  {isActive && isCurrentChapter && (
                    <View style={styles.playingIndicator}>
                      <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                      <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                      <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Voice Picker Modal */}
      <Modal
        visible={showVoicePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVoicePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowVoicePicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.modalTitle}>Select Voice</Text>
            <ScrollView>
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
                  <View style={styles.voiceInfo}>
                    <Text style={styles.voiceName}>{voice.name}</Text>
                    <Text style={styles.voiceLang}>{voice.lang}</Text>
                  </View>
                  <View style={styles.voiceBadges}>
                    {ttsStore.selectedVoice?.id === voice.id && (
                      <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              {availableVoices.length === 0 && (
                <Text style={styles.emptyVoices}>No voices available</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Speed Picker Modal */}
      <Modal
        visible={showSpeedPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSpeedPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSpeedPicker(false)}>
          <View style={[styles.speedModalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.modalTitle}>Playback Speed</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedOption,
                    ttsStore.playbackRate === speed && { backgroundColor: theme.colors.primary },
                  ]}
                  onPress={() => handleSpeedSelect(speed)}
                >
                  <Text
                    style={[
                      styles.speedOptionText,
                      ttsStore.playbackRate === speed && { color: '#fff' },
                    ]}
                  >
                    {speed}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Sleep Timer Modal */}
      <Modal
        visible={showSleepTimer}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSleepTimer(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSleepTimer(false)}>
          <View style={[styles.speedModalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.modalTitle}>Sleep Timer</Text>
            <View style={styles.sleepOptions}>
              {[5, 10, 15, 30, 45, 60, null].map((minutes) => (
                <TouchableOpacity
                  key={minutes ?? 'off'}
                  style={[
                    styles.sleepOption,
                    sleepTimer === minutes && { backgroundColor: theme.colors.primary },
                  ]}
                  onPress={() => handleSleepTimerSet(minutes)}
                >
                  <Text
                    style={[
                      styles.sleepOptionText,
                      sleepTimer === minutes && { color: '#fff' },
                    ]}
                  >
                    {minutes === null ? '关闭' : `${minutes} 分钟`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
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
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    coverSection: {
      alignItems: 'center',
      marginBottom: spacing.xl,
      position: 'relative',
    },
    bookCover: {
      width: 200,
      height: 280,
      borderRadius: borderRadius.xl,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
    },
    coverInitial: {
      fontSize: 64,
      fontWeight: 'bold',
      color: theme.colors.textSecondary,
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
    chapterTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    bookAuthor: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    progressSection: {
      marginBottom: spacing.lg,
    },
    progressSlider: {
      width: '100%',
      height: 40,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    timeText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.lg,
      marginBottom: spacing.xl,
    },
    controlButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 56,
      height: 56,
    },
    skipLabel: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
      marginTop: -spacing.xs,
    },
    playButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    additionalControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    additionalButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
    },
    additionalButtonText: {
      fontSize: fontSizes.sm,
      color: theme.colors.text,
    },
    volumeContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
    },
    volumeSlider: {
      flex: 1,
      height: 40,
    },
    chaptersSection: {
      marginTop: spacing.lg,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.md,
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    chapterLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.md,
    },
    chapterNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chapterNumberText: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    chapterInfo: {
      flex: 1,
    },
    chapterItemTitle: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    chapterDuration: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    playingIndicator: {
      flexDirection: 'row',
      gap: 3,
    },
    playingDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    speedModalContent: {
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      width: '80%',
      alignSelf: 'center',
      marginTop: '50%',
    },
    modalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    voiceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    voiceInfo: {
      flex: 1,
    },
    voiceName: {
      fontSize: fontSizes.md,
      fontWeight: '500',
      color: theme.colors.text,
    },
    voiceLang: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    voiceBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    voiceBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    voiceBadgeText: {
      fontSize: fontSizes.xs,
      fontWeight: '500',
    },
    emptyVoices: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      padding: spacing.md,
    },
    speedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      justifyContent: 'center',
    },
    speedOption: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.background,
      minWidth: 70,
      alignItems: 'center',
    },
    speedOptionText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
      color: theme.colors.text,
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
