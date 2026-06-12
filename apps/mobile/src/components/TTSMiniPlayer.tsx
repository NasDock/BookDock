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
} from 'react-native';
import TrackPlayer, { State, usePlaybackState, useProgress } from 'react-native-track-player';
import { useTTSStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';

export function TTSMiniPlayer() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const ttsStore = useTTSStore();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const playbackState = usePlaybackState();
  const progress = useProgress();

  const isPlaying = playbackState.state === State.Playing;
  const isPaused = playbackState.state === State.Paused;

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
    // Navigate back to TTSScreen
    if (ttsStore.currentBookId) {
      // We need the book object to navigate - this is a limitation
      // In practice, the mini player should be shown only when
      // the TTSScreen is in the navigation stack
      navigation.navigate('TTSScreen', { book: { id: ttsStore.currentBookId } as any });
    }
    ttsStore.setMiniPlayerVisible(false);
  }, [navigation, ttsStore]);

  const handleClose = useCallback(async () => {
    await TrackPlayer.stop();
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
          <View style={[styles.coverInner, { backgroundColor: theme.colors.primary + '20' }]}>
            <Text style={styles.coverText}>
              {ttsStore.chapterTitle?.charAt(0) || 'T'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Info */}
        <TouchableOpacity onPress={handleExpand} style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {ttsStore.chapterTitle || '正在朗读'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            第 {ttsStore.currentParagraph + 1} 段 / 共 {ttsStore.totalParagraphs} 段
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
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: borderRadius.lg,
      borderTopRightRadius: borderRadius.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 8,
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
