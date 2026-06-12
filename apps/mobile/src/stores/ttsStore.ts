import type { Book, Paragraph, TTSVoice } from '@bookdock/api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TTSState = 'idle' | 'playing' | 'paused' | 'loading';
type ViewMode = 'controls' | 'content';

interface TTSStoreState {
  state: TTSState;
  currentBookId: string | null;
  currentBook: Book | null;
  currentPosition: number;
  totalLength: number;
  selectedProvider: string | null;
  selectedVoice: TTSVoice | null;
  availableVoices: TTSVoice[];
  playbackRate: number;
  volume: number;
  isAutoPlay: boolean;

  // View mode
  viewMode: ViewMode;
  // Mini player
  isMiniPlayerVisible: boolean;
  // Paragraph tracking
  currentParagraph: number;
  totalParagraphs: number;
  paragraphs: Paragraph[];
  chapterTitle: string;
  chapterIndex: number;

  // Actions
  setState: (state: TTSState) => void;
  setCurrentBook: (bookId: string | null, position?: number, totalLength?: number) => void;
  setCurrentBookData: (book: Book) => void;
  setPosition: (position: number) => void;
  setSelectedProvider: (provider: string) => void;
  setSelectedVoice: (voice: TTSVoice | null) => void;
  setAvailableVoices: (voices: TTSVoice[]) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setMiniPlayerVisible: (visible: boolean) => void;
  setCurrentParagraph: (index: number) => void;
  setTotalParagraphs: (count: number) => void;
  setParagraphs: (paragraphs: Paragraph[]) => void;
  setChapterTitle: (title: string) => void;
  setChapterIndex: (index: number) => void;
  reset: () => void;
}

export const useTTSStore = create<TTSStoreState>()(
  persist(
    (set) => ({
      state: 'idle',
      currentBookId: null,
      currentBook: null,
      currentPosition: 0,
      totalLength: 0,
      selectedProvider: null,
      selectedVoice: null,
      availableVoices: [],
      playbackRate: 1.0,
      volume: 1.0,
      isAutoPlay: true,
      viewMode: 'controls',
      isMiniPlayerVisible: false,
      currentParagraph: 0,
      totalParagraphs: 0,
      paragraphs: [],
      chapterTitle: '',
      chapterIndex: 0,

      setState: (state) => set({ state }),

      setCurrentBook: (bookId, position = 0, totalLength = 0) => set({
        currentBookId: bookId,
        currentPosition: position,
        totalLength,
      }),

      setCurrentBookData: (book) => set({ currentBook: book }),

      setPosition: (position) => set({ currentPosition: position }),

      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      setSelectedVoice: (voice) => set({ selectedVoice: voice }),

      setAvailableVoices: (voices) => set({ availableVoices: voices }),

      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      setVolume: (volume) => set({ volume }),

      setAutoPlay: (autoPlay) => set({ isAutoPlay: autoPlay }),

      setViewMode: (mode) => set({ viewMode: mode }),

      setMiniPlayerVisible: (visible) => set({ isMiniPlayerVisible: visible }),

      setCurrentParagraph: (index) => set({ currentParagraph: index }),

      setTotalParagraphs: (count) => set({ totalParagraphs: count }),

      setParagraphs: (paragraphs) => set({ paragraphs }),

      setChapterTitle: (title) => set({ chapterTitle: title }),

      setChapterIndex: (index) => set({ chapterIndex: index }),

      reset: () => set({
        state: 'idle',
        currentBookId: null,
        currentBook: null,
        currentPosition: 0,
        totalLength: 0,
        currentParagraph: 0,
        totalParagraphs: 0,
        paragraphs: [],
        chapterTitle: '',
        chapterIndex: 0,
        isMiniPlayerVisible: false,
        viewMode: 'controls',
      }),
    }),
    {
      name: 'bookdock-tts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedVoice: state.selectedVoice,
        playbackRate: state.playbackRate,
        volume: state.volume,
        isAutoPlay: state.isAutoPlay,
      }),
    }
  )
);
