/**
 * TTSMiniPlayer — Bottom-fixed mini player for TTS audiobook.
 * Shows when user minimizes the TTSScreen or navigates away while playing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import TrackPlayer, { State, usePlaybackState, useProgress } from 'react-native-track-player';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

export function TTSMiniPlayer() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const ttsStore = useTTSStore();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const playbackState = usePlaybackState();
  const progress = useProgress();

  const isPlaying = ttsStore.state === 'playing';
  const isPaused = ttsStore.state === 'paused';

  const paragraphProgress = progress.duration > 0 ? progress.position / progress.duration : 0;
  const overallProgress = ttsStore.totalParagraphs > 0
    ? (ttsStore.currentParagraph + paragraphProgress) / ttsStore.totalParagraphs
    : 0;

  const styles = useMemo(() => createStyles(theme), [theme]);

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
    // Navigate back to TTSScreen with full book data
    if (ttsStore.currentBook) {
      navigation.navigate('TTSScreen', { book: ttsStore.currentBook });
    } else if (ttsStore.currentBookId) {
      navigation.navigate('TTSScreen', { book: { id: ttsStore.currentBookId } as any });
    }
    ttsStore.setMiniPlayerVisible(false);
  }, [navigation, ttsStore]);

  const handleClose = useCallback(async () => {
    await TrackPlayer.reset();
    ttsStore.setState('idle');
    ttsStore.setMiniPlayerVisible(false);
    ttsStore.reset();
  }, [ttsStore]);

  // Don't show if no book is loaded or explicitly hidden
  if (!ttsStore.currentBookId || !ttsStore.isMiniPlayerVisible) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {/* Progress bar at top */}
      <View style={[styles.progressBar, { backgroundColor: theme.colors.border + '40' }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.colors.primary,
              width: `${(progress.position / (progress.duration || 1)) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.content}>
        {/* Cover thumbnail */}
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

        {/* Info */}
        <TouchableOpacity onPress={handleExpand} style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {ttsStore.currentBook?.title || ttsStore.chapterTitle || '正在朗读'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {ttsStore.chapterTitle} · 第 {ttsStore.currentParagraph + 1}/{ttsStore.totalParagraphs} 段
          </Text>
        </TouchableOpacity>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={theme.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} style={styles.controlButton}>
            <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
      width: 40,
      height: 40,
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
    title: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: theme.colors.text,
    },
    subtitle: {
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
  });
}
