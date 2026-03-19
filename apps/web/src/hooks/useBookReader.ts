import { useEffect, useRef, useState, useCallback } from 'react';
import { Book, getApiClient } from '@bookdock/api-client';
import { BookRenderer, ReaderPosition, ReaderConfig, createBookReader } from '@bookdock/ebook-reader';
import { useReaderStore } from '../stores/themeStore';

interface UseBookReaderOptions {
  book: Book | null;
  autoSaveInterval?: number; // milliseconds
  onPositionChange?: (position: ReaderPosition) => void;
}

interface UseBookReaderReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  reader: BookRenderer | null;
  position: ReaderPosition;
  isLoading: boolean;
  error: string | null;
  config: ReaderConfig;
  updateConfig: (config: Partial<ReaderConfig>) => void;
  goToPosition: (position: ReaderPosition) => Promise<void>;
  nextPage: () => void;
  prevPage: () => void;
  saveProgress: () => Promise<void>;
  destroy: () => void;
}

export function useBookReader({
  book,
  autoSaveInterval = 30000, // 30 seconds
  onPositionChange,
}: UseBookReaderOptions): UseBookReaderReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<BookRenderer | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [reader, setReader] = useState<BookRenderer | null>(null);
  const [position, setPosition] = useState<ReaderPosition>({ percentage: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = useReaderStore();
  const lastSavePositionRef = useRef<ReaderPosition | null>(null);

  // Initialize reader when book changes
  useEffect(() => {
    if (!book || !containerRef.current) return;

    let mounted = true;

    const initReader = async () => {
      if (!containerRef.current) return;
      
      setIsLoading(true);
      setError(null);

      try {
        // Clean up previous reader
        if (readerRef.current) {
          readerRef.current.destroy();
          readerRef.current = null;
        }

        // Create new reader
        const newReader = await createBookReader(containerRef.current, book, config);
        
        if (!mounted) {
          newReader.destroy();
          return;
        }

        readerRef.current = newReader;
        setReader(newReader);

        // Restore reading position from server
        try {
          const apiClient = getApiClient();
          const progressResponse = await apiClient.getReadingProgress(book.id);
          if (progressResponse.success && progressResponse.data) {
            const savedPosition: ReaderPosition = {
              percentage: progressResponse.data.progress,
              currentPage: progressResponse.data.currentPage,
            };
            await newReader.setPosition(savedPosition);
            setPosition(savedPosition);
            lastSavePositionRef.current = savedPosition;
          }
        } catch {
          // No saved position, start from beginning
        }

        // Listen for position changes
        newReader.onLocationChange((newPosition) => {
          setPosition(newPosition);
          onPositionChange?.(newPosition);
        });

        setPosition(newReader.getPosition());
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError((err as Error).message);
        setIsLoading(false);
      }
    };

    initReader();

    return () => {
      mounted = false;
      if (readerRef.current) {
        readerRef.current.destroy();
        readerRef.current = null;
      }
    };
  }, [book?.id]);

  // Update config when settings change
  useEffect(() => {
    if (readerRef.current && reader) {
      readerRef.current.applyConfig(config);
    }
  }, [config]);

  // Auto-save progress
  useEffect(() => {
    if (autoSaveInterval <= 0) return;

    autoSaveTimerRef.current = setInterval(async () => {
      if (readerRef.current && book && position.percentage !== lastSavePositionRef.current?.percentage) {
        try {
          const apiClient = getApiClient();
          await apiClient.updateReadingProgress(book.id, position.percentage, position.currentPage);
          lastSavePositionRef.current = position;
          console.log('Progress auto-saved:', position.percentage);
        } catch (err) {
          console.error('Failed to auto-save progress:', err);
        }
      }
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [book?.id, position, autoSaveInterval]);

  const updateConfig = useCallback((newConfig: Partial<ReaderConfig>) => {
    Object.entries(newConfig).forEach(([key, value]) => {
      useReaderStore.getState()[key as keyof ReaderConfig] = value as never;
    });
  }, []);

  const goToPosition = useCallback(async (targetPosition: ReaderPosition) => {
    if (readerRef.current) {
      if (targetPosition.cfi) {
        await readerRef.current.goTo(targetPosition.cfi);
      } else if (targetPosition.currentPage && book?.fileType === 'pdf') {
        await readerRef.current.goToPosition?.(targetPosition);
      }
    }
  }, [book?.fileType]);

  const nextPage = useCallback(() => {
    readerRef.current?.nextPage();
  }, []);

  const prevPage = useCallback(() => {
    readerRef.current?.prevPage();
  }, []);

  const saveProgress = useCallback(async () => {
    if (!book || !readerRef.current) return;

    const currentPosition = readerRef.current.getPosition();
    
    try {
      const apiClient = getApiClient();
      await apiClient.updateReadingProgress(
        book.id,
        currentPosition.percentage,
        currentPosition.currentPage
      );
      lastSavePositionRef.current = currentPosition;
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }, [book]);

  const destroy = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.destroy();
      readerRef.current = null;
      setReader(null);
    }
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (readerRef.current && book) {
        const finalPosition = readerRef.current.getPosition();
        try {
          const apiClient = getApiClient();
          apiClient.updateReadingProgress(
            book.id,
            finalPosition.percentage,
            finalPosition.currentPage
          );
        } catch {
          // Ignore errors on unmount
        }
      }
    };
  }, [book]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement | null>,
    reader,
    position,
    isLoading,
    error,
    config,
    updateConfig,
    goToPosition,
    nextPage,
    prevPage,
    saveProgress,
    destroy,
  };
}
