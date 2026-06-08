// @ts-nocheck
import {
  Book,
  getApiClient,
  Paragraph,
  TtsProgressRecord,
} from "@bookdock/api-client";
import { TTSManager, TTSProgress, TTSState } from "@bookdock/tts";
import { Button } from "@bookdock/ui";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * Reader-TTS — paragraph-level audio reading view.
 *
 *  - Fetches paragraphs via /books/:id/paragraphs?chapter=N
 *  - Plays them sequentially via @bookdock/tts TTSManager
 *  - Highlights the active paragraph + shows a global progress bar
 *  - Clicking the progress bar seeks to the corresponding paragraph
 *  - Persists progress to /tts/progress on pause / seek / exit
 */
export default function ReaderTTS() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [ttsState, setTtsState] = useState<TTSState>("idle");
  const [voices, setVoices] = useState<any[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [progress, setProgress] = useState<TTSProgress>({
    paragraphIndex: 0,
    totalParagraphs: 0,
    paragraphProgress: 0,
    chapterProgress: 0,
    currentText: "",
    isPlaying: false,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const managerRef = useRef<TTSManager | null>(null);
  const bookIdRef = useRef<string | undefined>(undefined);
  const chapterIndexRef = useRef(0);

  // ── Book + chapter fetch ───────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const r = await apiClient.getBook(id);
        if (!r.success || !r.data) {
          setError(r.error || "加载书籍失败");
          return;
        }
        setBook(r.data);
        bookIdRef.current = r.data.id;

        const chRes = await apiClient.getChapters(id);
        if (!chRes.success || !chRes.data || chRes.data.length === 0) {
          setError("本书暂无章节内容，请先解析章节。");
          return;
        }
        const ci = 0;
        setChapterIndex(ci);
        chapterIndexRef.current = ci;
        await loadChapter(apiClient, id, ci);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
    return () => managerRef.current?.stop();
  }, [id]);

  const loadChapter = async (
    apiClient: ReturnType<typeof getApiClient>,
    bookId: string,
    ci: number,
  ) => {
    const r = await apiClient.getChapterParagraphs(bookId, ci);
    if (!r.success || !r.data) {
      setError("加载章节失败");
      return;
    }
    setChapterTitle(r.data.title);
    setParagraphs(r.data.paragraphs);
    paragraphRefs.current = new Array(r.data.paragraphs.length).fill(null);
    setCurrentIndex(0);
    try {
      const p = await apiClient.getTtsProgress(bookId, ci);
      if (p.success && p.data && !Array.isArray(p.data)) {
        const rec = p.data as TtsProgressRecord;
        setCurrentIndex(
          Math.min(rec.paragraphIndex, r.data.paragraphs.length - 1),
        );
      }
    } catch {
      // ignore
    }
  };

  // ── TTS Manager init ──────────────────────────────────────────────────
  useEffect(() => {
    managerRef.current = new TTSManager();
    managerRef.current.initialize("edge").then(() => {
      const v = managerRef.current!.getAvailableVoices();
      setVoices(v);
      if (v[0]) setVoiceId(v[0].id);
    });
  }, []);

  // ── Playback handlers ──────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    const m = managerRef.current;
    if (!m) return;
    if (ttsState === "playing") {
      m.pause();
    } else if (ttsState === "paused") {
      m.resume();
    } else {
      if (!paragraphs.length) return;
      m.setConfig({
        provider: "edge",
        voiceId,
        rate,
        volume,
        bookId: bookIdRef.current,
        chapterIndex: chapterIndexRef.current,
      });
      await m.play(paragraphs, currentIndex, {
        onStart: () => setTtsState("playing"),
        onPause: () => setTtsState("paused"),
        onResume: () => setTtsState("playing"),
        onEnd: () => setTtsState("idle"),
        onError: (e) => {
          setError(e.message);
          setTtsState("error");
        },
        onProgress: (p) => setProgress(p),
        onParagraphChange: (idx) => setCurrentIndex(idx),
      });
    }
  }, [ttsState, paragraphs, currentIndex, voiceId, rate, volume]);

  const handleStop = useCallback(() => {
    managerRef.current?.stop();
    setTtsState("idle");
  }, []);

  const handleSkipBack = useCallback(() => {
    if (currentIndex > 0) managerRef.current?.jumpTo(currentIndex - 1);
  }, [currentIndex]);

  const handleSkipForward = useCallback(() => {
    if (currentIndex < paragraphs.length - 1)
      managerRef.current?.jumpTo(currentIndex + 1);
  }, [currentIndex, paragraphs.length]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    managerRef.current?.seek(ratio);
    setProgress((p) => ({ ...p, chapterProgress: ratio }));
  }, []);

  useEffect(() => {
    const el = paragraphRefs.current[currentIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSkipBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSkipForward();
      } else if (e.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePlayPause, handleSkipBack, handleSkipForward]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载听书内容…</p>
        </div>
      </div>
    );
  }
  if (error || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto px-4">
          <BookOpen className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || "书籍不存在"}
          </h2>
          <Button onClick={() => navigate("/")}>返回书库</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => {
              managerRef.current?.stop();
              navigate(-1);
            }}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            <span className="font-medium text-gray-900 dark:text-white">
              听书模式
            </span>
          </div>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`p-2 rounded-lg ${showSettings ? "bg-blue-100 dark:bg-blue-900 text-blue-600" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100"}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row">
        <div className="lg:w-80 p-6 bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
          <div className="flex flex-col items-center text-center">
            <div className="w-32 h-44 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                  <span className="text-4xl text-white font-bold">
                    {book.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
              {book.title}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {book.author || "未知作者"}
            </p>
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

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
              <span>
                {progress.paragraphIndex + 1} / {progress.totalParagraphs} 段
              </span>
              <span>{Math.round(progress.chapterProgress * 100)}%</span>
            </div>
            <div
              className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer"
              onClick={handleSeek}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.chapterProgress * 100)}
            >
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${progress.chapterProgress * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              点击进度条可跳转到对应段落
            </p>
          </div>

          {showSettings && (
            <div className="mt-6 space-y-4">
              <h3 className="font-medium text-gray-900 dark:text-white">
                语音设置
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  语音
                </label>
                <select
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {voices.length === 0 ? (
                    <option value="">加载中…</option>
                  ) : (
                    voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.language})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  语速: {rate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={rate}
                  onChange={(e) => {
                    const r = parseFloat(e.target.value);
                    setRate(r);
                    managerRef.current?.setRate(r);
                  }}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  音量: {Math.round(volume * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    managerRef.current?.setVolume(v);
                  }}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 py-4">
            <button
              onClick={handleSkipBack}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              title="上一段"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={handleStop}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              title="停止"
            >
              <Square className="w-5 h-5" />
            </button>
            <button
              onClick={handlePlayPause}
              disabled={ttsState === "loading"}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${ttsState === "playing" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"} text-white shadow-lg disabled:opacity-50`}
            >
              {ttsState === "loading" ? (
                <RotateCcw className="w-6 h-6 animate-spin" />
              ) : ttsState === "playing" ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </button>
            <button
              onClick={handleSkipForward}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              title="下一段"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <h2 className="px-6 pt-4 text-lg font-semibold text-gray-900 dark:text-white">
            {chapterTitle}
          </h2>
          <div
            ref={contentRef}
            className="flex-1 p-6 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {paragraphs.length > 0 ? (
              <div className="text-lg leading-relaxed space-y-4">
                {paragraphs.map((p, idx) => (
                  <p
                    key={p.id}
                    ref={(el) => {
                      paragraphRefs.current[idx] = el;
                    }}
                    data-paragraph-id={p.id}
                    className={`transition-colors duration-300 rounded px-2 py-1 ${
                      idx === currentIndex
                        ? "bg-amber-100/80 dark:bg-amber-900/40 font-medium ring-1 ring-amber-300"
                        : "opacity-70"
                    }`}
                    onClick={() => managerRef.current?.jumpTo(idx)}
                  >
                    {p.text}
                  </p>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4" />
                <p>无法提取文本内容</p>
              </div>
            )}
          </div>
          <div className="bg-gray-100 dark:bg-gray-800/50 p-2 text-center text-xs text-gray-500 dark:text-gray-400">
            空格 播放/暂停 | 左右方向键 切换段落 | 点击段落或进度条跳转
          </div>
        </div>
      </main>
    </div>
  );
}
