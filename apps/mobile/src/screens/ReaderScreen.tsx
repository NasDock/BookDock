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
  Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReaderStore, useThemeStore, useLibraryStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { RootStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system';
import jschardet from 'jschardet';

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

// Detect encoding and decode text from ArrayBuffer
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // First try UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }

  // Use jschardet to detect encoding
  const sample = bytes.slice(0, Math.min(bytes.length, 8192));
  let binarySample = '';
  for (let i = 0; i < sample.length; i++) {
    binarySample += String.fromCharCode(sample[i]);
  }

  const detected = jschardet.detect(binarySample);
  const encoding = detected.encoding?.toLowerCase() || 'utf-8';
  const confidence = detected.confidence || 0;

  // Try detected encoding first if confidence is high enough
  if (confidence > 0.5 && encoding !== 'ascii') {
    try {
      if (encoding === 'gb2312' || encoding === 'gbk' || encoding === 'gb18030') {
        // For Chinese GB encodings, use gb18030 as it covers all
        return new TextDecoder('gb18030').decode(bytes);
      }
      if (encoding === 'big5') {
        return new TextDecoder('big5').decode(bytes);
      }
      if (encoding === 'shift_jis' || encoding === 'shift-jis' || encoding === 'sjis') {
        return new TextDecoder('shift_jis').decode(bytes);
      }
      if (encoding === 'euc-jp' || encoding === 'eucjp') {
        return new TextDecoder('euc-jp').decode(bytes);
      }
      if (encoding === 'euc-kr' || encoding === 'euckr') {
        return new TextDecoder('euc-kr').decode(bytes);
      }
      if (encoding === 'iso-8859-1' || encoding === 'latin1') {
        return new TextDecoder('iso-8859-1').decode(bytes);
      }
      if (encoding === 'windows-1251' || encoding === 'cp1251') {
        return new TextDecoder('windows-1251').decode(bytes);
      }
      if (encoding === 'windows-1252' || encoding === 'cp1252') {
        return new TextDecoder('windows-1252').decode(bytes);
      }
      // For UTF-8, fall through to default
    } catch {
      // Fall through to UTF-8
    }
  }

  // Default: try UTF-8
  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return utf8Text;
  } catch {
    // If UTF-8 fails, try GB18030 (common for Chinese novels)
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      // Last resort: latin1 (never fails, preserves bytes)
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  }
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
      padding-top: ${config.margin + 8}px;
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
    <p>作者：${bookAuthor}</p>
    <p>本书格式为 <span class="format">${fileType.toUpperCase()}</span></p>
    <p>请下载本书以使用兼容的 EPUB 阅读器进行离线阅读。</p>
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
  const [showBars, setShowBars] = useState(true);
  const [showChapters, setShowChapters] = useState(false);
  const [chapters, setChapters] = useState<Array<{ index: number; title: string }>>([]);
  const webViewRef = useRef<WebView>(null);
  const latestPositionRef = useRef<ReaderPosition>({ percentage: book.readingProgress ?? 0, scrollOffset: 0 });
  const lastScrollYRef = useRef(0);
  const topBarAnim = useRef(new Animated.Value(1)).current;
  const bottomBarAnim = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Reader config
  const readerConfig: ReaderConfig = useMemo(() => ({
    fontSize: readerStore.fontSize,
    lineHeight: readerStore.lineHeight,
    margin: readerStore.margin,
    theme: actualTheme === 'dark' ? 'dark' : 'light',
  }), [readerStore.fontSize, readerStore.lineHeight, readerStore.margin, actualTheme]);

  // Animate bars visibility
  const animateBars = useCallback((show: boolean) => {
    setShowBars(show);
    Animated.timing(topBarAnim, {
      toValue: show ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
    Animated.timing(bottomBarAnim, {
      toValue: show ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [topBarAnim, bottomBarAnim]);

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
            const fileBuffer = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
            const binary = Buffer.from(fileBuffer, 'base64');
            const text = decodeText(binary);
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
        const text = decodeText(arrayBuffer);
        const html = generateReaderHtml(book.title, book.author, text, book.fileType, readerConfig);
        setHtmlContent(html);
      } else if (book.fileType === 'pdf') {
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
      setError((err as Error).message || '加载书籍失败');
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
      } else if (data.type === 'scrollDirection') {
        const direction = data.direction;
        if (direction === 'down') {
          animateBars(false);
        } else if (direction === 'up') {
          animateBars(true);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [book.id, readerStore.autoSaveProgress, libraryStore, animateBars]);

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
      let lastScrollDirection = '';
      let scrollTimeout = null;

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

      const detectScrollDirection = () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const direction = scrollTop > lastScrollTop ? 'down' : 'up';
        if (direction !== lastScrollDirection && Math.abs(scrollTop - lastScrollTop) > 10) {
          lastScrollDirection = direction;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scrollDirection',
            direction: direction
          }));
        }
        lastScrollTop = scrollTop;
      };

      const restorePosition = () => {
        if (initialScrollOffset > 0) {
          window.scrollTo(0, initialScrollOffset);
          lastScrollTop = initialScrollOffset;
        }
        sendProgress();
      };

      window.addEventListener('scroll', () => {
        sendProgress();
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(detectScrollDirection, 100);
      }, { passive: true });

      document.addEventListener('click', function(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'click',
          x: e.clientX,
          y: e.clientY
        }));
      });

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
      const response = await apiClient.getBook(book.id);
      if (response.success && response.data) {
        const bookData = response.data;
        const shareText = `我正在 BookDock 阅读《${bookData.title}》，作者：${bookData.author}`;
        if (navigator?.share) {
          await navigator.share({ title: bookData.title, text: shareText });
        } else {
          Alert.alert('分享', shareText);
        }
      }
    } catch {
      Alert.alert('分享', `我正在 BookDock 阅读《${book.title}》，作者：${book.author}`);
    }
  }, [book]);

  const handleDownload = useCallback(async () => {
    try {
      await libraryStore.downloadBook(book);
      Alert.alert('成功', '书籍已下载，可离线阅读');
    } catch {
      Alert.alert('错误', '下载失败');
    }
  }, [libraryStore, book]);

  const handleWebViewClick = useCallback(() => {
    animateBars(!showBars);
  }, [showBars, animateBars]);

  const handleOpenChapters = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getChapters(book.id);
      if (response.success && response.data) {
        setChapters(response.data.map((ch) => ({ index: ch.index, title: ch.title })));
        setShowChapters(true);
      } else {
        Alert.alert('提示', '暂无章节信息');
      }
    } catch {
      Alert.alert('错误', '加载章节列表失败');
    }
  }, [book.id]);

  const handleChapterPress = useCallback((chapterIndex: number) => {
    setShowChapters(false);
    // For txt files, we can't easily jump to a specific chapter
    // This would require parsing the txt into chapters first
    // For now, show a toast or alert
    Alert.alert('提示', `已选择章节：${chapters.find(c => c.index === chapterIndex)?.title || ''}`);
  }, [chapters]);

  const topBarTranslate = topBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 0],
  });

  const bottomBarTranslate = bottomBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 0],
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Toolbar */}
      <Animated.View style={[styles.topBar, { borderBottomColor: theme.colors.border, transform: [{ translateY: topBarTranslate }] }]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.barButton}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.barTitle}>
          <Text style={[styles.barTitleText, { color: theme.colors.text }]} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.barButton}>
          <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </Animated.View>

      {/* WebView */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>正在加载书籍...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={loadBookContent} style={styles.retryButton}>
            <Text style={{ color: theme.colors.primary }}>重试</Text>
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
          onTouchStart={handleWebViewClick}
          onError={(e) => {
            console.error('WebView error:', e.nativeEvent);
            setError('渲染书籍内容失败');
          }}
        />
      )}

      {/* Bottom Toolbar */}
      <Animated.View style={[styles.bottomBar, { borderTopColor: theme.colors.border, transform: [{ translateY: bottomBarTranslate }] }]}>
        <TouchableOpacity style={styles.barButton} onPress={handleOpenChapters}>
          <Ionicons name="book-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={() => {}}>
          <Ionicons name="bookmark-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: theme.colors.primary }]}>
            {Math.round(book.readingProgress ?? 0)}%
          </Text>
        </View>
        <TouchableOpacity style={styles.barButton} onPress={() => {}}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={() => {}}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={() => {}}>
          <Ionicons name="volume-high-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>

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
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>阅读设置</Text>

            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>字体大小</Text>
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
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>行间距</Text>
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
                loadBookContent();
              }}
            >
              <Text style={styles.closeButtonText}>应用</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Chapters Modal */}
      <Modal
        visible={showChapters}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChapters(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowChapters(false)} />
          <View style={[styles.chaptersModalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.chaptersHeader}>
              <Text style={[styles.chaptersTitle, { color: theme.colors.text }]}>章节列表</Text>
              <TouchableOpacity onPress={() => setShowChapters(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {chapters.length === 0 ? (
              <View style={styles.chaptersEmpty}>
                <Text style={{ color: theme.colors.textSecondary }}>暂无章节信息</Text>
              </View>
            ) : (
              <ScrollView style={styles.chaptersList}>
                {chapters.map((chapter, index) => (
                  <TouchableOpacity
                    key={chapter.index}
                    style={[
                      styles.chapterItem,
                      { borderBottomColor: theme.colors.border },
                    ]}
                    onPress={() => handleChapterPress(chapter.index)}
                  >
                    <Text style={[styles.chapterNumber, { color: theme.colors.textSecondary }]}>
                      {index + 1}
                    </Text>
                    <Text style={[styles.chapterName, { color: theme.colors.text }]} numberOfLines={1}>
                      {chapter.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
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
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      backgroundColor: theme.colors.background,
      zIndex: 10,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      backgroundColor: theme.colors.background,
      zIndex: 10,
    },
    barButton: {
      padding: spacing.sm,
    },
    barTitle: {
      flex: 1,
      marginHorizontal: spacing.sm,
      alignItems: 'center',
    },
    barTitleText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    progressContainer: {
      minWidth: 40,
      alignItems: 'center',
    },
    progressText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    webview: {
      flex: 1,
      marginTop: 0,
      marginBottom: 0,
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
    chaptersModalContent: {
      padding: spacing.lg,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      maxHeight: '70%',
    },
    chaptersHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    chaptersTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
    },
    chaptersList: {
      maxHeight: 400,
    },
    chaptersEmpty: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      gap: spacing.sm,
    },
    chapterNumber: {
      fontSize: fontSizes.sm,
      width: 36,
      textAlign: 'center',
    },
    chapterName: {
      flex: 1,
      fontSize: fontSizes.md,
    },
  });
}
