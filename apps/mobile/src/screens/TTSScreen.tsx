import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTTSStore, useThemeStore, useLibraryStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';
import type { TTSVoice } from '@bookdock/api-client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TTSScreenRouteProp = RouteProp<RootStackParamList, 'TTSScreen'>;

// Mock TTS voices
const MOCK_VOICES: TTSVoice[] = [
  { id: '1', name: 'Emma', lang: 'en-US', local: true },
  { id: '2', name: 'Alex', lang: 'en-US', local: true },
  { id: '3', name: 'Sophie', lang: 'en-GB', local: true },
  { id: '4', name: 'Max', lang: 'de-DE', local: true },
  { id: '5', name: 'Marie', lang: 'fr-FR', local: true },
];

// Mock chapters for demo
const MOCK_CHAPTERS = [
  { id: '1', title: 'Chapter 1: The Beginning', duration: 1200 },
  { id: '2', title: 'Chapter 2: The Journey', duration: 1500 },
  { id: '3', title: 'Chapter 3: The Discovery', duration: 1100 },
  { id: '4', title: 'Chapter 4: The Challenge', duration: 1400 },
  { id: '5', title: 'Chapter 5: The Resolution', duration: 1300 },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute<TTSScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const ttsStore = useTTSStore();
  const { books } = useLibraryStore();

  const [selectedChapter, setSelectedChapter] = useState('1');
  const [showVoices, setShowVoices] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const currentChapter = MOCK_CHAPTERS.find((c) => c.id === selectedChapter) || MOCK_CHAPTERS[0];
  const progress = ttsStore.currentBookId === book.id ? (ttsStore.currentPosition / ttsStore.totalLength) * 100 : 0;

  const handlePlayPause = useCallback(() => {
    if (ttsStore.state === 'playing') {
      ttsStore.setState('paused');
    } else {
      ttsStore.setCurrentBook(book.id, 0, currentChapter.duration);
      ttsStore.setState('playing');
    }
  }, [ttsStore, book.id, currentChapter.duration]);

  const handlePrevious = useCallback(() => {
    const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.id === selectedChapter);
    if (currentIndex > 0) {
      setSelectedChapter(MOCK_CHAPTERS[currentIndex - 1].id);
    }
  }, [selectedChapter]);

  const handleNext = useCallback(() => {
    const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.id === selectedChapter);
    if (currentIndex < MOCK_CHAPTERS.length - 1) {
      setSelectedChapter(MOCK_CHAPTERS[currentIndex + 1].id);
    }
  }, [selectedChapter]);

  const handleVoiceSelect = useCallback((voice: TTSVoice) => {
    ttsStore.setSelectedVoice(voice);
    setShowVoices(false);
  }, [ttsStore]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    ttsStore.setPlaybackRate(rate);
  }, [ttsStore]);

  const handleSeek = useCallback((position: number) => {
    ttsStore.setPosition(position);
  }, [ttsStore]);

  // Simulate progress when playing
  useEffect(() => {
    if (ttsStore.state === 'playing' && ttsStore.currentBookId === book.id) {
      const interval = setInterval(() => {
        const newPosition = ttsStore.currentPosition + 1;
        if (newPosition >= ttsStore.totalLength) {
          ttsStore.setState('paused');
          if (ttsStore.isAutoPlay) {
            handleNext();
          }
        } else {
          handleSeek(newPosition);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [ttsStore.state, ttsStore.currentBookId, ttsStore.currentPosition, ttsStore.totalLength, ttsStore.isAutoPlay, book.id, handleSeek, handleNext]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.surface}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Listen</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Book Info */}
        <View style={styles.bookInfo}>
          <View style={[styles.bookCover, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.bookCoverText}>{book.title.charAt(0)}</Text>
          </View>
          <Text style={styles.bookTitle}>{book.title}</Text>
          <Text style={styles.bookAuthor}>{book.author}</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: theme.colors.primary },
              ]}
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>
              {formatDuration(ttsStore.currentPosition)}
            </Text>
            <Text style={styles.timeText}>
              {formatDuration(ttsStore.totalLength || currentChapter.duration)}
            </Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.secondaryControl} onPress={handlePrevious}>
            <Ionicons name="play-skip-back" size={28} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: theme.colors.primary }]}
            onPress={handlePlayPause}
          >
            <Ionicons
              name={ttsStore.state === 'playing' && ttsStore.currentBookId === book.id ? 'pause' : 'play'}
              size={36}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryControl} onPress={handleNext}>
            <Ionicons name="play-skip-forward" size={28} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Speed Control */}
        <View style={styles.speedSection}>
          <Text style={styles.speedLabel}>Playback Speed</Text>
          <View style={styles.speedButtons}>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.speedButton,
                  ttsStore.playbackRate === rate && { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => handlePlaybackRateChange(rate)}
              >
                <Text
                  style={[
                    styles.speedButtonText,
                    ttsStore.playbackRate === rate && styles.speedButtonTextActive,
                  ]}
                >
                  {rate}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Voice Selection */}
        <TouchableOpacity
          style={[styles.voiceSelector, { backgroundColor: theme.colors.surface }]}
          onPress={() => setShowVoices(!showVoices)}
        >
          <View>
            <Text style={styles.voiceLabel}>Voice</Text>
            <Text style={styles.voiceName}>
              {ttsStore.selectedVoice?.name || 'Select voice'}
            </Text>
          </View>
          <Ionicons
            name={showVoices ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {showVoices && (
          <View style={[styles.voiceList, { backgroundColor: theme.colors.surface }]}>
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
                  <Text style={styles.voiceItemName}>{voice.name}</Text>
                  <Text style={styles.voiceLang}>{voice.lang}</Text>
                </View>
                {ttsStore.selectedVoice?.id === voice.id && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Chapters */}
        <View style={styles.chaptersSection}>
          <Text style={styles.chaptersTitle}>Chapters</Text>
          {MOCK_CHAPTERS.map((chapter, index) => (
            <TouchableOpacity
              key={chapter.id}
              style={[
                styles.chapterItem,
                selectedChapter === chapter.id && { backgroundColor: theme.colors.primary + '20' },
              ]}
              onPress={() => setSelectedChapter(chapter.id)}
            >
              <View style={styles.chapterInfo}>
                <Text
                  style={[
                    styles.chapterTitle,
                    selectedChapter === chapter.id && { color: theme.colors.primary },
                  ]}
                >
                  {chapter.title}
                </Text>
                <Text style={styles.chapterDuration}>
                  {formatDuration(chapter.duration)}
                </Text>
              </View>
              {selectedChapter === chapter.id && ttsStore.state === 'playing' && ttsStore.currentBookId === book.id && (
                <View style={styles.playingIndicator}>
                  <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                  <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                  <View style={[styles.playingDot, { backgroundColor: theme.colors.primary }]} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerButton: {
      padding: spacing.sm,
      width: 44,
    },
    headerTitle: {
      flex: 1,
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
    },
    content: {
      padding: spacing.lg,
    },
    bookInfo: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    bookCover: {
      width: 150,
      height: 200,
      borderRadius: borderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    bookCoverText: {
      fontSize: 48,
      fontWeight: 'bold',
      color: theme.colors.textSecondary,
    },
    bookTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
    },
    bookAuthor: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    progressSection: {
      marginBottom: spacing.xl,
    },
    progressBar: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    timeText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.xl,
      marginBottom: spacing.xl,
    },
    secondaryControl: {
      padding: spacing.md,
    },
    playButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    speedSection: {
      marginBottom: spacing.lg,
    },
    speedLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginBottom: spacing.sm,
    },
    speedButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    speedButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surface,
    },
    speedButtonText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    speedButtonTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    voiceSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.md,
    },
    voiceLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    voiceName: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
      fontWeight: '500',
    },
    voiceList: {
      borderRadius: borderRadius.lg,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    voiceItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    voiceInfo: {
      flex: 1,
    },
    voiceItemName: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
      fontWeight: '500',
    },
    voiceLang: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    chaptersSection: {
      marginTop: spacing.lg,
    },
    chaptersTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.md,
    },
    chapterItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    chapterInfo: {
      flex: 1,
    },
    chapterTitle: {
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
  });
}
