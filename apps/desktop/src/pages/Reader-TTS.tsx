// @ts-nocheck
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useTTS } from '../hooks/useTTS';
import { Button } from '@bookdock/ui';
import { ArrowLeft, Settings, Volume2, FileText, RotateCcw, Square, Pause, Play, SkipBack, SkipForward, BookOpen } from 'lucide-react';

// Text chunk for TTS processing
interface TextChunk {
  id: number;
  text: string;
  startIndex: number;
  endIndex: number;
}

function splitTextIntoChunks(text: string, chunkSize = 500): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentIndex = 0;

  // Split by sentence boundaries
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];

  let currentChunk = '';
  let chunkStart = 0;

  sentences.forEach((sentence) => {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        id: chunks.length,
        text: currentChunk.trim(),
        startIndex: chunkStart,
        endIndex: chunkStart + currentChunk.length,
      });
      chunkStart += currentChunk.length;
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  });

  if (currentChunk.trim()) {
    chunks.push({
      id: chunks.length,
      text: currentChunk.trim(),
      startIndex: chunkStart,
      endIndex: chunkStart + currentChunk.length,
    });
  }

  return chunks;
}


// Playback controls component
function PlaybackControls({
  isPlaying,
  isPaused,
  isLoading,
  progress,
  rate,
  volume,
  onPlayPause,
  onStop,
  onSkipBack,
  onSkipForward,
  onRateChange,
  onVolumeChange,
}: {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  progress: { percentage: number; currentIndex: number; totalChunks: number; currentText: string; isPlaying: boolean };
  rate: number;
  volume: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
          <span>
            {progress.isPlaying || progress.percentage > 0
              ? `段落 ${progress.currentIndex + 1} / ${progress.totalChunks}`
              : '准备就绪'}
          </span>
          <span>{progress.percentage}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Current text */}
      {progress.currentText && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            "{progress.currentText.slice(0, 150)}{progress.currentText.length > 150 ? '...' : ''}"
          </p>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center justify-center gap-4 py-4">
        {/* Skip back 10s */}
        <button
          onClick={onSkipBack}
          className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
          title="后退10秒"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        {/* Stop */}
        <button
          onClick={onStop}
          className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
          title="停止"
        >
          <Square className="w-5 h-5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          disabled={isLoading}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all active:scale-95 ${
            isPlaying
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          } disabled:opacity-50 shadow-lg`}
        >
          {isLoading ? (
            <RotateCcw className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6" />
          )}
        </button>

        {/* Skip forward 10s */}
        <button
          onClick={onSkipForward}
          className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
          title="前进10秒 (→)"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Speed and Volume */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              语速
            </label>
            <span className="text-sm text-blue-500 font-medium">{rate}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => onRateChange(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>慢</span>
            <span>正常</span>
            <span>快</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              音量
            </label>
            <span className="text-sm text-blue-500 font-medium">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

// Main TTS Reader Component
export default function ReaderTTS() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const currentChunkRef = useRef<HTMLParagraphElement | null>(null);
  const prevIsPlayingRef = useRef(false);
  const isUserStoppedRef = useRef(false);
  const skipTimeRef = useRef(10); // seconds

  const {
    isPlaying,
    isPaused,
    isLoading: ttsLoading,
    error: ttsError,
    progress,
    voices,
    currentVoice,
    rate,
    volume,
    speak,
    pause,
    resume,
    stop,
    togglePlayPause,
    setVoice,
    setRate,
    setVolume,
    init,
  } = useTTS({ autoInit: true });

  // Fetch book content via server-parsed chapters (avoids client-side encoding issues)
  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getBook(id);

        if (response.success && response.data) {
          setBook(response.data);

          // Fetch chapters then load content from server-parsed text
          const chaptersRes = await apiClient.getChapters(id);
          if (chaptersRes.success && chaptersRes.data && chaptersRes.data.length > 0) {
            const chapterList = chaptersRes.data;
            const contents = await Promise.all(
              chapterList.map(async (ch) => {
                const contentRes = await apiClient.getChapterContent(id, ch.index);
                return contentRes.success && contentRes.data ? contentRes.data.content : '';
              })
            );
            const fullText = contents.join('\n\n');
            setContent(fullText);
            const textChunks = splitTextIntoChunks(fullText);
            setChunks(textChunks);
          } else {
            setContent('本书暂无章节内容，请先解析章节。');
            setChunks([]);
          }
        } else {
          setError(response.error || '加载书籍失败');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBook();
    init();
  }, [id, init]);

  const handleGoBack = useCallback(() => {
    stop();
    navigate(-1);
  }, [stop, navigate]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (content && chunks.length > 0) {
      if (isPaused) {
        resume();
      } else {
        isUserStoppedRef.current = false;
        const chunkToSpeak = chunks[currentChunkIndex];
        if (chunkToSpeak) {
          speak(chunkToSpeak.text);
        }
      }
    }
  }, [isPlaying, isPaused, content, chunks, currentChunkIndex, speak, pause, resume]);

  const handleStop = useCallback(() => {
    isUserStoppedRef.current = true;
    stop();
    setCurrentChunkIndex(0);
  }, [stop]);

  const handleSkipBack = useCallback(() => {
    if (currentChunkIndex > 0) {
      isUserStoppedRef.current = false;
      setCurrentChunkIndex(currentChunkIndex - 1);
      if (isPlaying) {
        speak(chunks[currentChunkIndex - 1].text);
      }
    }
  }, [currentChunkIndex, chunks, isPlaying, speak]);

  const handleSkipForward = useCallback(() => {
    if (currentChunkIndex < chunks.length - 1) {
      isUserStoppedRef.current = false;
      setCurrentChunkIndex(currentChunkIndex + 1);
      if (isPlaying) {
        speak(chunks[currentChunkIndex + 1].text);
      }
    }
  }, [currentChunkIndex, chunks, isPlaying, speak]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSkipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSkipForward();
          break;
        case 'Escape':
          setShowSettings(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSkipBack, handleSkipForward]);

  // Auto advance to next chunk when current TTS finishes naturally
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;

    if (wasPlaying && !isPlaying && !isPaused && !isUserStoppedRef.current && chunks.length > 0 && currentChunkIndex < chunks.length - 1) {
      const timer = setTimeout(() => {
        if (!isPlaying && !isPaused && !isUserStoppedRef.current) {
          const nextIndex = currentChunkIndex + 1;
          setCurrentChunkIndex(nextIndex);
          const nextChunk = chunks[nextIndex];
          if (nextChunk) {
            speak(nextChunk.text);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, isPaused, currentChunkIndex, chunks, speak]);

  // Scroll current chunk into view when it changes
  useEffect(() => {
    if (currentChunkRef.current && contentRef.current) {
      currentChunkRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentChunkIndex]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载听书内容...</p>
        </div>
      </div>
    );
  }

  if (error || ttsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="mb-4 flex justify-center"><BookOpen className="w-16 h-16 text-red-400" /></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || ttsError}
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
          <div className="mb-4 flex justify-center"><BookOpen className="w-16 h-16 text-gray-400" /></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">书籍不存在</h2>
          <Button onClick={() => navigate('/')}>返回书库</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>

          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            <span className="font-medium text-gray-900 dark:text-white">听书模式</span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Book info panel */}
        <div className="lg:w-80 p-6 bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
          <div className="flex flex-col items-center text-center">
            {/* Book cover */}
            <div className="w-32 h-44 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                  <span className="text-4xl text-white font-bold">{book.title.charAt(0)}</span>
                </div>
              )}
            </div>

            <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{book.title}</h1>
            <p className="text-gray-500 dark:text-gray-400">{book.author || '未知作者'}</p>

            <div className="mt-4 flex gap-2">
              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm uppercase">
                {book.fileType}
              </span>
              {book.language && (
                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
                  {book.language}
                </span>
              )}
            </div>
          </div>

          {/* Settings panel */}
          {showSettings ? (
            <div className="mt-6 space-y-4">
              <h3 className="font-medium text-gray-900 dark:text-white">语音设置</h3>

              {/* Voice selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  语音选择
                </label>
                <select
                  value={currentVoice?.id || ''}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {voices.length === 0 ? (
                    <option value="">加载中...</option>
                  ) : (
                    voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  语速: {rate}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Volume */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  音量: {Math.round(volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <Button variant="secondary" onClick={() => setShowSettings(false)} className="w-full">
                完成
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <PlaybackControls
                isPlaying={isPlaying}
                isPaused={isPaused}
                isLoading={ttsLoading}
                progress={{ ...progress, currentIndex: currentChunkIndex, totalChunks: chunks.length }}
                rate={rate}
                volume={volume}
                onPlayPause={handlePlayPause}
                onStop={handleStop}
                onSkipBack={handleSkipBack}
                onSkipForward={handleSkipForward}
                onRateChange={setRate}
                onVolumeChange={setVolume}
              />
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col">
          {/* Text content */}
          <div
            ref={contentRef}
            className="flex-1 p-6 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 300px)' }}
          >
            <div className="prose dark:prose-invert max-w-none">
              {chunks.length > 0 ? (
                <div className="text-lg leading-relaxed space-y-4">
                  {chunks.map((chunk, idx) => (
                    <p
                      key={chunk.id}
                      ref={idx === currentChunkIndex ? (el) => { currentChunkRef.current = el; } : undefined}
                      className={`transition-colors duration-300 rounded px-2 py-1 ${
                        idx === currentChunkIndex
                          ? 'bg-amber-100/80 dark:bg-amber-900/40 font-medium'
                          : 'opacity-50'
                      }`}
                    >
                      {chunk.text}
                    </p>
                  ))}
                </div>
              ) : content ? (
                <div className="whitespace-pre-wrap text-lg leading-relaxed">
                  {content}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-4" />
                  <p>无法提取文本内容</p>
                </div>
              )}
            </div>
          </div>

          {/* Chapter/Chunk navigation */}
          {chunks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  章节导航
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {currentChunkIndex + 1} / {chunks.length}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {chunks.slice(0, 20).map((chunk, index) => (
                  <button
                    key={chunk.id}
                    onClick={() => {
                      setCurrentChunkIndex(index);
                      if (isPlaying) {
                        speak(chunk.text);
                      }
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded text-xs font-medium transition-colors ${
                      index === currentChunkIndex
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
                {chunks.length > 20 && (
                  <span className="flex-shrink-0 text-xs text-gray-400 self-center">
                    +{chunks.length - 20} 更多
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="bg-gray-100 dark:bg-gray-800/50 p-2 text-center text-xs text-gray-500 dark:text-gray-400">
            空格 播放/暂停 | 左右方向键 跳过章节 | 点击章节按钮跳转
          </div>
        </div>
      </main>
    </div>
  );
}
