import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  AppState,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReaderStore, useThemeStore, useLibraryStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { RootStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system';

// Base64 encoder for React Native (btoa is not available)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa ? btoa(binary) : Buffer.from ? Buffer.from(binary, 'binary').toString('base64') : customBtoa(binary);
}

function customBtoa(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  while (i < input.length) {
    const a = input.charCodeAt(i++);
    const b = i < input.length ? input.charCodeAt(i++) : NaN;
    const c = i < input.length ? input.charCodeAt(i++) : NaN;
    const bitmap = (a << 16) | ((!isNaN(b) ? b : 0) << 8) | (!isNaN(c) ? c : 0);
    output += chars.charAt((bitmap >> 18) & 63);
    output += chars.charAt((bitmap >> 12) & 63);
    output += !isNaN(b) ? chars.charAt((bitmap >> 6) & 63) : '=';
    output += !isNaN(c) ? chars.charAt(bitmap & 63) : '=';
  }
  return output;
}

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ReaderConfig {
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'light' | 'dark' | 'sepia';
}

// Generate HTML reader based on file type and content
function generateReaderHtml(
  bookTitle: string,
  bookAuthor: string,
  content: string,
  fileType: string,
  config: ReaderConfig,
  isBase64: boolean = false
): string {
  const isDark = config.theme === 'dark';
  const isSepia = config.theme === 'sepia';
  const bgColor = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const linkColor = isDark ? '#6b9fff' : '#0066cc';

  if (fileType === 'pdf') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <style>body{margin:0;padding:0;background:${bgColor};overflow:hidden;height:100vh;}</style>
</head>
<body>
  <embed src="data:application/pdf;base64,${content}" type="application/pdf" width="100%" height="100%" />
</body>
</html>`;
  }

  if (fileType === 'txt' || fileType === 'text') {
    const safeContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      text-align: justify;
      word-wrap: break-word;
      transition: all 0.3s ease;
    }
    h1 { font-size: ${config.fontSize * 1.5}px; margin-bottom: 0.5em; color: ${textColor}; }
    h2 { font-size: ${config.fontSize * 1.3}px; margin-bottom: 0.5em; color: ${textColor}; }
    pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
  </style>
</head>
<body>
  <h1>${bookTitle}</h1>
  <p style="font-style: italic; margin-bottom: 2em;">by ${bookAuthor}</p>
  <pre>${safeContent}</pre>
</body>
</html>`;
  }

  // EPUB / MOBI fallback - show a message with download option
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, sans-serif;
      font-size: ${config.fontSize}px;
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .card {
      background: ${isDark ? '#2a2a2a' : '#f5f5f5'};
      padding: 2em;
      border-radius: 12px;
      max-width: 400px;
    }
    h2 { margin-top: 0; }
    .format { color: ${linkColor}; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${bookTitle}</h2>
    <p>by ${bookAuthor}</p>
    <p>This book is in <span class="format">${fileType.toUpperCase()}</span> format.</p>
    <p>Please download the book for offline reading with a compatible EPUB reader.</p>
  </div>
</body>
</html>`;
}

export function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const readerStore = useReaderStore();
  const libraryStore = useLibraryStore();

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedScrollOffset, setSavedScrollOffset] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const latestPositionRef = useRef<ReaderPosition>({ percentage: book.readingProgress ?? 0, scrollOffset: 0 });

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Reader config
  const readerConfig: ReaderConfig = useMemo(() => ({
    fontSize: readerStore.fontSize,
    lineHeight: readerStore.lineHeight,
    margin: readerStore.margin,
    theme: actualTheme === 'dark' ? 'dark' : 'light',
  }), [readerStore.fontSize, readerStore.lineHeight, readerStore.margin, actualTheme]);

  // Load book content
  const loadBookContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let initialScrollOffset = 0;
      try {
        const progressResponse = await getApiClient().getReadingProgress(book.id);
        if (progressResponse.success && progressResponse.data) {
          initialScrollOffset = progressResponse.data.scrollOffset ?? 0;
          latestPositionRef.current = {
            percentage: progressResponse.data.progressPct,
            currentPage: progressResponse.data.currentChapter,
            scrollOffset: initialScrollOffset,
          };
        }
      } catch {
        // First read or offline mode: start from top.
      }
      setSavedScrollOffset(initialScrollOffset);

      // Check if we have a local file first
      const localPath = libraryStore.getLocalBookPath(book.id);
      if (localPath) {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
          // Use local file
          if (book.fileType === 'txt') {
            const text = await FileSystem.readAsStringAsync(localPath);
            const html = generateReaderHtml(book.title, book.author, text, book.fileType, readerConfig);
            setHtmlContent(html);
          } else if (book.fileType === 'pdf') {
            const base64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
            const html = generateReaderHtml(book.title, book.author, base64, 'pdf', readerConfig, true);
            setHtmlContent(html);
          } else {
            // EPUB/MOBI - show placeholder
            const html = generateReaderHtml(book.title, book.author, '', book.fileType, readerConfig);
            setHtmlContent(html);
          }
          setIsLoading(false);
          return;
        }
      }

      // Fetch from server
      const apiClient = getApiClient();
      const arrayBuffer = await apiClient.downloadBookFile(book.id);

      if (book.fileType === 'txt') {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(arrayBuffer);
        const html = generateReaderHtml(book.title, book.author, text, book.fileType, readerConfig);
        setHtmlContent(html);
      } else if (book.fileType === 'pdf') {
        const bytes = new Uint8Array(arrayBuffer);
        const base64 = arrayBufferToBase64(arrayBuffer);
        const html = generateReaderHtml(book.title, book.author, base64, 'pdf', readerConfig, true);
        setHtmlContent(html);
      } else {
        // EPUB / MOBI - show placeholder with real file loaded message
        const html = generateReaderHtml(book.title, book.author, '', book.fileType, readerConfig);
        setHtmlContent(html);
      }
    } catch (err) {
      console.error('Failed to load book:', err);
      setError((err as Error).message || 'Failed to load book');
    } finally {
      setIsLoading(false);
    }
  }, [book, libraryStore, readerConfig]);

  useEffect(() => {
    loadBookContent();
  }, [loadBookContent]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'scroll') {
        const progress = data.progress || 0;
        const scrollOffset = data.scrollOffset || 0;
        latestPositionRef.current = { percentage: progress, currentPage: 0, scrollOffset };
        if (book.id && readerStore.autoSaveProgress) {
          libraryStore.saveReadingProgress(book.id, latestPositionRef.current);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [book.id, readerStore.autoSaveProgress, libraryStore]);

  const requestCurrentPositionSave = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        ) - window.innerHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scroll',
          progress: Math.max(0, Math.min(100, progress)),
          scrollOffset: Math.max(0, Math.round(scrollTop))
        }));
      })();
      true;
    `);
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        requestCurrentPositionSave();
        if (book.id && readerStore.autoSaveProgress) {
          libraryStore.saveReadingProgress(book.id, latestPositionRef.current);
        }
      }
    });

    return () => {
      appStateSubscription.remove();
      requestCurrentPositionSave();
      if (book.id && readerStore.autoSaveProgress) {
        libraryStore.saveReadingProgress(book.id, latestPositionRef.current);
      }
    };
  }, [book.id, libraryStore, readerStore.autoSaveProgress, requestCurrentPositionSave]);

  const handleGoBack = useCallback(() => {
    requestCurrentPositionSave();
    setTimeout(() => navigation.goBack(), 120);
  }, [navigation, requestCurrentPositionSave]);

  const injectedJS = useMemo(() => `
    (function() {
      const initialScrollOffset = ${Math.max(0, Math.round(savedScrollOffset))};
      let lastScrollTop = -1;
      const sendProgress = () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        ) - window.innerHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        if (Math.abs(scrollTop - lastScrollTop) > 24) {
          lastScrollTop = scrollTop;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scroll',
            progress: Math.max(0, Math.min(100, progress)),
            scrollOffset: Math.max(0, Math.round(scrollTop))
          }));
        }
      };

      const restorePosition = () => {
        if (initialScrollOffset > 0) {
          window.scrollTo(0, initialScrollOffset);
          lastScrollTop = initialScrollOffset;
        }
        sendProgress();
      };

      window.addEventListener('scroll', sendProgress, { passive: true });
      requestAnimationFrame(() => {
        restorePosition();
        setTimeout(restorePosition, 250);
      });
    })();
    true;
  `, [savedScrollOffset]);

  const handleShare = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      // Try to get book details for sharing
      const response = await apiClient.getBook(book.id);
      if (response.success && response.data) {
        const bookData = response.data;
        const shareText = `I'm reading "${bookData.title}" by ${bookData.author} on BookDock`;
        // Use Share API if available, otherwise clipboard
        // @ts-ignore
        if (navigator?.share) {
          // @ts-ignore
          await navigator.share({ title: bookData.title, text: shareText });
        } else {
          Alert.alert('Share', shareText);
        }
      }
    } catch {
      Alert.alert('Share', `I'm reading "${book.title}" by ${book.author} on BookDock`);
    }
  }, [book]);

  const handleDownload = useCallback(async () => {
    try {
      await libraryStore.downloadBook(book);
      Alert.alert('Success', 'Book downloaded for offline reading');
    } catch {
      Alert.alert('Error', 'Failed to download book');
    }
  }, [libraryStore, book]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.toolbarButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.toolbarTitle}>
          <Text style={[styles.toolbarTitleText, { color: theme.colors.text }]} numberOfLines={1}>
            {book.title}
          </Text>
          {book.readingProgress !== undefined && (
            <Text style={[styles.toolbarProgress, { color: theme.colors.textSecondary }]}>
              {Math.round(book.readingProgress)}% read
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.toolbarButton}>
          <Ionicons name="share-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.toolbarButton}>
          <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDownload} style={styles.toolbarButton}>
          <Ionicons name="cloud-download-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* WebView */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading book...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={loadBookContent} style={styles.retryButton}>
            <Text style={{ color: theme.colors.primary }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.webview}
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onError={(e) => {
            console.error('WebView error:', e.nativeEvent);
            setError('Failed to render book content');
          }}
        />
      )}

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Reader Settings</Text>

            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Font Size</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setFontSize(Math.max(12, readerStore.fontSize - 2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>A-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.fontSize}px</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setFontSize(Math.min(32, readerStore.fontSize + 2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>A+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Line Height</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setLineHeight(Math.max(1, readerStore.lineHeight - 0.2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.lineHeight.toFixed(1)}</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setLineHeight(Math.min(3, readerStore.lineHeight + 0.2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                setShowSettings(false);
                loadBookContent(); // Reload with new settings
              }}
            >
              <Text style={styles.closeButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
    },
    toolbarButton: {
      padding: spacing.sm,
    },
    toolbarTitle: {
      flex: 1,
      marginHorizontal: spacing.sm,
    },
    toolbarTitleText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    toolbarProgress: {
      fontSize: fontSizes.xs,
      marginTop: 2,
    },
    webview: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    loadingText: {
      fontSize: fontSizes.md,
    },
    errorText: {
      fontSize: fontSizes.md,
      textAlign: 'center',
      marginHorizontal: spacing.lg,
    },
    retryButton: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      padding: spacing.lg,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      gap: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    settingLabel: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    fontSizeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    fontButton: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fontValue: {
      fontSize: fontSizes.md,
      minWidth: 50,
      textAlign: 'center',
    },
    closeButton: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
  });
}
