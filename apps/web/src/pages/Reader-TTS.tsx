import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useTTS } from '../hooks/useTTS';
import { Button } from '@bookdock/ui';

export default function ReaderTTS() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  
  const contentRef = useRef<HTMLDivElement>(null);
  
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

  // Fetch book content
  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getBook(id);
        
        if (response.success && response.data) {
          setBook(response.data);
          
          // For TTS, we need to fetch the actual content
          // In a real implementation, this would be extracted text from the book
          // For now, we'll use a placeholder
          const fileBlob = await apiClient.getBookFile(id);
          const text = await extractTextFromBlob(fileBlob, response.data.fileType);
          setContent(text);
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

  // Extract text from book file
  const extractTextFromBlob = async (blob: Blob, fileType: string): Promise<string> => {
    try {
      if (fileType === 'txt') {
        return await blob.text();
      }
      
      // For other formats, we'd need proper parsing
      // For now, return placeholder
      return `这是《${book?.title}》的朗读内容。由于格式限制，当前版本暂不支持自动提取文本内容。
      
      请在设置中选择使用服务器端TTS服务，我们将为您转换为语音。

      服务器TTS支持：
      - 更自然的语音合成
      - 更多语言支持
      - 云端处理，无需本地资源

      您也可以使用浏览器内置的语音朗读功能。`;
    } catch {
      return '无法提取文本内容。';
    }
  };

  const handleGoBack = useCallback(() => {
    stop();
    navigate(-1);
  }, [stop, navigate]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (content) {
      if (isPaused) {
        resume();
      } else {
        speak(content);
      }
    }
  }, [isPlaying, isPaused, pause, resume, speak, content]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const highlightCurrentText = useCallback(() => {
    if (!contentRef.current || !progress.currentText) return;
    
    // Simple text highlighting - in production you'd want more sophisticated handling
    const innerHTML = contentRef.current.innerHTML;
    if (progress.isPlaying && progress.currentText) {
      const regex = new RegExp(`(${progress.currentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g');
      // Only highlight if not already highlighted
      if (!innerHTML.includes('<mark class="highlight')) {
        contentRef.current.innerHTML = innerHTML.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
      }
    }
  }, [progress]);

  useEffect(() => {
    highlightCurrentText();
  }, [progress, highlightCurrentText]);

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
        <div className="text-center">
          <div className="text-6xl mb-4">📕</div>
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
          <div className="text-6xl mb-4">📭</div>
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
            <span>←</span>
            <span className="text-sm">返回</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg">🔊</span>
            <span className="font-medium text-gray-900 dark:text-white">听书模式</span>
          </div>

          <div className="w-20"></div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Book info panel */}
        <div className="lg:w-80 p-6 bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
          <div className="flex flex-col items-center text-center">
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
              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
                {book.fileType.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Voice selection */}
          <div className="mt-6">
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

          {/* Speed control */}
          <div className="mt-4">
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
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.5x</span>
              <span>1x</span>
              <span>2x</span>
            </div>
          </div>

          {/* Volume control */}
          <div className="mt-4">
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
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col">
          {/* Text content */}
          <div 
            ref={contentRef}
            className="flex-1 p-6 overflow-y-auto prose dark:prose-invert max-w-none"
            style={{ maxHeight: 'calc(100vh - 300px)' }}
          >
            <div className="whitespace-pre-wrap text-lg leading-relaxed">
              {content || '无法提取文本内容'}
            </div>
          </div>

          {/* Playback controls */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
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
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>

            {/* Current text */}
            {progress.currentText && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300 italic">
                  "{progress.currentText.slice(0, 100)}{progress.currentText.length > 100 ? '...' : ''}"
                </p>
              </div>
            )}

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleStop}
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="停止"
              >
                ⏹
              </button>

              <button
                onClick={() => {
                  // Skip back 10 seconds
                }}
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="后退10秒"
              >
                ⏪
              </button>

              <button
                onClick={handlePlayPause}
                disabled={ttsLoading}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all ${
                  isPlaying
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } disabled:opacity-50`}
              >
                {ttsLoading ? (
                  <div className="animate-spin">⟳</div>
                ) : isPlaying ? (
                  '⏸'
                ) : (
                  '▶'
                )}
              </button>

              <button
                onClick={() => {
                  // Skip forward 10 seconds
                }}
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="前进10秒"
              >
                ⏩
              </button>

              <button
                onClick={togglePlayPause}
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="播放/暂停"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
