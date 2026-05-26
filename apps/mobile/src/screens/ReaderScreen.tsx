import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  AppState,
  Animated,
  ScrollView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReaderStore, useThemeStore, useLibraryStore, useAuthStore } from '../stores';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { setNavigationBarAuto } from '../utils/navigationBar';
import { getApiClient } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { RootStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system';
import jschardet from 'jschardet';
import * as gbkjs from 'gbk.js';

// Base64 to ArrayBuffer decoder (Buffer is not available in React Native)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Base64 encoder for React Native (btoa is not available)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : customBtoa(binary);
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

// Decode bytes as latin1 (ISO-8859-1) - pure JS, always works
function decodeLatin1(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

// Try UTF-8 decode using Hermes TextDecoder
function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

// Detect encoding and decode text from ArrayBuffer
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // First try UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const result = tryDecodeUtf8(bytes.slice(3));
    if (result !== null) return result;
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
    // GB family (most common for Chinese novels)
    if (encoding === 'gb2312' || encoding === 'gbk' || encoding === 'gb18030') {
      try {
        return gbkjs.decode(bytes);
      } catch {
        // fall through
      }
    }
    // For other encodings, try utf-8 first then fall back
  }

  // Default: try UTF-8
  const utf8Text = tryDecodeUtf8(bytes);
  if (utf8Text !== null) return utf8Text;

  // If UTF-8 fails, try GBK (common for Chinese novels)
  try {
    return gbkjs.decode(bytes);
  } catch {
    // Last resort: latin1 (never fails, preserves bytes)
    return decodeLatin1(bytes);
  }
}

function parseLocalTxtChapters(text: string): { title: string; content: string }[] {
  const lines = text.split(/\r?\n/);
  const chapterPatterns = [
    /^\s*前言\s*$/i,
    /^\s*引子\s*$/i,
    /^\s*楔子\s*$/i,
    /^\s*序[章言]?\s*$/i,
    /^\s*第[一二三四五六七八九十百千万零\d]+[章回节卷部集]\s*.*/,
    /^\s*第\d+[章回节卷部集]\s*.*/,
    /^\s*[\d零一二三四五六七八九十百千万]+\s*[、.．]\s*.*/,
    /^\s*附录[一二三四五六七八九十]?\s*$/i,
    /^\s*后记\s*$/i,
    /^\s*尾声\s*$/i,
  ];

  const chaptersList: { title: string; startLine: number }[] = [];
  lines.forEach((line, index) => {
    for (const pattern of chapterPatterns) {
      if (pattern.test(line)) {
        chaptersList.push({ title: line.trim(), startLine: index });
        break;
      }
    }
  });

  if (chaptersList.length === 0) {
    chaptersList.push({ title: '正文', startLine: 0 });
  }

  const parsedChapters: { title: string; content: string }[] = [];
  for (let i = 0; i < chaptersList.length; i++) {
    const start = chaptersList[i].startLine;
    const end = i + 1 < chaptersList.length ? chaptersList[i + 1].startLine : lines.length;
    const content = lines.slice(start, end).join('\n');
    parsedChapters.push({ title: chaptersList[i].title, content });
  }
  return parsedChapters;
}

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ReaderConfig {
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: string;
}

const READER_THEMES = [
  { key: 'light' as const, label: '浅色', bg: '#ffffff', text: '#1a1a1a', barBg: '#ffffff', barText: '#1a1a1a', border: '#e5e5e5' },
  { key: 'dark' as const, label: '深色', bg: '#1a1a1a', text: '#e0e0e0', barBg: '#1a1a1a', barText: '#e0e0e0', border: '#333333' },
  { key: 'sepia' as const, label: '护眼', bg: '#f4ecd8', text: '#5c4b37', barBg: '#f4ecd8', barText: '#5c4b37', border: '#d4c4a8' },
];

const FONT_OPTIONS = [
  { label: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '衬线体', value: 'Georgia, "Noto Serif SC", serif' },
  { label: '黑体', value: '"Noto Sans SC", "PingFang SC", sans-serif' },
];

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
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      padding-top: ${config.margin + 56}px;
      text-align: justify;
      word-wrap: break-word;
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
      font-family: ${config.fontFamily};
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
  const insets = useSafeAreaInsets();

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedScrollOffset, setSavedScrollOffset] = useState(0);
  const [showBars, setShowBars] = useState(true);
  const [showChapters, setShowChapters] = useState(false);
  const [chapters, setChapters] = useState<Array<{ index: number; title: string }>>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [readingProgress, setReadingProgress] = useState(book.readingProgress ?? 0);
  const localChaptersRef = useRef<Array<{ title: string; content: string }>>([]);
  const webViewRef = useRef<WebView>(null);
  const latestPositionRef = useRef<ReaderPosition>({ percentage: book.readingProgress ?? 0, scrollOffset: 0 });
  const lastScrollYRef = useRef(0);
  const topBarAnim = useRef(new Animated.Value(1)).current;
  const bottomBarAnim = useRef(new Animated.Value(1)).current;

  // Reader theme colors for native UI bars
  const readerTheme = READER_THEMES.find(tm => tm.key === readerStore.mode) || READER_THEMES[0];

  // Sync navigation bar color with reader theme when focused
  useFocusEffect(
    useCallback(() => {
      setNavigationBarAuto(readerTheme.bg);
    }, [readerTheme.bg])
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Reader config
  const readerConfig: ReaderConfig = useMemo(() => ({
    fontSize: readerStore.fontSize,
    lineHeight: readerStore.lineHeight,
    margin: readerStore.margin,
    theme: readerStore.mode,
    fontFamily: readerStore.fontFamily,
  }), [readerStore.fontSize, readerStore.lineHeight, readerStore.margin, readerStore.mode, readerStore.fontFamily]);

  const readerConfigRef = useRef<ReaderConfig>(readerConfig);
  useEffect(() => {
    readerConfigRef.current = readerConfig;
  }, [readerConfig]);

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

  // Load specific chapter for TXT books
  const loadChapter = useCallback(async (chapterIndex: number, scrollOffset = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      setCurrentChapter(chapterIndex);
      setSavedScrollOffset(scrollOffset);
      
      const localPath = libraryStore.getLocalBookPath(book.id);
      let chapterContent = '';
      if (localPath) {
        const parsed = localChaptersRef.current;
        if (parsed && parsed.length > 0) {
          chapterContent = parsed[chapterIndex]?.content || '';
        } else {
          const fileBuffer = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
          const binary = base64ToArrayBuffer(fileBuffer);
          const text = decodeText(binary);
          const localParsed = parseLocalTxtChapters(text);
          localChaptersRef.current = localParsed;
          chapterContent = localParsed[chapterIndex]?.content || '';
        }
      } else {
        const contentRes = await getApiClient().getChapterContent(book.id, chapterIndex);
        if (contentRes.success && contentRes.data) {
          chapterContent = contentRes.data.content;
        } else {
          throw new Error(contentRes.error || '加载章节内容失败');
        }
      }

      const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
      setHtmlContent(html);

      const chsCount = chapters.length || localChaptersRef.current.length || 1;
      const overallPercentage = Math.round(((chapterIndex + 1) / chsCount) * 100);
      setReadingProgress(overallPercentage);

      latestPositionRef.current = {
        percentage: overallPercentage,
        currentPage: chapterIndex,
        scrollOffset,
      };

      if (readerStore.autoSaveProgress) {
        libraryStore.saveReadingProgress(book.id, latestPositionRef.current);
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
      setError((err as Error).message || '加载章节失败');
    } finally {
      setIsLoading(false);
    }
  }, [book, chapters.length, libraryStore, readerStore.autoSaveProgress]);

  // Load book content
  const loadBookContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let initialChapter = 0;
      let initialScrollOffset = 0;
      try {
        const progressResponse = await getApiClient().getReadingProgress(book.id);
        if (progressResponse.success && progressResponse.data) {
          initialChapter = progressResponse.data.currentChapter ?? 0;
          initialScrollOffset = progressResponse.data.scrollOffset ?? 0;
          latestPositionRef.current = {
            percentage: progressResponse.data.progressPct,
            currentPage: initialChapter,
            scrollOffset: initialScrollOffset,
          };
        }
      } catch {
        try {
          const key = `reading_progress_${book.id}`;
          const localProgress = await AsyncStorage.getItem(key);
          if (localProgress) {
            const data = JSON.parse(localProgress);
            initialChapter = data.position.currentPage ?? 0;
            initialScrollOffset = data.position.scrollOffset ?? 0;
            latestPositionRef.current = data.position;
          }
        } catch {
          // ignore
        }
      }
      setSavedScrollOffset(initialScrollOffset);
      setCurrentChapter(initialChapter);
      setReadingProgress(latestPositionRef.current.percentage);

      const localPath = libraryStore.getLocalBookPath(book.id);
      if (localPath) {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
          if (book.fileType === 'txt') {
            const fileBuffer = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
            const binary = base64ToArrayBuffer(fileBuffer);
            const text = decodeText(binary);
            const parsed = parseLocalTxtChapters(text);
            localChaptersRef.current = parsed;
            
            const chs = parsed.map((ch, idx) => ({ index: idx, title: ch.title }));
            setChapters(chs);

            const chapterContent = parsed[initialChapter]?.content || '';
            const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
            setHtmlContent(html);
            
            const overallPct = chs.length > 0 ? Math.round(((initialChapter + 1) / chs.length) * 100) : 0;
            setReadingProgress(overallPct);
            latestPositionRef.current = {
              percentage: overallPct,
              currentPage: initialChapter,
              scrollOffset: initialScrollOffset,
            };
          } else if (book.fileType === 'pdf') {
            const base64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
            const html = generateReaderHtml(book.title, book.author, base64, 'pdf', readerConfigRef.current, true);
            setHtmlContent(html);
          } else {
            const html = generateReaderHtml(book.title, book.author, '', book.fileType, readerConfigRef.current);
            setHtmlContent(html);
          }
          setIsLoading(false);
          return;
        }
      }

      // Fetch from server
      const apiClient = getApiClient();
      if (book.fileType === 'txt') {
        const chaptersRes = await apiClient.getChapters(book.id);
        if (chaptersRes.success && chaptersRes.data) {
          const chs = chaptersRes.data.map(ch => ({ index: ch.index, title: ch.title }));
          setChapters(chs);

          const contentRes = await apiClient.getChapterContent(book.id, initialChapter);
          if (contentRes.success && contentRes.data) {
            const html = generateReaderHtml(book.title, book.author, contentRes.data.content, book.fileType, readerConfigRef.current);
            setHtmlContent(html);
            
            const overallPct = chs.length > 0 ? Math.round(((initialChapter + 1) / chs.length) * 100) : 0;
            setReadingProgress(overallPct);
            latestPositionRef.current = {
              percentage: overallPct,
              currentPage: initialChapter,
              scrollOffset: initialScrollOffset,
            };
          } else {
            throw new Error(contentRes.error || '加载章节内容失败');
          }
        } else {
          throw new Error(chaptersRes.error || '获取章节目录失败');
        }
      } else {
        const arrayBuffer = await apiClient.downloadBookFile(book.id);
        if (book.fileType === 'pdf') {
          const base64 = arrayBufferToBase64(arrayBuffer);
          const html = generateReaderHtml(book.title, book.author, base64, 'pdf', readerConfigRef.current, true);
          setHtmlContent(html);
        } else {
          const html = generateReaderHtml(book.title, book.author, '', book.fileType, readerConfigRef.current);
          setHtmlContent(html);
        }
      }
    } catch (err) {
      console.error('Failed to load book:', err);
      setError((err as Error).message || '加载书籍失败');
    } finally {
      setIsLoading(false);
    }
  }, [book, libraryStore]);

  useEffect(() => {
    loadBookContent();
  }, [loadBookContent]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'scroll') {
        const progress = data.progress || 0;
        const scrollOffset = data.scrollOffset || 0;
        
        // Calculate overall progress based on chapter index
        const overallPercentage = chapters.length > 0
          ? Math.max(0, Math.min(100, Math.round(((currentChapter + (progress / 100)) / chapters.length) * 100)))
          : 0;

        latestPositionRef.current = {
          percentage: overallPercentage,
          currentPage: currentChapter,
          scrollOffset,
        };
        setReadingProgress(overallPercentage);
        
        if (book.id && readerStore.autoSaveProgress) {
          libraryStore.saveReadingProgress(book.id, latestPositionRef.current);
        }
      } else if (data.type === 'scrollDirection') {
        const direction = data.direction;
        if (direction === 'down' || direction === 'up') {
          // Scrolling in either direction (reading) -> hide bars
          animateBars(false);
        }
      } else if (data.type === 'click') {
        const { x, y } = data;
        const screenHeight = Dimensions.get('window').height;
        const topZone = screenHeight * 0.15;
        const bottomZone = screenHeight * 0.85;
        // Click in top or bottom zone toggles bars; middle zone does nothing
        if (y < topZone || y > bottomZone) {
          animateBars(!showBars);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [book.id, readerStore.autoSaveProgress, libraryStore, animateBars, showBars, chapters.length, currentChapter]);

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
      let directionAnchor = 0;
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
        const direction = scrollTop > directionAnchor ? 'down' : 'up';
        const delta = Math.abs(scrollTop - directionAnchor);
        // Only report direction change after significant movement (80px)
        if (direction !== lastScrollDirection && delta > 80) {
          lastScrollDirection = direction;
          directionAnchor = scrollTop;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scrollDirection',
            direction: direction
          }));
        }
      };

      const restorePosition = () => {
        if (initialScrollOffset > 0) {
          window.scrollTo(0, initialScrollOffset);
          lastScrollTop = initialScrollOffset;
          directionAnchor = initialScrollOffset;
        }
        sendProgress();
      };

      window.addEventListener('scroll', () => {
        sendProgress();
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(detectScrollDirection, 150);
      }, { passive: true });

      document.addEventListener('click', function(e) {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        directionAnchor = scrollTop;
        lastScrollDirection = '';
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
    // Click handling is now done via message from WebView for precise zone detection
    // This is kept as fallback but does nothing to avoid conflict
  }, []);

  const handleOpenChapters = useCallback(() => {
    if (chapters.length > 0) {
      setShowChapters(true);
    } else {
      Alert.alert('提示', '暂无章节信息');
    }
  }, [chapters]);

  const handleChapterPress = useCallback((chapterIndex: number) => {
    setShowChapters(false);
    if (book.fileType === 'txt') {
      loadChapter(chapterIndex, 0);
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          const headings = document.querySelectorAll('h1, h2, h3');
          if (headings[${chapterIndex}]) {
            headings[${chapterIndex}].scrollIntoView({ behavior: 'smooth' });
          }
        })();
        true;
      `);
    }
  }, [book.fileType, loadChapter]);

  const handleBookmark = useCallback(() => {
    requestCurrentPositionSave();
    Alert.alert('书签', '已保存当前阅读位置');
  }, [requestCurrentPositionSave]);

  const handlePrevPage = useCallback(() => {
    if (book.fileType === 'txt') {
      if (currentChapter > 0) {
        loadChapter(currentChapter - 1, 0);
      } else {
        Alert.alert('提示', '已经是第一章了');
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          window.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' });
        })();
        true;
      `);
    }
  }, [book.fileType, currentChapter, loadChapter]);

  const handleNextPage = useCallback(() => {
    if (book.fileType === 'txt') {
      if (currentChapter < chapters.length - 1) {
        loadChapter(currentChapter + 1, 0);
      } else {
        Alert.alert('提示', '已经是最后一章了');
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' });
        })();
        true;
      `);
    }
  }, [book.fileType, currentChapter, chapters.length, loadChapter]);

  const handleTTS = useCallback(async () => {
    const token = await AsyncStorage.getItem('bookdock_plus_token');
    if (!token) {
      navigation.navigate('MemberLogin');
      return;
    }
    const vip = await useAuthStore.getState().refreshVipStatus();
    if (!vip) {
      navigation.navigate('MemberBenefits');
      return;
    }
    navigation.navigate('TTSScreen', { book });
  }, [navigation, book]);

  // Apply reader settings to WebView in real-time
  const applyReaderSettings = useCallback((
    mode: string,
    fontFamily: string,
    fontSize: number,
    lineHeight: number,
    margin: number
  ) => {
    const t = READER_THEMES.find(tm => tm.key === mode) || READER_THEMES[0];
    const safeFont = fontFamily.replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(`
      (function() {
        const body = document.body;
        if (body) {
          body.style.fontFamily = '${safeFont}';
          body.style.fontSize = '${fontSize}px';
          body.style.lineHeight = '${lineHeight}';
          body.style.color = '${t.text}';
          body.style.background = '${t.bg}';
          body.style.padding = '${margin}px';
          body.style.paddingTop = '${margin + 56}px';
        }
        const headings = document.querySelectorAll('h1, h2');
        headings.forEach(h => {
          h.style.color = '${t.text}';
        });
      })();
      true;
    `);
  }, []);

  // Track if WebView is ready for JS injection
  const webViewReadyRef = useRef(false);

  // Watch reader store changes and apply settings in real-time
  useEffect(() => {
    if (!isLoading && htmlContent && webViewReadyRef.current) {
      applyReaderSettings(readerStore.mode, readerStore.fontFamily, readerStore.fontSize, readerStore.lineHeight, readerStore.margin);
    }
  }, [readerStore.mode, readerStore.fontFamily, readerStore.fontSize, readerStore.lineHeight, readerStore.margin, isLoading, htmlContent, applyReaderSettings]);

  const topBarTranslate = topBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-150, 0],
  });

  const bottomBarTranslate = bottomBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0],
  });

  return (
    <View style={[styles.container, { backgroundColor: readerTheme.bg }]}>
      <StatusBar
        style={readerStore.mode === 'dark' ? 'light' : 'dark'}
        hidden={!showBars}
      />

      {/* Top Toolbar */}
      <Animated.View style={[
        styles.topBar,
        {
          borderBottomColor: readerTheme.border,
          backgroundColor: readerTheme.barBg,
          transform: [{ translateY: topBarTranslate }],
          paddingTop: Math.max(insets.top, spacing.sm),
        }
      ]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.barButton}>
          <Ionicons name="arrow-back" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <View style={styles.barTitle}>
          <Text style={[styles.barTitleText, { color: readerTheme.barText }]} numberOfLines={1}>
            {chapters[currentChapter]?.title || book.title}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.barButton}>
          <Ionicons name="settings-outline" size={22} color={readerTheme.barText} />
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
          onLoadEnd={() => { webViewReadyRef.current = true; }}
          onError={(e) => {
            console.error('WebView error:', e.nativeEvent);
            setError('渲染书籍内容失败');
          }}
        />
      )}

      {/* Bottom Toolbar */}
      <Animated.View style={[
        styles.bottomBar,
        {
          borderTopColor: readerTheme.border,
          backgroundColor: readerTheme.barBg,
          transform: [{ translateY: bottomBarTranslate }],
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        }
      ]}>
        <TouchableOpacity style={styles.barButton} onPress={handleOpenChapters}>
          <Ionicons name="book-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleBookmark}>
          <Ionicons name="bookmark-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: readerTheme.barText }]}>
            {Math.round(readingProgress)}%
          </Text>
        </View>
        <TouchableOpacity style={styles.barButton} onPress={handlePrevPage}>
          <Ionicons name="chevron-back" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleNextPage}>
          <Ionicons name="chevron-forward" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleTTS}>
          <Ionicons name="volume-high-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={22} color={readerTheme.barText} />
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

            {/* Theme */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>阅读底色</Text>
              <View style={styles.themeRow}>
                {READER_THEMES.map((tm) => (
                  <TouchableOpacity
                    key={tm.key}
                    style={[
                      styles.themeChip,
                      { backgroundColor: tm.bg, borderColor: readerStore.mode === tm.key ? theme.colors.primary : theme.colors.border },
                      readerStore.mode === tm.key && styles.themeChipActive,
                    ]}
                    onPress={() => readerStore.setMode(tm.key)}
                  >
                    <Text style={[styles.themeChipText, { color: tm.text }]}>{tm.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Font Family */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>字体</Text>
              <View style={styles.fontSizeControls}>
                {FONT_OPTIONS.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[
                      styles.fontOptionButton,
                      { borderColor: readerStore.fontFamily === f.value ? theme.colors.primary : theme.colors.border },
                      readerStore.fontFamily === f.value && { backgroundColor: theme.colors.primary + '20' },
                    ]}
                    onPress={() => readerStore.setFontFamily(f.value)}
                  >
                    <Text style={[styles.fontOptionText, { color: theme.colors.text }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Font Size */}
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

            {/* Line Height */}
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

            {/* Margin */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>页边距</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setMargin(Math.max(8, readerStore.margin - 4))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.margin}px</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setMargin(Math.min(48, readerStore.margin + 4))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeButtonText}>完成</Text>
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
              <ChapterList
                chapters={chapters}
                currentChapter={currentChapter}
                theme={theme}
                onChapterPress={handleChapterPress}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface ChapterListProps {
  chapters: Array<{ index: number; title: string }>;
  currentChapter: number;
  theme: ReturnType<typeof getTheme>;
  onChapterPress: (index: number) => void;
}

function ChapterList({ chapters, currentChapter, theme, onChapterPress }: ChapterListProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const itemRefs = useRef<(View | null)[]>([]);
  const listStyles = useMemo(() => createChapterListStyles(theme), [theme]);

  useEffect(() => {
    const targetIndex = chapters.findIndex((ch) => ch.index === currentChapter);
    if (targetIndex >= 0 && itemRefs.current[targetIndex]) {
      setTimeout(() => {
        itemRefs.current[targetIndex]?.measureLayout(
          scrollViewRef.current as any,
          (x, y) => {
            scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
          },
          () => {}
        );
      }, 100);
    }
  }, [chapters, currentChapter]);

  return (
    <ScrollView ref={scrollViewRef} style={listStyles.chaptersList}>
      {chapters.map((chapter, index) => {
        const isCurrent = chapter.index === currentChapter;
        const isRead = chapter.index < currentChapter;
        const textColor = isCurrent
          ? theme.colors.text
          : isRead
            ? theme.colors.textSecondary + '80'
            : theme.colors.textSecondary;
        const fontWeight = isCurrent ? '700' : '400';

        return (
          <TouchableOpacity
            key={chapter.index}
            style={[listStyles.chapterItem, { borderBottomColor: theme.colors.border }]}
            onPress={() => onChapterPress(chapter.index)}
          >
            <View
              ref={(ref) => { itemRefs.current[index] = ref; }}
              style={listStyles.chapterItemInner}
            >
              <Text style={[listStyles.chapterNumber, { color: textColor, fontWeight }]}>
                {index + 1}
              </Text>
              <Text style={[listStyles.chapterName, { color: textColor, fontWeight }]} numberOfLines={1}>
                {chapter.title}
              </Text>
              {isCurrent && (
                <Ionicons name="book" size={16} color={theme.colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function createChapterListStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    chaptersList: {
      maxHeight: 400,
    },
    chapterItem: {
      borderBottomWidth: 1,
    },
    chapterItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
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
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
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
    themeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    themeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
    },
    themeChipActive: {
      borderWidth: 2,
    },
    themeChipText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    fontOptionButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },
    fontOptionText: {
      fontSize: fontSizes.sm,
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
      borderBottomWidth: 1,
    },
    chapterItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
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
