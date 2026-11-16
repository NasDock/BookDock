/**
 * Reader-TTS — paragraph-level audio reading view.
 *
 *  - Loads paragraphs via /books/:id/paragraphs?chapter=N
 *  - Plays them sequentially through @bookdock/tts TTSManager
 *  - Highlights the active paragraph in real time
 *  - Click any paragraph → jump there; click the progress bar → seek
 *  - Settings (provider / voice / rate / volume) can be overridden
 *    locally for this page; defaults are pulled from localStorage
 *    (set by the Settings page).
 *  - Persists reading position to /tts/progress on pause / seek / exit
 */
import {
  Book,
  getApiClient,
  Paragraph,
  TtsProgressRecord,
} from "@bookdock/api-client";
import {
  TTSManager,
  TTSOverrides,
  TTSProgress,
  TTSProvider,
  TTSState,
  TTSVoice,
} from "@bookdock/tts";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getCoverImageUrl } from "../utils/network";

function BookCover({
  book,
  className = "",
}: {
  book: Book;
  className?: string;
}) {
  const [coverError, setCoverError] = useState(false);
  const coverSrc = getCoverImageUrl(book.coverUrl);
  return (
    <div
      className={`bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg ${className}`}
    >
      {coverSrc && !coverError ? (
        <img
          src={coverSrc}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={() => setCoverError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
          <span className="text-4xl text-white font-bold">
            {book.title.charAt(0)}
          </span>
        </div>
      )}
    </div>
  );
}

const TTS_CONFIG_KEY = "bookdock-tts-config";
const TTS_LANG_KEY = "bookdock-tts-language";

interface StoredTtsConfig {
  provider?: string;
  voiceId?: string;
  rate?: number;
  volume?: number;
}

function loadStoredConfig(): StoredTtsConfig {
  try {
    const raw = localStorage.getItem(TTS_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export default function ReaderTTS() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── Book + chapter state ─────────────────────────────────────────────
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Transient, dismissible error banner. Cleared automatically 4s
   *  after it appears. Use `showError(msg)` to set. */
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0); // bump to retrigger timer
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<{ title: string; index: number }[]>(
    [],
  );
  /** ms offset within the saved paragraph to resume at. Set by
   *  loadChapter() from the server-side progress record; consumed by
   *  handlePlayPause() the next time the user hits Play. */
  const [resumeOffsetMs, setResumeOffsetMs] = useState(0);

  // ── TTS state ────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [language, setLanguage] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(TTS_LANG_KEY) || undefined;
    } catch {
      return undefined;
    }
  });

  const stored = useMemo(loadStoredConfig, []);
  const [provider, setProvider] = useState<string>(stored.provider || "edge");
  const [voiceId, setVoiceId] = useState<string>(stored.voiceId || "");
  const [rate, setRate] = useState<number>(stored.rate || 1.0);
  const [volume, setVolume] = useState<number>(
    stored.volume !== undefined ? stored.volume : 1.0,
  );

  const [state, setState] = useState<TTSState>("idle");
  const [progress, setProgress] = useState<TTSProgress>({
    paragraphIndex: 0,
    totalParagraphs: 0,
    paragraphProgress: 0,
    chapterProgress: 0,
    currentText: "",
    isPlaying: false,
  });
  const [showChapterPanel, setShowChapterPanel] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const [voicesLoading, setVoicesLoading] = useState(false);
  // Sleep timer: minutes remaining, or 0 = off
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0); // seconds
  // Panel state: open the picker without starting the timer
  const [showSleepPanel, setShowSleepPanel] = useState(false);
  const [pendingSleepMinutes, setPendingSleepMinutes] = useState<
    number | "custom"
  >("custom");
  const [customSleepInput, setCustomSleepInput] = useState("");

  const managerRef = useRef<TTSManager | null>(null);
  if (!managerRef.current) managerRef.current = new TTSManager();
  const manager = managerRef.current;

  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const bookIdRef = useRef<string | undefined>(undefined);
  const chapterIndexRef = useRef(0);
  const paragraphsRef = useRef<Paragraph[]>([]);
  const chaptersRef = useRef<{ title: string; index: number }[]>([]);

  // ── Load providers on mount ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const ps = await manager.loadProviders();
      setProviders(ps);
      // If the stored provider isn't in the list, fall back to first enabled.
      const enabledNames = ps.filter((p) => p.enabled).map((p) => p.name);
      if (!enabledNames.includes(provider) && enabledNames.length > 0) {
        setProvider(enabledNames[0]);
      }
    })();
    return () => {
      void manager.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager]);

  // ── Load voices when provider or language changes ────────────────────
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    (async () => {
      setVoicesLoading(true);
      try {
        const vs = await manager.loadVoices(provider, language);
        if (cancelled) return;
        setVoices(vs);
        // If current voiceId isn't in the new list, reset to the first
        if (voiceId && !vs.find((v) => v.id === voiceId)) {
          setVoiceId(vs[0]?.id || "");
        } else if (!voiceId && vs[0]) {
          setVoiceId(vs[0].id);
        }
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, provider, language]);

  // ── Sync config into manager so it persists for subsequent calls ─────
  useEffect(() => {
    manager.setConfig({
      provider,
      voiceId,
      rate,
      volume,
      bookId: book?.id || bookIdRef.current,
      chapterIndex: chapterIndexRef.current,
    });
    // Live rate/volume adjustments while audio is playing
    if (manager.getState() === "playing" || manager.getState() === "paused") {
      manager.setRate(rate);
      manager.setVolume(volume);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, provider, voiceId, rate, volume, book?.id]);

  // ── Flush progress when the page is closed or refreshed ─────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      void manager.stop();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [manager]);

  // ── Book + chapter fetch ─────────────────────────────────────────────
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
        setChapters(chRes.data);
        chaptersRef.current = chRes.data;
        // Chapter index resolution, in priority order:
        //   1. ?ci=N in the URL  (deep-link / "继续听书" button target)
        //   2. GET /books/:id/last-read  (global "last listened" pointer)
        //   3. GET /tts/progress?bookId=... — most recently updated row
        //      across all chapters (legacy fallback, kept for users with
        //      old per-chapter progress but no BookLastRead row yet)
        //   4. 0
        let ci = 0;
        const ciParam = searchParams.get("ci");
        console.log("[Reader-TTS] URL ciParam:", ciParam);
        if (ciParam !== null) {
          const parsed = parseInt(ciParam, 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            ci = parsed;
          }
        } else {
          try {
            const lastRes = await apiClient.getBookLastRead(id);
            console.log("[Reader-TTS] getBookLastRead res:", lastRes);
            if (lastRes.success && lastRes.data) {
              ci = lastRes.data.chapterIndex;
            } else {
              const allRes = await apiClient.getTtsProgress(id);
              if (
                allRes.success &&
                Array.isArray(allRes.data) &&
                allRes.data.length > 0
              ) {
                const latest = [...allRes.data].sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
                )[0];
                ci = latest.chapterIndex;
              }
            }
          } catch (e) {
            console.error("[Reader-TTS] getBookLastRead error:", e);
          }
        }
        console.log(
          "[Reader-TTS] resolved ci:",
          ci,
          "chapters:",
          chRes.data.length,
        );
        ci = Math.max(0, Math.min(ci, chRes.data.length - 1));
        console.log("[Reader-TTS] clamped ci:", ci);
        // skipEmpty: true on initial open so EPUBs that start with a
        // cover/copyright page silently advance to the first chapter
        // with readable text. User-driven navigation later
        // (chapter picker, deep-link, queue-end auto-advance) keeps
        // its original ci.
        await loadChapter(apiClient, id, ci, { skipEmpty: true });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadChapter = async (
    apiClient: ReturnType<typeof getApiClient>,
    bookId: string,
    ci: number,
    options: { skipEmpty?: boolean } = {},
  ) => {
    setChapterIndex(ci);
    chapterIndexRef.current = ci;
    manager.setConfig({ chapterIndex: ci });
    let r = await apiClient.getChapterParagraphs(bookId, ci);
    let effectiveCi = ci;
    // Some EPUBs open with cover/copyright/TOC pages that contain no
    // readable text. When the user hasn't explicitly asked for that
    // chapter (deep-link or manual selection), silently advance to the
    // next chapter that actually has paragraphs so the TTS screen
    // doesn't fall into its empty-state UI. User-initiated navigation
    // (URL ?ci=N, chapter picker, queue end) is still honoured verbatim.
    if (
      options.skipEmpty &&
      (!r.success || !r.data || r.data.paragraphs.length === 0) &&
      chaptersRef.current.length > 1
    ) {
      for (let i = ci + 1; i < chaptersRef.current.length; i++) {
        const tryRes = await apiClient.getChapterParagraphs(bookId, i);
        if (
          tryRes.success &&
          tryRes.data &&
          tryRes.data.paragraphs.length > 0
        ) {
          console.log(
            `[Reader-TTS] Chapter ${ci} has no readable text; auto-advancing to ${i}`,
          );
          effectiveCi = i;
          setChapterIndex(i);
          chapterIndexRef.current = i;
          manager.setConfig({ chapterIndex: i });
          r = tryRes;
          break;
        }
      }
    }
    if (!r.success || !r.data) {
      showError(r.error || "加载章节失败");
      return;
    }
    setChapterTitle(r.data.title);
    setParagraphs(r.data.paragraphs);
    paragraphsRef.current = r.data.paragraphs;
    paragraphRefs.current = new Array(r.data.paragraphs.length).fill(null);

    // Default reset values for the chapter (used when no saved progress
    // exists). We'll either commit these or overwrite paragraphIndex
    // with the cloud-saved value below — in a single setProgress call
    // so the two updates can't be merged away by React.
    let resumeParaIdx = 0;
    let resumeOffset = 0;

    // Resume from saved cloud progress (cross-device sync)
    try {
      const p = await apiClient.getTtsProgress(bookId, effectiveCi);
      if (p.success && p.data && !Array.isArray(p.data)) {
        const rec = p.data as TtsProgressRecord;
        // Apply the saved voice/provider into the manager IMMEDIATELY
        // (don't wait for the React effect on the next render) so the
        // very first play() after load uses the right voice. Otherwise
        // play() reads cfg.voiceId which still holds the *previous*
        // session's value, and the new voice doesn't take effect until
        // the user manually reselects.
        if (rec.provider) manager.setProvider(rec.provider);
        if (rec.voice) manager.setVoice(rec.voice);
        if (rec.provider) {
          setProvider(rec.provider);
          // Re-fetch the voice list under the right provider, then
          // re-apply the saved voice id once voices arrive.
          const vs = await manager.loadVoices(rec.provider);
          setVoices(vs);
          if (rec.voice) setVoiceId(rec.voice);
        }
        // Clamp saved paragraph index against the freshly loaded chapter
        // (chapter length may have changed since the progress was saved).
        resumeParaIdx = Math.max(
          0,
          Math.min(rec.paragraphIndex, r.data!.paragraphs.length - 1),
        );
        resumeOffset = Math.max(0, rec.audioOffsetMs || 0);
      }
    } catch {
      /* fall back to defaults */
    }

    setProgress({
      paragraphIndex: resumeParaIdx,
      totalParagraphs: r.data!.paragraphs.length,
      paragraphProgress: 0,
      chapterProgress: resumeParaIdx / Math.max(1, r.data!.paragraphs.length),
      currentText: "",
      isPlaying: false,
    });
    setResumeOffsetMs(resumeOffset);
  };

  // ── Playback handlers ────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!paragraphs.length) return;
    if (state === "playing") {
      manager.pause();
      return;
    }
    if (state === "paused") {
      manager.resume();
      return;
    }
    // idle / error → start. The first time after loading a chapter
    // with saved progress, resumeOffsetMs holds the byte offset within
    // the saved paragraph so playback picks up mid-sentence.
    //
    // IMPORTANT: read provider/voiceId/rate/volume from the manager
    // (not from useState) — loadChapter() may have just updated
    // manager.cfg via setProvider()/setVoice() before this useState
    // batch has flushed, in which case React would hand us the
    // previous session's voice here and re-cache stale audio.
    const cfg = manager.getConfig();
    const overrides: TTSOverrides = {
      provider: cfg.provider,
      voiceId: cfg.voiceId,
      rate: cfg.rate,
      volume: cfg.volume,
    };
    const offsetMs = resumeOffsetMs;
    setResumeOffsetMs(0);
    await manager.play(
      paragraphs,
      progress.paragraphIndex,
      {
        onStart: () => setState("playing"),
        onPause: () => setState("paused"),
        onResume: () => setState("playing"),
        onEnd: async () => {
          setState("idle");
          // Auto-advance to next chapter when current chapter ends
          const nextChapterIndex = chapterIndexRef.current + 1;
          if (nextChapterIndex < chaptersRef.current.length) {
            const apiClient = getApiClient();
            await loadChapter(apiClient, bookIdRef.current!, nextChapterIndex);
            // Update URL to reflect new chapter
            navigate(`/book/${bookIdRef.current}/tts?ci=${nextChapterIndex}`, {
              replace: true,
            });
            // Wait for state to settle then start playing with fresh paragraphs
            setTimeout(() => {
              const cfg = manager.getConfig();
              const freshOverrides = {
                provider: cfg.provider,
                voiceId: cfg.voiceId,
                rate: cfg.rate,
                volume: cfg.volume,
              };
              manager
                .play(
                  paragraphsRef.current,
                  0,
                  {
                    onStart: () => setState("playing"),
                    onPause: () => setState("paused"),
                    onResume: () => setState("playing"),
                    onEnd: () => setState("idle"),
                    onError: (e) => {
                      showError(e.message || "朗读失败");
                      setState("error");
                    },
                    onProgress: (p) => setProgress(p),
                    onParagraphChange: (idx) =>
                      setProgress((prev) => ({ ...prev, paragraphIndex: idx })),
                  },
                  freshOverrides,
                  0,
                )
                .catch((e) =>
                  console.error("Auto-play next chapter failed", e),
                );
            }, 800);
          }
        },
        onError: (e) => {
          showError(e.message || "朗读失败");
          setState("error");
        },
        onProgress: (p) => setProgress(p),
        onParagraphChange: (idx) =>
          setProgress((prev) => ({ ...prev, paragraphIndex: idx })),
      },
      overrides,
      offsetMs,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    manager,
    paragraphs,
    progress.paragraphIndex,
    state,
    provider,
    voiceId,
    rate,
    volume,
    resumeOffsetMs,
  ]);

  const handleSkipBack = useCallback(() => {
    if (progress.paragraphIndex > 0) {
      manager.jumpTo(progress.paragraphIndex - 1);
    }
  }, [manager, progress.paragraphIndex]);

  const handleSkipForward = useCallback(() => {
    if (progress.paragraphIndex < paragraphs.length - 1) {
      manager.jumpTo(progress.paragraphIndex + 1);
    }
  }, [manager, progress.paragraphIndex, paragraphs.length]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      manager.seek(ratio);
    },
    [manager],
  );

  const handleChapterChange = useCallback(
    async (ci: number) => {
      if (ci === chapterIndex) return;
      await manager.stop();
      setState("idle");
      const apiClient = getApiClient();
      await loadChapter(apiClient, bookIdRef.current!, ci);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterIndex, manager],
  );

  // ── Persist settings to localStorage on change ──────────────────────
  useEffect(() => {
    const cfg: StoredTtsConfig = { provider, voiceId, rate, volume };
    try {
      localStorage.setItem(TTS_CONFIG_KEY, JSON.stringify(cfg));
    } catch {
      /* ignore */
    }
  }, [provider, voiceId, rate, volume]);

  useEffect(() => {
    try {
      if (language) localStorage.setItem(TTS_LANG_KEY, language);
    } catch {
      /* ignore */
    }
  }, [language]);

  // ── Scroll active paragraph into view ───────────────────────────────
  useEffect(() => {
    const el = paragraphRefs.current[progress.paragraphIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [progress.paragraphIndex]);

  // ── Error banner auto-dismiss ────────────────────────────────────────
  useEffect(() => {
    if (!error || errorNonce === 0) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, errorNonce]);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setErrorNonce((n) => n + 1);
  }, []);

  // ── Sleep timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (sleepMinutes <= 0) {
      setSleepRemaining(0);
      return;
    }
    setSleepRemaining(sleepMinutes * 60);
    const interval = setInterval(() => {
      setSleepRemaining((s) => {
        if (s <= 1) {
          // Time's up — pause playback
          manager.pause();
          setSleepMinutes(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepMinutes, manager]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
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
      } else if (e.key === "Escape") {
        if (showChapterPanel) setShowChapterPanel(false);
        else if (showSleepPanel) setShowSleepPanel(false);
        else if (showTtsSettings) setShowTtsSettings(false);
        else if (showSpeedMenu) setShowSpeedMenu(false);
        else if (sleepMinutes > 0) setSleepMinutes(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handlePlayPause,
    handleSkipBack,
    handleSkipForward,
    showChapterPanel,
    showTtsSettings,
    showSpeedMenu,
    showSleepPanel,
    sleepMinutes,
  ]);

  // ── Render ───────────────────────────────────────────────────────────
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
          <button
            onClick={() => navigate("/library")}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            返回书库
          </button>
        </div>
      </div>
    );
  }

  const providerLabel = (name: string) => {
    if (name === "edge") return "Microsoft Edge TTS";
    if (name === "mi") return "小米 TTS";
    return name;
  };

  const formatSleepRemaining = () => {
    const m = Math.floor(sleepRemaining / 60);
    const s = sleepRemaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const formatSleepShort = () => {
    const m = Math.floor(sleepRemaining / 60);
    return m >= 1 ? `${m}m` : `${sleepRemaining}s`;
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="lg:w-96 bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
          {/* Sidebar header: back button + chapter title */}
          <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center px-4 h-14">
              <button
                onClick={async () => {
                  const offsetMs = manager.getCurrentOffsetMs();
                  console.log("[Reader-TTS] back clicked", {
                    bookId: book?.id,
                    chapterIndex: chapterIndexRef.current,
                    paragraphIndex: progress.paragraphIndex,
                    offsetMs,
                  });
                  await manager.stop();
                  // Ensure the global last-read pointer is flushed even if
                  // the manager's internal config lacked a bookId.
                  if (book?.id) {
                    const apiClient = getApiClient();
                    console.log("[Reader-TTS] sending saveBookLastRead", {
                      bookId: book.id,
                      chapterIndex: chapterIndexRef.current,
                      paragraphIndex: progress.paragraphIndex,
                      audioOffsetMs: offsetMs,
                    });
                    void apiClient
                      .saveBookLastRead({
                        bookId: book.id,
                        chapterIndex: chapterIndexRef.current,
                        paragraphIndex: progress.paragraphIndex,
                        audioOffsetMs: offsetMs,
                      })
                      .then((r) =>
                        console.log("[Reader-TTS] saveBookLastRead result", r),
                      )
                      .catch((e) =>
                        console.error("[Reader-TTS] saveBookLastRead error", e),
                      );
                  } else {
                    console.warn("[Reader-TTS] no book.id, skipping last-read");
                  }
                  navigate(-1);
                }}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">返回</span>
              </button>
              <div className="flex-1" />
            </div>
            {error && (
              <div
                role="alert"
                className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-700 dark:text-red-300"
              >
                <span className="flex-1 break-words">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="shrink-0 text-red-500 hover:text-red-700"
                  aria-label="关闭提示"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Book info */}
            <div className="flex flex-col items-center text-center">
              <BookCover book={book} className="w-32 h-44" />
              <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                {book.title}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {book.author || "未知作者"}
              </p>
              <p
                className="mt-2 text-sm text-gray-500 dark:text-gray-400 truncate max-w-full"
                title={chapterTitle || "未加载"}
              >
                {chapterTitle || "加载中…"}
              </p>
            </div>

            {/* (TTS settings moved to the ⚙ popover in the control bar) */}

            {/* Progress bar */}
            <div>
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
                点击进度条或段落即可跳转
              </p>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
              {/* TTS settings popover (provider / voice / language) */}
              <div className="relative">
                <button
                  onClick={() => setShowTtsSettings((v) => !v)}
                  className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  title="TTS 设置"
                  aria-label="TTS 设置"
                >
                  <Settings className="w-4 h-4" />
                </button>
                {showTtsSettings && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowTtsSettings(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg w-72 p-3 space-y-2 text-left">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        朗读设置
                      </p>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          语言筛选
                        </label>
                        <select
                          value={language || ""}
                          onChange={(e) =>
                            setLanguage(e.target.value || undefined)
                          }
                          className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="">全部</option>
                          <option value="zh">中文</option>
                          <option value="en">英语</option>
                          <option value="ja">日语</option>
                          <option value="ko">韩语</option>
                          <option value="fr">法语</option>
                          <option value="de">德语</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          服务商
                        </label>
                        <select
                          value={provider}
                          onChange={(e) => setProvider(e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          {providers.length === 0 ? (
                            <option value={provider}>
                              {providerLabel(provider)}
                            </option>
                          ) : (
                            providers.map((p) => (
                              <option
                                key={p.name}
                                value={p.name}
                                disabled={!p.enabled}
                              >
                                {providerLabel(p.name)}
                                {p.status === "needs_config" ? " *" : ""}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          语音
                        </label>
                        <select
                          value={voiceId}
                          onChange={(e) => setVoiceId(e.target.value)}
                          disabled={voicesLoading}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="">默认</option>
                          {voices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.language || v.lang || ""})
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
                        仅对当前听书生效，不影响全局默认。
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Speed picker (icon only, dropdown shows current rate) */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu((v) => !v)}
                  className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 relative"
                  title={`倍速 ${rate.toFixed(1)}x`}
                  aria-label="倍速"
                >
                  <Gauge className="w-4 h-4" />
                  {rate !== 1.0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] leading-none rounded-full px-1 py-0.5 font-semibold">
                      {rate.toFixed(1)}x
                    </span>
                  )}
                </button>
                {showSpeedMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSpeedMenu(false)}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden min-w-[80px]">
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setRate(r);
                            setShowSpeedMenu(false);
                          }}
                          className={`block w-full px-4 py-1.5 text-sm text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            rate === r
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-semibold"
                              : ""
                          }`}
                        >
                          {r.toFixed(1)}x
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleSkipBack}
                className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                title="上一段"
                aria-label="上一段"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={handlePlayPause}
                disabled={state === "loading"}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
                  state === "playing"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-blue-500 hover:bg-blue-600"
                } text-white shadow-lg disabled:opacity-50`}
                title={state === "playing" ? "暂停" : "播放"}
                aria-label={state === "playing" ? "暂停" : "播放"}
              >
                {state === "loading" ? (
                  <RotateCcw className="w-5 h-5 animate-spin" />
                ) : state === "playing" ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={handleSkipForward}
                className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                title="下一段"
                aria-label="下一段"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Chapter picker */}
              <button
                onClick={() => setShowChapterPanel(true)}
                className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                title="章节"
                aria-label="章节"
                disabled={chapters.length === 0}
              >
                <BookOpen className="w-4 h-4" />
              </button>

              {/* Sleep timer */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSleepPanel(true);
                    setPendingSleepMinutes(
                      sleepMinutes > 0 ? sleepMinutes : "custom",
                    );
                    setCustomSleepInput(
                      sleepMinutes > 0 ? String(sleepMinutes) : "",
                    );
                  }}
                  className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 relative"
                  title={
                    sleepMinutes > 0
                      ? `定时关闭 ${formatSleepRemaining()}`
                      : "定时关闭"
                  }
                  aria-label="定时关闭"
                >
                  <Clock className="w-4 h-4" />
                  {sleepMinutes > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] leading-none rounded-full px-1 py-0.5 font-semibold">
                      {formatSleepShort()}
                    </span>
                  )}
                </button>
                {showSleepPanel && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSleepPanel(false)}
                    />
                    <div className="absolute bottom-full right-0 mb-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 w-64 text-left space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        定时关闭
                      </p>
                      {sleepMinutes > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          当前: {formatSleepRemaining()} 后停止
                        </p>
                      )}

                      {/* Quick presets */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {[30, 60, 120].map((m) => (
                          <button
                            key={m}
                            onClick={() => {
                              setPendingSleepMinutes(m);
                              setCustomSleepInput("");
                            }}
                            className={`px-2 py-1.5 rounded text-sm font-medium border transition-colors ${
                              pendingSleepMinutes === m
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400"
                            }`}
                          >
                            {m < 60 ? `${m}分` : `${m / 60}小时`}
                          </button>
                        ))}
                      </div>

                      {/* Custom input */}
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          自定义（分钟）
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={
                            pendingSleepMinutes === "custom"
                              ? customSleepInput
                              : ""
                          }
                          onFocus={() => {
                            if (pendingSleepMinutes !== "custom") {
                              setPendingSleepMinutes("custom");
                              setCustomSleepInput("");
                            }
                          }}
                          onChange={(e) => {
                            setPendingSleepMinutes("custom");
                            setCustomSleepInput(e.target.value);
                          }}
                          placeholder="例如 45"
                          className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={() => {
                            const mins =
                              pendingSleepMinutes === "custom"
                                ? parseInt(customSleepInput, 10)
                                : pendingSleepMinutes;
                            if (!mins || mins <= 0) return;
                            setSleepMinutes(mins);
                            setShowSleepPanel(false);
                          }}
                          className="flex-1 px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium"
                        >
                          确定
                        </button>
                        {sleepMinutes > 0 && (
                          <button
                            onClick={() => {
                              setSleepMinutes(0);
                              setShowSleepPanel(false);
                            }}
                            className="px-3 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white text-sm font-medium"
                          >
                            取消
                          </button>
                        )}
                        <button
                          onClick={() => setShowSleepPanel(false)}
                          className="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Chapter switcher moved to side panel triggered from controls */}

            {/* Book info — description, publisher, ISBN, etc. */}
            {book && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2 space-y-3">
                {book.description && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      简介
                    </h4>
                    <p
                      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 6,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {book.description}
                    </p>
                  </div>
                )}
                <dl className="text-xs space-y-1.5">
                  {book.author && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">
                        作者
                      </dt>
                      <dd className="text-gray-800 dark:text-gray-200">
                        {book.author}
                      </dd>
                    </div>
                  )}
                  {book.publisher && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">
                        出版社
                      </dt>
                      <dd className="text-gray-800 dark:text-gray-200">
                        {book.publisher}
                      </dd>
                    </div>
                  )}
                  {book.isbn && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">
                        ISBN
                      </dt>
                      <dd className="text-gray-800 dark:text-gray-200 font-mono">
                        {book.isbn}
                      </dd>
                    </div>
                  )}
                  {book.language && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">
                        语言
                      </dt>
                      <dd className="text-gray-800 dark:text-gray-200">
                        {book.language}
                      </dd>
                    </div>
                  )}
                  {book.format && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">
                        格式
                      </dt>
                      <dd className="text-gray-800 dark:text-gray-200 uppercase">
                        {book.format}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Keyboard hint — pinned to the bottom of the sidebar */}
            <div className="mt-auto pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                空格 播放/暂停
                <br />
                ← → 切换段落
                <br />
                点击段落或进度条跳转
              </p>
            </div>
          </div>
          {/* /scrollable inner wrapper */}
        </div>

        {/* Paragraphs — right side, body only */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 p-6 overflow-y-auto min-h-0">
            {paragraphs.length > 0 ? (
              <div className="text-lg leading-relaxed space-y-3">
                {paragraphs.map((p, idx) => {
                  const isCurrent = idx === progress.paragraphIndex;
                  const isPast = idx < progress.paragraphIndex;
                  return (
                    <p
                      key={p.id}
                      ref={(el) => {
                        paragraphRefs.current[idx] = el;
                      }}
                      data-paragraph-id={p.id}
                      onClick={() => manager.jumpTo(idx)}
                      className={`transition-all duration-200 rounded-lg px-3 py-2 cursor-pointer text-gray-900 dark:text-gray-100 ${
                        isCurrent
                          ? "bg-amber-100/80 dark:bg-amber-900/40 font-medium ring-2 ring-amber-300 dark:ring-amber-700 scale-[1.01]"
                          : isPast
                            ? "opacity-50"
                            : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      {p.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4" />
                <p>无法提取文本内容</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Chapter side panel */}
      {showChapterPanel && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowChapterPanel(false)}
          />
          <div className="relative w-80 max-w-[90vw] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                章节列表
              </h3>
              <button
                onClick={() => setShowChapterPanel(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chapters.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  暂无章节
                </div>
              ) : (
                <ul>
                  {chapters.map((c) => {
                    const isActive = c.index === chapterIndex;
                    return (
                      <li key={c.index}>
                        <button
                          onClick={() => {
                            handleChapterChange(c.index);
                            setShowChapterPanel(false);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                            isActive
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          <span className="inline-block w-8 text-xs text-gray-400">
                            {c.index + 1}
                          </span>
                          {c.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
