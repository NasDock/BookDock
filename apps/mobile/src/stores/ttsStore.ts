import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TTSVoice } from '@bookdock/api-client';

type TTSState = 'idle' | 'playing' | 'paused' | 'loading';

interface TTSStoreState {
  state: TTSState;
  currentBookId: string | null;
  currentPosition: number;
  totalLength: number;
  selectedVoice: TTSVoice | null;
  availableVoices: TTSVoice[];
  playbackRate: number;
  volume: number;
  isAutoPlay: boolean;

  // Actions
  setState: (state: TTSState) => void;
  setCurrentBook: (bookId: string | null, position?: number, totalLength?: number) => void;
  setPosition: (position: number) => void;
  setSelectedVoice: (voice: TTSVoice | null) => void;
  setAvailableVoices: (voices: TTSVoice[]) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  reset: () => void;
}

export const useTTSStore = create<TTSStoreState>()(
  persist(
    (set) => ({
      state: 'idle',
      currentBookId: null,
      currentPosition: 0,
      totalLength: 0,
      selectedVoice: null,
      availableVoices: [],
      playbackRate: 1.0,
      volume: 1.0,
      isAutoPlay: true,

      setState: (state) => set({ state }),
      
      setCurrentBook: (bookId, position = 0, totalLength = 0) => set({
        currentBookId: bookId,
        currentPosition: position,
        totalLength,
        state: bookId ? 'paused' : 'idle',
      }),

      setPosition: (position) => set({ currentPosition: position }),

      setSelectedVoice: (voice) => set({ selectedVoice: voice }),

      setAvailableVoices: (voices) => set({ availableVoices: voices }),

      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      setVolume: (volume) => set({ volume }),

      setAutoPlay: (autoPlay) => set({ isAutoPlay: autoPlay }),

      reset: () => set({
        state: 'idle',
        currentBookId: null,
        currentPosition: 0,
        totalLength: 0,
      }),
    }),
    {
      name: 'bookdock-tts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedVoice: state.selectedVoice,
        playbackRate: state.playbackRate,
        volume: state.volume,
        isAutoPlay: state.isAutoPlay,
      }),
    }
  )
);
