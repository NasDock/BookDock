import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useBookReader } from '../hooks/useBookReader';
import { useReaderStore } from '../stores/themeStore';
import { Button } from '@bookdock/ui';
import type { ReaderMode, ReaderPosition } from '@bookdock/ebook-reader';

const ReaderControls: React.FC<{
  position: ReaderPosition;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  onFontSizeChange: (size: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onGoBack: () => void;
  fontSize: number;
}> = ({ position, mode, onModeChange, onFontSizeChange, onPrevPage, onNextPage, onGoBack, fontSize }) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Top bar */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={onGoBack}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span>←</span>
            <span className="text-sm">返回</span>
          </button>

          <div className="flex items-center gap-4">
            {/* Progress */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {position.currentPage ?? 0}{position.totalPages ? ` / ${position.totalPages}` : ''}
              ({position.percentage}%)
            </span>

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="absolute top-14 right-4 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
            {/* Reading mode */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                阅读模式
              </label>
              <div className="flex gap-2">
                {(['light', 'dark', 'sepia'] as ReaderMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      mode === m
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {m === 'light' ? '☀️' : m === 'dark' ? '🌙' : '📜'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                字体大小: {fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="32"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>A</span>
                <span style={{ fontSize: '16px' }}>A</span>
                <span style={{ fontSize: '20px' }}>A</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-8 py-4">
          <button
            onClick={onPrevPage}
            className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            disabled={position.currentPage === 1}
          >
            ‹
          </button>

          {/* Progress bar */}
          <div className="flex-1 max-w-md mx-4">
            <input
              type="range"
              min="0"
              max="100"
              value={position.percentage}
              readOnly
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
          </div>

          <button
            onClick={onNextPage}
            className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            disabled={position.currentPage === position.totalPages}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);

  const { mode, fontSize, setMode, setFontSize } = useReaderStore();

  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getBook(id);
        
        if (response.success && response.data) {
          setBook(response.data);
        } else {
          setError(response.error || 'Failed to load book');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  const handlePositionChange = useCallback((position: ReaderPosition) => {
    // Position is automatically saved by the useBookReader hook
    console.log('Position changed:', position);
  }, []);

  const {
    containerRef,
    position,
    isLoading: isReaderLoading,
    error: readerError,
    nextPage,
    prevPage,
    goToPosition,
  } = useBookReader({
    book,
    autoSaveInterval: 10000,
    onPositionChange: handlePositionChange,
  });

  const handleGoBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleModeChange = useCallback((newMode: ReaderMode) => {
    setMode(newMode);
  }, [setMode]);

  const handleFontSizeChange = useCallback((newSize: number) => {
    setFontSize(newSize);
  }, [setFontSize]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          prevPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          nextPage();
          break;
        case 'Home':
          goToPosition({ percentage: 0 });
          break;
        case 'End':
          goToPosition({ percentage: 100 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, goToPosition]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载书籍中...</p>
        </div>
      </div>
    );
  }

  if (error || readerError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-6xl mb-4">📕</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || readerError}
          </h2>
          <Button onClick={() => navigate('/')}>返回书库</Button>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">书籍不存在</h2>
          <Button onClick={() => navigate('/')}>返回书库</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-gray-900' : mode === 'sepia' ? 'bg-sepia-100' : 'bg-white'}`}>
      <ReaderControls
        position={position}
        mode={mode}
        onModeChange={handleModeChange}
        onFontSizeChange={handleFontSizeChange}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoBack={handleGoBack}
        fontSize={fontSize}
      />

      {/* Reader container */}
      <div
        ref={containerRef}
        className={`reading-container ${mode} pt-16 pb-20`}
        style={{
          padding: '20px',
          maxWidth: '800px',
          margin: '0 auto',
          minHeight: '100vh',
        }}
      >
        {isReaderLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}
      </div>

      {/* TTS button */}
      <button
        onClick={() => navigate(`/book/${id}/tts`)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="听书模式"
      >
        🔊
      </button>
    </div>
  );
}
