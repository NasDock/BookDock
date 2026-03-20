import React, { useState, useCallback, useRef, useMemo } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReaderStore, useThemeStore, useLibraryStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { sharingService } from '../services';
import type { RootStackParamList } from '../navigation/types';
import type { Book } from '@bookdock/api-client';
import type { ReaderPosition, ReaderMode } from '@bookdock/ebook-reader';

type ReaderRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// HTML template for the reader
function createReaderHTML(
  book: Book,
  config: {
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    margin: number;
    mode: ReaderMode;
  }
): string {
  const bgColors: Record<ReaderMode, string> = {
    light: '#ffffff',
    dark: '#1a1a1a',
    sepia: '#f5ebe0',
  };
  
  const textColors: Record<ReaderMode, string> = {
    light: '#333333',
    dark: '#e0e0e0',
    sepia: '#5c4b37',
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      background-color: ${bgColors[config.mode]};
      color: ${textColors[config.mode]};
      font-family: ${config.fontFamily}, Georgia, serif;
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      padding: ${config.margin}px;
      overflow: hidden;
    }
    #content {
      width: 100%;
      height: 100%;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .page {
      min-height: 100%;
      padding-bottom: 50px;
    }
    h1 { font-size: 1.5em; margin-bottom: 0.5em; }
    h2 { font-size: 1.3em; margin-bottom: 0.5em; }
    p { margin-bottom: 1em; text-align: justify; }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a1a; color: #e0e0e0; }
    }
  </style>
</head>
<body>
  <div id="content">
    <div class="page">
      <h1>${book.title}</h1>
      <p style="font-style: italic; margin-bottom: 2em;">by ${book.author}</p>
      <p>This is a preview of the book content. In a production environment, this would be rendered from the actual EPUB or PDF file using libraries like epub.js or pdf.js.</p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
      <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
      <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
      <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
      <p>Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.</p>
    </div>
  </div>
  <script>
    // Send message to React Native
    function sendMessage(type, data) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
    }
    
    // Track scroll position
    document.getElementById('content').addEventListener('scroll', function() {
      const scrollTop = document.getElementById('content').scrollTop;
      const scrollHeight = document.getElementById('content').scrollHeight - document.getElementById('content').clientHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      sendMessage('progress', { progress, scrollTop });
    });
    
    // Initial load
    sendMessage('ready', { title: document.title });
  </script>
</body>
</html>
`;
}

export function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderRouteProp>();
  const { book } = route.params;
  const { width, height } = useWindowDimensions();
  
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  
  const readerConfig = useReaderStore();
  const { saveReadingProgress, getLocalBookPath } = useLibraryStore();
  
  const [showControls, setShowControls] = useState(true);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const webViewRef = useRef<WebView>(null);

  const styles = useMemo(() => createStyles(theme, showControls), [theme, showControls]);

  const html = useMemo(() => {
    return createReaderHTML(book, {
      fontSize: readerConfig.fontSize,
      fontFamily: readerConfig.fontFamily,
      lineHeight: readerConfig.lineHeight,
      margin: readerConfig.margin,
      mode: readerConfig.mode,
    });
  }, [book, readerConfig]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'progress') {
        setCurrentPosition(message.data.progress);
        if (readerConfig.autoSaveProgress && readerConfig.currentBookId === book.id) {
          saveReadingProgress(book.id, {
            percentage: message.data.progress,
            currentPage: Math.floor((message.data.progress / 100) * totalPages),
            totalPages,
          });
        }
      }
    } catch (e) {
      console.error('Failed to parse WebView message:', e);
    }
  }, [book.id, readerConfig.autoSaveProgress, readerConfig.currentBookId, saveReadingProgress, totalPages]);

  const handleShare = useCallback(async () => {
    await sharingService.shareBook({
      title: book.title,
      author: book.author,
      localPath: getLocalBookPath(book.id) || undefined,
    });
  }, [book, getLocalBookPath]);

  const handleFontSizeChange = useCallback((delta: number) => {
    readerConfig.setFontSize(Math.max(12, Math.min(32, readerConfig.fontSize + delta)));
  }, [readerConfig]);

  const handleModeChange = useCallback((mode: ReaderMode) => {
    readerConfig.setMode(mode);
  }, [readerConfig]);

  const handleWebViewError = useCallback(() => {
    setIsLoading(false);
  }, []);

  const renderSettingsModal = () => (
    <Modal
      visible={showSettings}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSettings(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <Text style={styles.modalTitle}>Reader Settings</Text>
          
          {/* Font Size */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Font Size</Text>
            <View style={styles.fontSizeControls}>
              <TouchableOpacity
                style={styles.fontSizeButton}
                onPress={() => handleFontSizeChange(-2)}
              >
                <Text style={styles.fontSizeButtonText}>A-</Text>
              </TouchableOpacity>
              <Text style={styles.fontSizeValue}>{readerConfig.fontSize}</Text>
              <TouchableOpacity
                style={styles.fontSizeButton}
                onPress={() => handleFontSizeChange(2)}
              >
                <Text style={styles.fontSizeButtonText}>A+</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Reading Mode */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Theme</Text>
            <View style={styles.modeButtons}>
              {(['light', 'dark', 'sepia'] as ReaderMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.modeButton,
                    readerConfig.mode === mode && styles.modeButtonActive,
                  ]}
                  onPress={() => handleModeChange(mode)}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      readerConfig.mode === mode && styles.modeButtonTextActive,
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          {/* Auto-save Progress */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto-save Progress</Text>
            <TouchableOpacity
              style={[
                styles.toggle,
                readerConfig.autoSaveProgress && styles.toggleActive,
              ]}
              onPress={() => readerConfig.setAutoSaveProgress(!readerConfig.autoSaveProgress)}
            >
              <View style={[
                styles.toggleThumb,
                readerConfig.autoSaveProgress && styles.toggleThumbActive,
              ]} />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => setShowSettings(false)}
          >
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.surface}
      />
      
      {/* Header */}
      {showControls && (
        <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{book.title}</Text>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      )}
      
      {/* Reader Content */}
      <View style={styles.readerContainer}>
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={styles.webView}
          onMessage={handleMessage}
          onLoadEnd={() => setIsLoading(false)}
          onError={handleWebViewError}
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={true}
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}
      </View>
      
      {/* Bottom Controls */}
      {showControls && (
        <View style={[styles.bottomControls, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              {Math.round(currentPosition)}%
            </Text>
          </View>
          <View style={styles.controlButtons}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => readerConfig.setMode(readerConfig.mode === 'dark' ? 'light' : 'dark')}
            >
              <Ionicons
                name={actualTheme === 'dark' ? 'sunny' : 'moon'}
                size={24}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {/* Tap zones */}
      <View style={styles.tapZones}>
        <TouchableOpacity
          style={styles.tapZoneLeft}
          onPress={() => webViewRef.current?.injectJavaScript('document.getElementById("content").scrollTop -= 300; true;')}
        />
        <TouchableOpacity
          style={styles.tapZoneCenter}
          onPress={() => setShowControls(!showControls)}
        />
        <TouchableOpacity
          style={styles.tapZoneRight}
          onPress={() => webViewRef.current?.injectJavaScript('document.getElementById("content").scrollTop += 300; true;')}
        />
      </View>
      
      {renderSettingsModal()}
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>, showControls: boolean) {
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
    },
    headerTitle: {
      flex: 1,
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
      marginHorizontal: spacing.sm,
    },
    readerContainer: {
      flex: 1,
    },
    webView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    bottomControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    progressInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    progressText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    controlButtons: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    controlButton: {
      padding: spacing.sm,
    },
    tapZones: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
    },
    tapZoneLeft: {
      flex: 1,
    },
    tapZoneCenter: {
      flex: 2,
    },
    tapZoneRight: {
      flex: 1,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    modalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    settingLabel: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    fontSizeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    fontSizeButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fontSizeButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    fontSizeValue: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      minWidth: 30,
      textAlign: 'center',
    },
    modeButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modeButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.background,
    },
    modeButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    modeButtonText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    modeButtonTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.colors.border,
      padding: 2,
    },
    toggleActive: {
      backgroundColor: theme.colors.primary,
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
    closeButton: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: '#fff',
    },
  });
}
