// Electron bridge for IPC commands
const getElectron = () => (window as any).electron;
export const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;

// For more robust detection in components
export function checkIsDesktop() {
  return typeof window !== 'undefined' && !!(window as any).electron;
}



const invoke = async <T = any>(channel: string, ...args: any[]): Promise<T> => {
  const electron = getElectron();
  if (electron && electron.invoke) {
    try {
      return await electron.invoke(channel, ...args);
    } catch (error) {
      console.error(`Error invoking channel ${channel}:`, error);
      throw error;
    }
  }
  
  console.warn(`Electron IPC not available for channel: ${channel}. Returning default fallback.`);
  
  // Provide safe defaults for common channels
  if (channel === 'get_books' || channel === 'read_directory') {
    return [] as any as T;
  }
  if (channel === 'load_settings') {
    return {
      theme: 'system',
      fontSize: 16,
      autoPlayTts: false,
      ttsRate: 1.0,
      ttsVolume: 1.0,
      nasPaths: [],
    } as any as T;
  }
  if (channel === 'get_home_directory') {
    return '/' as any as T;
  }
  return null as any as T;
};


const listen = (channel: string, callback: (...args: any[]) => void) => {
  const electron = getElectron();
  if (electron && electron.on) {
    return electron.on(channel, callback);
  }
  return () => {};
};




import { useCallback, useEffect } from 'react';
import { useDesktopStore, type AppSettings, type LocalFile, type TtsState } from '../stores/desktopStore';

// Book interface matching Rust backend
interface Book {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  file_path: string;
  file_type: string;
  reading_progress?: number;
  total_pages?: number;
  current_page?: number;
  added_at: string;
  last_read_at?: string;
}

// ============================================================================
// File System Commands
// ============================================================================

export async function readDirectory(path: string): Promise<LocalFile[]> {
  return invoke<LocalFile[]>('read_directory', { path });
}

export async function readFileContent(filePath: string): Promise<Uint8Array> {
  return invoke<number[]>('read_file_content', { filePath }).then((arr) => new Uint8Array(arr));
}

export async function readFileText(filePath: string): Promise<string> {
  return invoke<string>('read_file_text', { filePath });
}

export async function getHomeDirectory(): Promise<string> {
  return invoke<string>('get_home_directory');
}

export async function getFileMetadata(filePath: string): Promise<LocalFile> {
  return invoke<LocalFile>('get_file_metadata', { filePath });
}

// ============================================================================
// Book Commands
// ============================================================================

export async function getBooks(): Promise<Book[]> {
  return invoke<Book[]>('get_books');
}

export async function addBook(book: Book): Promise<void> {
  return invoke('add_book', { book });
}

export async function updateReadingProgress(
  bookId: string,
  progress: number,
  currentPage?: number
): Promise<void> {
  return invoke('update_reading_progress', { bookId, progress, currentPage });
}

export async function importLocalBook(filePath: string): Promise<Book> {
  return invoke<Book>('import_local_book', { filePath });
}

// ============================================================================
// Window Commands
// ============================================================================

export async function saveWindowState(label: string): Promise<void> {
  return invoke('save_window_state', { label });
}

export async function restoreWindowState(label: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
} | null> {
  return invoke('restore_window_state', { label });
}

export async function openReaderWindow(bookId: string, bookTitle: string): Promise<void> {
  return invoke('open_reader_window', { bookId, bookTitle });
}

export async function minimizeToTray(): Promise<void> {
  return invoke('minimize_to_tray');
}

export async function showMainWindow(): Promise<void> {
  return invoke('show_main_window');
}

// ============================================================================
// TTS Commands
// ============================================================================

export async function updateTtsState(
  isPlaying: boolean,
  isPaused: boolean,
  bookId?: string,
  currentText?: string,
  progress?: number
): Promise<void> {
  return invoke('update_tts_state', {
    isPlaying,
    isPaused,
    bookId: bookId ?? null,
    currentText: currentText ?? null,
    progress: progress ?? 0,
  });
}

export async function getTtsState(): Promise<TtsState> {
  return invoke<TtsState>('get_tts_state');
}

export async function getSystemVoices(): Promise<Array<{
  id: string;
  name: string;
  lang: string;
  local: boolean;
}>> {
  return invoke('get_system_voices');
}

// ============================================================================
// Settings Commands
// ============================================================================

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke('save_settings', { settings });
}

// ============================================================================
// Dialog Commands
// ============================================================================

export async function openFileDialog(): Promise<string | null> {
  return invoke('open_file_dialog');
}

export async function openFolderDialog(): Promise<string | null> {
  return invoke('open_folder_dialog');
}

// ============================================================================
// React Hooks
// ============================================================================

export function useDesktopEvents() {
  const store = useDesktopStore();

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    // Listen for global shortcut events
    unlisteners.push(
      listen('global-shortcut', (payload) => {
        console.log('Global shortcut:', payload);
        if (payload === 'tts-toggle') {
          store.setTtsState({ isPlaying: !store.ttsState.isPlaying });
        } else if (payload === 'tts-next') {
          console.log('TTS next');
        } else if (payload === 'tts-prev') {
          console.log('TTS prev');
        }
      })
    );

    // Listen for file open events
    unlisteners.push(
      listen('open-file', async (payload) => {
        const filePath = payload as string;
        console.log('Opening file:', filePath);
        try {
          const book = await importLocalBook(filePath);
          store.addBook(book as any);
          await addBook(book);
        } catch (error) {
          console.error('Failed to import file:', error);
        }
      })
    );

    // Listen for TTS mode request from tray
    unlisteners.push(
      listen('start-tts-mode', () => {
        store.setIsTtsMode(true);
      })
    );

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}

export function useWindowState(windowLabel: string = 'main') {
  // Restore window state on mount
  useEffect(() => {
    restoreWindowState(windowLabel).catch(console.error);

    // Save window state on unmount
    return () => {
      saveWindowState(windowLabel).catch(console.error);
    };
  }, [windowLabel]);

  // Periodically save window state
  useEffect(() => {
    const interval = setInterval(() => {
      saveWindowState(windowLabel).catch(console.error);
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [windowLabel]);
}

export function useFileBrowser() {
  const { currentPath, setCurrentPath, setFiles, setIsLoadingFiles } = useDesktopStore();

  const loadDirectory = useCallback(
    async (path: string) => {
      setIsLoadingFiles(true);
      try {
        const files = await readDirectory(path);
        setFiles(files);
        setCurrentPath(path);
      } catch (error) {
        console.error('Failed to load directory:', error);
        setFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [setCurrentPath, setFiles, setIsLoadingFiles]
  );

  const openPath = useCallback(
    async (path: string) => {
      await loadDirectory(path);
    },
    [loadDirectory]
  );

  const navigateUp = useCallback(async () => {
    const parent = currentPath.replace(/[/\\][^/\\]+$/, '');
    if (parent && parent !== currentPath) {
      await loadDirectory(parent);
    }
  }, [currentPath, loadDirectory]);

  return {
    loadDirectory,
    openPath,
    navigateUp,
  };
}

export function useTTS() {
  const { ttsState, setTtsState, settings } = useDesktopStore();

  const speak = useCallback(
    async (text: string, bookId?: string) => {
      setTtsState({
        isPlaying: true,
        isPaused: false,
        bookId,
        currentText: text.slice(0, 100),
        progress: 0,
      });

      // Use Web Speech API for TTS
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = settings.ttsRate;
        utterance.volume = settings.ttsVolume;
        utterance.lang = 'zh-CN';

        // Find Chinese voice
        const voices = window.speechSynthesis.getVoices();
        const chineseVoice = voices.find((v) => v.lang.startsWith('zh'));
        if (chineseVoice) {
          utterance.voice = chineseVoice;
        }

        utterance.onend = () => {
          setTtsState({ isPlaying: false, isPaused: false, progress: 100 });
        };

        utterance.onerror = () => {
          setTtsState({ isPlaying: false, isPaused: false });
        };

        window.speechSynthesis.speak(utterance);
      }
    },
    [settings, setTtsState]
  );

  const pause = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setTtsState({ isPlaying: false, isPaused: true });
    }
  }, [setTtsState]);

  const resume = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setTtsState({ isPlaying: true, isPaused: false });
    }
  }, [setTtsState]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTtsState({ isPlaying: false, isPaused: false, progress: 0 });
    }
  }, [setTtsState]);

  const togglePlayPause = useCallback(() => {
    if (ttsState.isPlaying) {
      pause();
    } else if (ttsState.isPaused) {
      resume();
    }
  }, [ttsState, pause, resume]);

  return {
    speak,
    pause,
    resume,
    stop,
    togglePlayPause,
  };
}
