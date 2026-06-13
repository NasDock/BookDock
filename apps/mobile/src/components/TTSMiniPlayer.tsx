/**
 * TTSMiniPlayer — Bottom-fixed mini player for TTS audiobook.
 * Shows when user minimizes the TTSScreen or navigates away while playing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import TrackPlayer, { Event, usePlaybackState, useProgress } from 'react-native-track-player';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import type { RootStackParamList } from '../navigation/types';
import { synthesizeParagraphAudio, playParagraphAudio } from '../services/ttsAudio';

export function TTSMiniPlayer() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const ttsStore = useTTSStore();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth > 600;

  const playbackState = usePlaybackState();
  const progress = useProgress();

  const isPlaying = ttsStore.state === 'playing';
  const isPaused = ttsStore.state === 'paused';

  const [showChapterPicker, setShowChapterPicker] = useState(false);

  const paragraphProgress = progress.duration > 0 ? progress.position / progress.duration : 0;
  const overallProgress = ttsStore.totalParagraphs > 0
    ? (ttsStore.currentParagraph + paragraphProgress) / ttsStore.totalParagraphs
    : 0;

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Auto-advance paragraph when queue ends (mini player mode)
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      console.log('[TTSMiniPlayer] Queue ended, auto-advancing');
      const nextIdx = ttsStore.currentParagraph + 1;
      if (nextIdx < ttsStore.totalParagraphs) {
        ttsStore.setCurrentParagraph(nextIdx);
        // Synthesize and play next paragraph
        const paragraphs = ttsStore.paragraphs;
        const book = ttsStore.currentBook;
        const provider = ttsStore.selectedProvider || 'edge';
        const voiceId = ttsStore.selectedVoice?.id || '';
        if (paragraphs[nextIdx] && book) {
          try {
            const uris = await synthesizeParagraphAudio(book.id, paragraphs[nextIdx], provider, voiceId);
            await playParagraphAudio(uris, {
              id: paragraphs[nextIdx].id,
              title: `${book.title} - ${ttsStore.chapterTitle || ''}`,
              artist: book.author || '未知作者',
            });
            ttsStore.setState('playing');
            ttsStore.setCurrentBook(book.id, nextIdx, paragraphs.length);
          } catch (e) {
            console.error('[TTSMiniPlayer] Auto-advance error:', e);
            ttsStore.setState('idle');
          }
        }
      } else {
        ttsStore.setState('idle');
      }
    });
    return () => sub.remove();
  }, [ttsStore]);

  const handlePlayPause = useCallback(async () => {
    if (isPaused) {
      await TrackPlayer.play();
      ttsStore.setState('playing');
    } else if (isPlaying) {
      await TrackPlayer.pause();
      ttsStore.setState('paused');
    }
  }, [isPaused, isPlaying, ttsStore]);

  const handleExpand = useCallback(() => {
    if (ttsStore.currentBook) {
      navigation.navigate('TTSScreen', { book: ttsStore.currentBook });
    } else if (ttsStore.currentBookId) {
      navigation.navigate('TTSScreen', { book: { id: ttsStore.currentBookId } as any });
    }
    ttsStore.setMiniPlayerVisible(false);
  }, [navigation, ttsStore]);

  const handleSkipBack = useCallback(async () => {
    const prevIdx = Math.max(0, ttsStore.currentParagraph - 1);
    ttsStore.setCurrentParagraph(prevIdx);
    
    // Synthesize and play the previous paragraph audio
    const paragraphs = ttsStore.paragraphs;
    const book = ttsStore.currentBook;
    const provider = ttsStore.selectedProvider || 'edge';
    const voiceId = ttsStore.selectedVoice?.id || '';
    if (paragraphs[prevIdx] && book) {
      try {
        ttsStore.setState('loading');
        const uris = await synthesizeParagraphAudio(book.id, paragraphs[prevIdx], provider, voiceId);
        await playParagraphAudio(uris, {
          id: paragraphs[prevIdx].id,
          title: `${book.title} - ${ttsStore.chapterTitle || ''}`,
          artist: book.author || '未知作者',
        });
        ttsStore.setState('playing');
        ttsStore.setCurrentBook(book.id, prevIdx, paragraphs.length);
      } catch (e) {
        console.error('[TTSMiniPlayer] Skip back error:', e);
        ttsStore.setState('idle');
      }
    }
  }, [ttsStore]);

  const handleSkipForward = useCallback(async () => {
    const nextIdx = Math.min(ttsStore.totalParagraphs - 1, ttsStore.currentParagraph + 1);
    ttsStore.setCurrentParagraph(nextIdx);
    
    // Synthesize and play the next paragraph audio
    const paragraphs = ttsStore.paragraphs;
    const book = ttsStore.currentBook;
    const provider = ttsStore.selectedProvider || 'edge';
    const voiceId = ttsStore.selectedVoice?.id || '';
    if (paragraphs[nextIdx] && book) {
      try {
        ttsStore.setState('loading');
        const uris = await synthesizeParagraphAudio(book.id, paragraphs[nextIdx], provider, voiceId);
        await playParagraphAudio(uris, {
          id: paragraphs[nextIdx].id,
          title: `${book.title} - ${ttsStore.chapterTitle || ''}`,
          artist: book.author || '未知作者',
        });
        ttsStore.setState('playing');
        ttsStore.setCurrentBook(book.id, nextIdx, paragraphs.length);
      } catch (e) {
        console.error('[TTSMiniPlayer] Skip forward error:', e);
        ttsStore.setState('idle');
      }
    }
  }, [ttsStore]);

  const handleChapterList = useCallback(() => {
    setShowChapterPicker(true);
  }, []);

  const handleChapterChange = useCallback(async (ci: number) => {
    setShowChapterPicker(false);
    // Navigate to TTSScreen to load the selected chapter
    if (ttsStore.currentBook) {
      navigation.navigate('TTSScreen', { book: ttsStore.currentBook, showChapterPicker: false });
    } else if (ttsStore.currentBookId) {
      navigation.navigate('TTSScreen', { book: { id: ttsStore.currentBookId } as any, showChapterPicker: false });
    }
    ttsStore.setMiniPlayerVisible(false);
  }, [ttsStore, navigation]);

  // Don't show if no book is loaded or explicitly hidden
  if (!ttsStore.currentBookId || !ttsStore.isMiniPlayerVisible) {
    return null;
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Progress bar at top - overall chapter progress */}
        <View style={[styles.progressBar, { backgroundColor: theme.colors.border + '40' }]}>
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

        <View style={styles.content}>
          {/* Cover thumbnail - click to expand */}
          <TouchableOpacity onPress={handleExpand} style={styles.cover}>
            {ttsStore.currentBook?.coverUrl ? (
              <Image
                source={{ uri: getCoverImageUrl(ttsStore.currentBook.coverUrl) }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.coverInner, { backgroundColor: theme.colors.primary + '20' }]}>
                <Text style={styles.coverText}>
                  {(ttsStore.currentBook?.title || 'T').charAt(0)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Info - click to expand */}
          <TouchableOpacity onPress={handleExpand} style={styles.info}>
            <Text style={styles.chapterTitle} numberOfLines={1}>
              {ttsStore.chapterTitle || '未知章节'}
            </Text>
            <Text style={styles.bookMeta} numberOfLines={1}>
              {ttsStore.currentBook?.title}{ttsStore.currentBook?.author ? ` · ${ttsStore.currentBook.author}` : ''}
            </Text>
          </TouchableOpacity>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={handleSkipBack} style={styles.controlButton}>
              <Ionicons name="play-skip-back-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color={theme.colors.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkipForward} style={styles.controlButton}>
              <Ionicons name="play-skip-forward-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleChapterList} style={styles.controlButton}>
              <Ionicons name="list-outline" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Chapter Picker Modal */}
      <Modal
        visible={showChapterPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChapterPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowChapterPicker(false)}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.colors.background,
                width: isWide ? 600 : screenWidth - 32,
              },
            ]}
          >
            {/* Handle bar */}
            <View style={styles.handleBar}>
              <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
            </View>

            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              选择章节
            </Text>

            <FlatList
              data={ttsStore.chapters}
              keyExtractor={(item) => String(item.index)}
              renderItem={({ item: c }) => {
                const active = c.index === ttsStore.chapterIndex;
                return (
                  <TouchableOpacity
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
              }}
              style={styles.chapterList}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 48,
      left: 0,
      right: 0,
      borderTopLeftRadius: borderRadius.lg,
      borderTopRightRadius: borderRadius.lg,
      zIndex: 100,
    },
    progressBar: {
      height: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    cover: {
      width: 32,
      height: 44,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    },
    coverInner: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },
    coverText: {
      fontSize: fontSizes.lg,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    info: {
      flex: 1,
      justifyContent: 'center',
    },
    chapterTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '700',
      color: theme.colors.text,
    },
    bookMeta: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    controlButton: {
      padding: spacing.sm,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      alignSelf: 'center',
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      maxHeight: '70%',
    },
    handleBar: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: borderRadius.sm,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    chapterList: {
      maxHeight: 400,
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
  });
}
