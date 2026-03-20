import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import { useTTSStore, useThemeStore, useLibraryStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function TTSTabScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { books } = useLibraryStore();
  const ttsState = useTTSStore();

  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('TTSScreen', { book });
  }, [navigation]);

  const handlePlayPause = useCallback(() => {
    if (ttsState.state === 'playing') {
      ttsState.setState('paused');
    } else {
      ttsState.setState('playing');
    }
  }, [ttsState]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Currently Playing */}
        {ttsState.currentBookId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Currently Playing</Text>
            <View style={[styles.playerCard, { backgroundColor: theme.colors.surface }]}>
              <View style={[styles.playerCover, { backgroundColor: theme.colors.border }]}>
                <Text style={styles.playerCoverText}>
                  {books.find((b) => b.id === ttsState.currentBookId)?.title.charAt(0) || '?'}
                </Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerTitle} numberOfLines={1}>
                  {books.find((b) => b.id === ttsState.currentBookId)?.title || 'Unknown'}
                </Text>
                <Text style={styles.playerAuthor} numberOfLines={1}>
                  {books.find((b) => b.id === ttsState.currentBookId)?.author || 'Unknown'}
                </Text>
              </View>
              <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
                <Ionicons
                  name={ttsState.state === 'playing' ? 'pause' : 'play'}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Start */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Listen</Text>
          <Text style={styles.sectionSubtitle}>
            Select a book to start listening
          </Text>
          <View style={styles.bookGrid}>
            {books.slice(0, 4).map((book) => (
              <TouchableOpacity
                key={book.id}
                style={[styles.bookCard, { backgroundColor: theme.colors.surface }]}
                onPress={() => handleBookPress(book)}
              >
                <View style={[styles.bookCover, { backgroundColor: theme.colors.border }]}>
                  <Ionicons name="headset" size={24} color={theme.colors.textSecondary} />
                </View>
                <Text style={styles.bookTitle} numberOfLines={1}>
                  {book.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Playback Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>
          <View style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Speed</Text>
              <Text style={styles.settingValue}>{ttsState.playbackRate}x</Text>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Volume</Text>
              <View style={styles.volumeContainer}>
                <Ionicons name="volume-low" size={16} color={theme.colors.textSecondary} />
                <View style={styles.volumeSlider}>
                  <View 
                    style={[
                      styles.volumeFill, 
                      { width: `${ttsState.volume * 100}%`, backgroundColor: theme.colors.primary }
                    ]} 
                  />
                </View>
                <Ionicons name="volume-high" size={16} color={theme.colors.textSecondary} />
              </View>
            </View>
          </View>
        </View>

        {/* Auto-play Toggle */}
        <TouchableOpacity
          style={[styles.autoPlayToggle, { backgroundColor: theme.colors.surface }]}
          onPress={() => ttsState.setAutoPlay(!ttsState.isAutoPlay)}
        >
          <View>
            <Text style={styles.autoPlayTitle}>Auto-play</Text>
            <Text style={styles.autoPlaySubtitle}>
              Automatically continue to next section
            </Text>
          </View>
          <View style={[
            styles.toggle,
            ttsState.isAutoPlay && { backgroundColor: theme.colors.primary }
          ]}>
            <View style={[
              styles.toggleThumb,
              ttsState.isAutoPlay && styles.toggleThumbActive
            ]} />
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.xs,
    },
    sectionSubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginBottom: spacing.md,
    },
    playerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    playerCover: {
      width: 50,
      height: 50,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playerCoverText: {
      fontSize: fontSizes.xl,
      fontWeight: 'bold',
      color: theme.colors.textSecondary,
    },
    playerInfo: {
      flex: 1,
      marginLeft: spacing.md,
    },
    playerTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    playerAuthor: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bookGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    bookCard: {
      width: '48%',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
    },
    bookCover: {
      width: 60,
      height: 60,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    bookTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
      color: theme.colors.text,
      textAlign: 'center',
    },
    settingsCard: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    settingLabel: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    settingValue: {
      fontSize: fontSizes.md,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    volumeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    volumeSlider: {
      width: 100,
      height: 4,
      backgroundColor: theme.colors.border,
      borderRadius: 2,
    },
    volumeFill: {
      height: '100%',
      borderRadius: 2,
    },
    autoPlayToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    autoPlayTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    autoPlaySubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.colors.border,
      padding: 2,
    },
    toggleThumb: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#fff',
    },
    toggleThumbActive: {
      transform: [{ translateX: 20 }],
    },
  });
}
