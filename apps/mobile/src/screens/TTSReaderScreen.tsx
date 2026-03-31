/**
 * TTSReaderScreen - Dedicated TTS audiobook player screen
 * Provides immersive listening experience with full playback controls
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';
import type { TTSVoice } from '@bookdock/api-client';

type TTSReaderRouteProp = RouteProp<RootStackParamList, 'TTSScreen'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Mock chapters for demo (in production, these come from TTS API)
const MOCK_CHAPTERS = [
  { id: '1', title: 'Chapter 1: The Beginning', duration: 1200 },
  { id: '2', title: 'Chapter 2: The Journey', duration: 1500 },
  { id: '3', title: 'Chapter 3: The Discovery', duration: 1100 },
  { id: '4', title: 'Chapter 4: The Challenge', duration: 1400 },
  { id: '5', title: 'Chapter 5: The Resolution', duration: 1300 },
];

// Mock TTS voices
const MOCK_VOICES: TTSVoice[] = [
  { id: 'voice-1', name: 'Emma', lang: 'en-US', local: true },
  { id: 'voice-2', name: 'Alex', lang: 'en-US', local: true },
  { id: 'voice-3', name: 'Sophie', lang: 'en-GB', local: true },
  { id: 'voice-4', name: 'James', lang: 'en-AU', local: true },
  { id: 'voice-5', name: 'Marie', lang: 'fr-FR', local: false },
];

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

  const [selectedChapter, setSelectedChapter] = useState('1');
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [volume, setVolume] = useState(ttsStore.volume);

  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const currentChapter = MOCK_CHAPTERS.find((c) => c.id === selectedChapter) || MOCK_CHAPTERS[0];
  const currentTime = ttsStore.currentBookId === book.id ? ttsStore.currentPosition : 0;
  const totalDuration = ttsStore.totalLength || currentChapter.duration;

  // Sleep timer effect
  useEffect(() => {
    if (sleepTimer !== null && sleepTimer > 0) {
      sleepTimerRef.current = setInterval(() => {
        setSleepTimer((prev) => {
          if (prev === null || prev <= 1) {
            ttsStore.setState('paused');
            Alert.alert('Sleep Timer', 'Playback paused due to sleep timer.');
            return null;
          }
          return prev - 1;
        });
      }, 60000); // Every minute
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimer]);

  const handlePlayPause = useCallback(() => {
    if (ttsStore.state === 'playing' && ttsStore.currentBookId === book.id) {
      ttsStore.setState('paused');
    } else {
      ttsStore.setCurrentBook(book.id, currentTime, totalDuration);
      ttsStore.setState('playing');
    }
  }, [ttsStore, book.id, currentTime, totalDuration]);

  const handleSeek = useCallback((value: number) => {
    ttsStore.setPosition(Math.floor(value));
  }, [ttsStore]);

  const handleSkipForward = useCallback(() => {
    const newPosition = Math.min(currentTime + 30, totalDuration);
    ttsStore.setPosition(newPosition);
  }, [currentTime, totalDuration, ttsStore]);

  const handleSkipBackward = useCallback(() => {
    const newPosition = Math.max(currentTime - 30, 0);
    ttsStore.setPosition(newPosition);
  }, [currentTime, ttsStore]);

  const handlePreviousChapter = useCallback(() => {
    const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.id === selectedChapter);
    if (currentIndex > 0) {
      setSelectedChapter(MOCK_CHAPTERS[currentIndex - 1].id);
      ttsStore.setPosition(0);
    }
  }, [selectedChapter, ttsStore]);

  const handleNextChapter = useCallback(() => {
    const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.id === selectedChapter);
    if (currentIndex < MOCK_CHAPTERS.length - 1) {
      setSelectedChapter(MOCK_CHAPTERS[currentIndex + 1].id);
      ttsStore.setPosition(0);
    }
  }, [selectedChapter, ttsStore]);

  const handleVoiceSelect = useCallback((voice: TTSVoice) => {
    ttsStore.setSelectedVoice(voice);
    setShowVoicePicker(false);
  }, [ttsStore]);

  const handleSpeedSelect = useCallback((speed: number) => {
    ttsStore.setPlaybackRate(speed);
    setShowSpeedPicker(false);
  }, [ttsStore]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    ttsStore.setVolume(value);
  }, [ttsStore]);

  const handleSleepTimerSet = useCallback((minutes: number | null) => {
    setSleepTimer(minutes);
    setShowSleepTimer(false);
    if (minutes === null) {
      Alert.alert('Sleep Timer', 'Sleep timer cancelled');
    } else {
      Alert.alert('Sleep Timer', `Playback will pause in ${minutes} minutes`);
    }
  }, []);

  const handleChapterSelect = useCallback((chapterId: string) => {
    setSelectedChapter(chapterId);
    ttsStore.setPosition(0);
  }, [ttsStore]);

  const isCurrentChapter = ttsStore.currentBookId === book.id && ttsStore.state === 'playing';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
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
          {currentChapter.title}
        </Text>
        <Text style={styles.bookAuthor}>{book.author}</Text>

        {/* Progress Slider */}
        <View style={styles.progressSection}>
          <Slider
            style={styles.progressSlider}
            minimumValue={0}
            maximumValue={totalDuration}
            value={currentTime}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.border}
            thumbTintColor={theme.colors.primary}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>-{formatTime(totalDuration - currentTime)}</Text>
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
            disabled={selectedChapter === MOCK_CHAPTERS[0].id}
          >
            <Ionicons
              name="play-skip-back"
              size={24}
              color={selectedChapter === MOCK_CHAPTERS[0].id ? theme.colors.border : theme.colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: theme.colors.primary }]}
            onPress={handlePlayPause}
          >
            <Ionicons
              name={isCurrentChapter ? 'pause' : 'play'}
              size={36}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleNextChapter}
            disabled={selectedChapter === MOCK_CHAPTERS[MOCK_CHAPTERS.length - 1].id}
          >
            <Ionicons
              name="play-skip-forward"
              size={24}
              color={selectedChapter === MOCK_CHAPTERS[MOCK_CHAPTERS.length - 1].id ? theme.colors.border : theme.colors.text}
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
              {ttsStore.selectedVoice?.name || 'Voice'}
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
        <View style={styles.chaptersSection}>
          <Text style={styles.sectionTitle}>Chapters</Text>
          {MOCK_CHAPTERS.map((chapter, index) => {
            const isActive = chapter.id === selectedChapter;
            const isPlayed = MOCK_CHAPTERS.findIndex((c) => c.id === selectedChapter) > index;
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
              {MOCK_VOICES.map((voice) => (
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
                    {voice.local && (
                      <View style={[styles.voiceBadge, { backgroundColor: theme.colors.success + '20' }]}>
                        <Text style={[styles.voiceBadgeText, { color: theme.colors.success }]}>
                          Local
                        </Text>
                      </View>
                    )}
                    {ttsStore.selectedVoice?.id === voice.id && (
                      <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
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
                    {minutes === null ? 'Off' : `${minutes} min`}
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

// Need to import Pressable since it's used in modals
import { Pressable } from 'react-native';

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
