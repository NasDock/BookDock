// [API 23+] player/TTSPlayer.ets — TTS 音频播放服务，对齐 mobile ttsAudio.ts + TTSScreen 播放链路
// 核心职责：
//   1. 封装 media.AVPlayer：状态机监听、url 切换、play/pause/seekTo/setPlaybackSpeed
//   2. 分块合成：splitForTts(TTS_CHUNK_MAX=2500) + 预取缓存 Map（chunkParaId 用 p_${index} / p_${index}#${i}）
//   3. 队列播放：当前段 tracks + 下一段 nextTracks，completed 自动切下一段
//   4. 进度回调：onProgressUpdate(positionMs, durationMs) → TTSScreen 更新 paragraphProgress / persistProgress
//
// mobile → hm 关键差异：
//   - mobile 用 Paragraph.id 做 chunk key；hm ApiModels.Paragraph 只有 index/text/duration → 用 p_${index}
//   - mobile TrackPlayer 是全局队列；hm 用单个 AVPlayer + 手动维护队列索引
//   - mobile seekTo 单位秒；hm AVPlayer.seekTo 单位毫秒
//   - mobile setRate 0.5-2.0；hm setPlaybackSpeed 枚举 PlaybackSpeed { SPEED_FORWARD_0_50_X ... SPEED_FORWARD_2_00_X }

import { media } from '@kit.MediaKit';
import { getApiClient } from '../network/ApiClient';
import { Paragraph, SynthesizeParagraphResult, ApiResponse } from '../model/ApiModels';

// ─── 常量（对齐 mobile TTS_CHUNK_MAX = 2500）───────────────────────────
const TTS_CHUNK_MAX: number = 2500;

// ─── 分块算法（1:1 对齐 mobile splitForTts）─────────────────────────────
function splitForTts(text: string, maxLen: number): string[] {
  if (!text) {
    return [];
  }
  if (text.length <= maxLen) {
    return [text];
  }
  const chunks: string[] = [];
  let start: number = 0;
  while (start < text.length) {
    let end: number = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const breakChars: string[] = ['，', '。', '！', '？', '；', '、', ' ', '\n'];
      let found: boolean = false;
      for (let i: number = end - 1; i > start; i--) {
        if (breakChars.includes(text[i])) {
          end = i + 1;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let i: number = end - 1; i > start; i--) {
          const ch: string = text[i];
          if (/[a-zA-Z0-9]/.test(ch)) {
            end = i + 1;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        end = start + maxLen;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

// ─── 拼接音频 URL（对齐 mobile resolveAudioUrl）──────────────────────────
function resolveAudioUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  return `${getApiClient().serverBaseURL}${url}`;
}

// ─── 播放状态枚举（对齐 mobile ttsStore state）──────────────────────────
export enum TTSPlayerState {
  IDLE = 'idle',
  LOADING = 'loading',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ERROR = 'error'
}

// ─── 回调类型（ArkTS 禁 call signature，用 type 别名）────────────────────
export type TTSProgressCallback = (positionMs: number, durationMs: number) => void;
export type TTSParagraphChangeCallback = (newIndex: number) => void;
export type TTSStateChangeCallback = (state: TTSPlayerState, errorMsg?: string) => void;

// ─── TTS 播放器单例（@Observed 供 UI 订阅状态）──────────────────────────
@Observed
export class TTSPlayer {
  private static instance: TTSPlayer | null = null;

  // ─── 播放器核心 ───────────────────────────────────────────────────
  private avPlayer: media.AVPlayer | null = null;
  private queue: string[] = [];           // 当前段 + 下一段的所有 chunk URL
  private queueIndex: number = 0;         // 当前播到队列第几个
  private currentParagraphIndex: number = 0; // 当前段落在 paragraphs 中的索引
  private paragraphChunkStart: number[] = []; // 每段第一个 chunk 在 queue 中的起始索引

  // ─── 状态 ─────────────────────────────────────────────────────────
  public state: TTSPlayerState = TTSPlayerState.IDLE;
  public positionMs: number = 0;
  public durationMs: number = 0;
  public playbackRate: number = 1.0;

  // ─── 当前播放书籍信息（MiniPlayer 显示用）────────────────────────────
  public currentBookId: string = '';
  public bookTitle: string = '';
  public chapterTitle: string = '';
  public coverUrl: string = '';
  public totalParagraphs: number = 0;

  // ─── 续队所需的章节上下文（handleCompleted 后台合成用）──────────────
  private currentParagraphs: Paragraph[] = [];
  private currentProvider: string = '';
  private currentVoiceId: string = '';

  // ─── 预取缓存（对齐 mobile prefetchedCache: Map<chunkParaId, uri>）─────
  private prefetchedCache: Map<string, string> = new Map();

  // ─── 回调（TTSScreen 注册，单订阅）───────────────────────────────────
  public onProgressUpdate: TTSProgressCallback | null = null;
  public onParagraphChange: TTSParagraphChangeCallback | null = null;
  public onStateChange: TTSStateChangeCallback | null = null;

  // ─── 进度轮询定时器 ────────────────────────────────────────────────
  private progressTimerId: number = -1;

  private constructor() {}

  public static shared(): TTSPlayer {
    if (!TTSPlayer.instance) {
      TTSPlayer.instance = new TTSPlayer();
    }
    return TTSPlayer.instance;
  }

  // ─── 初始化 AVPlayer（幂等，重复调用直接返回）────────────────────────
  private async ensurePlayer(): Promise<media.AVPlayer> {
    if (this.avPlayer) {
      return this.avPlayer;
    }
    const player: media.AVPlayer = await media.createAVPlayer();
    this.bindPlayerEvents(player);
    this.avPlayer = player;
    return player;
  }

  // ─── 绑定播放器事件（状态机 + 进度 + 完成 + 错误）────────────────────
  private bindPlayerEvents(player: media.AVPlayer): void {
    // 状态机（对齐 mobile TrackPlayer 状态流转）
    player.on('stateChange', (state: media.AVPlayerState): void => {
      if (state === 'initialized') {
        player.prepare();
      } else if (state === 'prepared') {
        this.durationMs = player.duration;
        player.play();
        this.setState(TTSPlayerState.PLAYING);
        this.startProgressTimer();
      } else if (state === 'playing') {
        this.setState(TTSPlayerState.PLAYING);
      } else if (state === 'paused') {
        this.setState(TTSPlayerState.PAUSED);
        this.stopProgressTimer();
      } else if (state === 'completed') {
        this.stopProgressTimer();
        this.handleCompleted();
      } else if (state === 'error') {
        this.setState(TTSPlayerState.ERROR, 'AVPlayer error');
        this.stopProgressTimer();
      }
    });

    // 错误回调
    player.on('error', (err: Error): void => {
      this.setState(TTSPlayerState.ERROR, err.message);
      this.stopProgressTimer();
    });

    // 进度更新（AVPlayer 不自动回调，用定时器轮询）
    // seekTo 后 position 会跳变，由 startProgressTimer 统一轮询
  }

  // ─── 播完一个 chunk 的处理：切下一个 chunk 或下一段 ─────────────────
  private handleCompleted(): void {
    this.queueIndex = this.queueIndex + 1;
    if (this.queueIndex >= this.queue.length) {
      // 队列播完 — 检查是否需要合成 idx+1 续队
      const nextIdx: number = this.currentParagraphIndex + 1;
      if (nextIdx < this.totalParagraphs && this.currentParagraphs.length > 0) {
        // 后台合成下一段并加入 queue（不阻塞播放）
        void this.synthesizeAndEnqueueParagraph(this.currentParagraphs, nextIdx);
      } else {
        // 整章结束
        this.setState(TTSPlayerState.IDLE);
        this.positionMs = 0;
        this.durationMs = 0;
      }
      return;
    }
    // 检查是否进入下一段（对齐 mobile TrackPlayer 队列自动切下一段）
    const nextParagraphIndex: number = this.findParagraphIndexByQueueIndex(this.queueIndex);
    if (nextParagraphIndex !== this.currentParagraphIndex) {
      this.currentParagraphIndex = nextParagraphIndex;
      this.onParagraphChange?.(nextParagraphIndex);
      // 同时后台预合成 idx+2（保证队列长度始终 >= 2 段）
      const nextNextIdx: number = nextParagraphIndex + 1;
      if (nextNextIdx < this.totalParagraphs && this.currentParagraphs.length > 0) {
        void this.synthesizeAndEnqueueParagraph(this.currentParagraphs, nextNextIdx);
      }
    }
    // 播下一个 chunk
    this.playQueueItem(this.queueIndex);
  }

  // ─── 后台合成单段并加入 queue（队列长度保持 >= 2 段，零停顿切段）────
  private async synthesizeAndEnqueueParagraph(
    paragraphs: Paragraph[],
    idx: number
  ): Promise<void> {
    if (idx >= paragraphs.length) {
      return;
    }
    const para: Paragraph = paragraphs[idx];
    const baseId: string = `p_${para.index}`;
    // 已在 cache → 直接用
    if (this.prefetchedCache.has(baseId) && this.queueHasParagraph(idx)) {
      return;
    }
    try {
      const uris: string[] = await this.synthesizeParagraph(
        paragraphs, idx, this.currentBookId, this.currentProvider, this.currentVoiceId
      );
      if (uris.length === 0) {
        return;
      }
      // 把新合成的 chunks 加入 queue 尾部，记录 paragraphChunkStart
      const startQueueIdx: number = this.queue.length;
      this.queue = this.queue.concat(uris);
      this.paragraphChunkStart = this.paragraphChunkStart.concat([startQueueIdx]);
    } catch {
      // 静默失败：切段时会再触发一次合成
    }
  }

  // ─── 检查 queue 是否已包含某段（避免重复合成）───────────────────────
  private queueHasParagraph(idx: number): boolean {
    return idx < this.paragraphChunkStart.length;
  }

  // ─── 根据 queueIndex 反查段落索引 ────────────────────────────────────
  private findParagraphIndexByQueueIndex(qIdx: number): number {
    // paragraphChunkStart 是每段第一个 chunk 的 queue 起始索引，倒序找最后一个 <= qIdx 的
    for (let i: number = this.paragraphChunkStart.length - 1; i >= 0; i--) {
      if (this.paragraphChunkStart[i] <= qIdx) {
        return i;
      }
    }
    return 0;
  }

  // ─── 播放队列中指定项（内部复用 AVPlayer，切 url 重新 prepare）────────
  private async playQueueItem(qIdx: number): Promise<void> {
    if (qIdx < 0 || qIdx >= this.queue.length) {
      return;
    }
    const url: string = this.queue[qIdx];
    const player: media.AVPlayer = await this.ensurePlayer();
    try {
      // 复用同一 AVPlayer 实例：先 reset 再设新 url
      await player.reset();
      player.url = url;
      // url 设置后触发 stateChange → initialized → prepare → prepared → play
    } catch (err) {
      this.setState(TTSPlayerState.ERROR, (err as Error)?.message ?? 'play failed');
    }
  }

  // ─── 对外：播放指定段落（对齐 mobile playParagraph，预取后台化）────
  // 关键改进：合成当前段后立即播放，不等下一段合成
  //   下一段在当前段播放期间后台 fire-and-forget 合成，handleCompleted 时无缝切下一段
  public async playParagraphs(
    paragraphs: Paragraph[],
    idx: number,
    bookId: string,
    provider: string,
    voiceId: string,
    startOffsetMs: number = 0,
    bookTitle: string = '',
    chapterTitle: string = '',
    coverUrl: string = ''
  ): Promise<boolean> {
    if (idx < 0 || idx >= paragraphs.length) {
      this.setState(TTSPlayerState.IDLE);
      return false;
    }
    this.setState(TTSPlayerState.LOADING);
    this.currentParagraphIndex = idx;
    this.positionMs = startOffsetMs;
    // 记录书籍信息（MiniPlayer 显示用 + handleCompleted 续队用）
    this.currentBookId = bookId;
    this.currentProvider = provider;
    this.currentVoiceId = voiceId;
    this.bookTitle = bookTitle;
    this.chapterTitle = chapterTitle;
    this.coverUrl = coverUrl;
    this.totalParagraphs = paragraphs.length;
    this.currentParagraphs = paragraphs;

    try {
      // 1. 合成当前段所有 chunk（必须有，才能播放）
      const uris: string[] = await this.synthesizeParagraph(paragraphs, idx, bookId, provider, voiceId);
      if (uris.length === 0) {
        this.setState(TTSPlayerState.ERROR, '合成失败');
        return false;
      }

      // 2. 立即构建当前段队列并开始播放（不等下一段）
      this.queue = uris;
      this.paragraphChunkStart = [0];
      this.queueIndex = 0;
      await this.playQueueItem(0);

      // 3. 后台 fire-and-forget 合成 idx+1 并入队（对齐 mobile nextTracks 但不阻塞）
      const nextIdx: number = idx + 1;
      if (nextIdx < paragraphs.length) {
        void this.synthesizeAndEnqueueParagraph(paragraphs, nextIdx);
      }

      return true;
    } catch (err) {
      this.setState(TTSPlayerState.ERROR, (err as Error)?.message ?? '播放失败');
      return false;
    }
  }

  // ─── 合成单段所有 chunk（对齐 mobile synthesizeParagraphAudio）─────────
  private async synthesizeParagraph(
    paragraphs: Paragraph[],
    idx: number,
    bookId: string,
    provider: string,
    voiceId: string
  ): Promise<string[]> {
    if (idx >= paragraphs.length) {
      return [];
    }
    const para: Paragraph = paragraphs[idx];
    const chunks: string[] = splitForTts(para.text, TTS_CHUNK_MAX);
    const apiClient = getApiClient();
    const uris: string[] = [];

    for (let i: number = 0; i < chunks.length; i++) {
      const chunk: string = chunks[i];
      // hm Paragraph 无 id → 用 p_${index} 或 p_${index}#${i} 构造 chunkParaId
      const baseId: string = `p_${para.index}`;
      const chunkParaId: string = chunks.length > 1 ? `${baseId}#${i}` : baseId;

      let uri: string | undefined = this.prefetchedCache.get(chunkParaId);
      if (!uri) {
        const r: ApiResponse<SynthesizeParagraphResult> = await apiClient.synthesizeParagraph({
          bookId: bookId,
          paragraphId: chunkParaId,
          text: chunk,
          provider: provider,
          voice: voiceId
        });
        if (!r.success || !r.data) {
          throw new Error(r.error ?? 'synthesize failed');
        }
        // 优先用共享端 url，hm 特有 audioUrl 兜底
        const rawUrl: string = r.data.url ?? r.data.audioUrl ?? '';
        if (!rawUrl) {
          throw new Error('synthesize returned empty url');
        }
        uri = resolveAudioUrl(rawUrl);
        this.prefetchedCache.set(chunkParaId, uri);
      }
      uris.push(uri);
    }
    return uris;
  }

  // ─── 预取单段（对齐 mobile prefetchParagraph，静默失败）───────────────
  public async prefetchParagraph(
    paragraphs: Paragraph[],
    idx: number,
    bookId: string,
    provider: string,
    voiceId: string
  ): Promise<void> {
    if (idx >= paragraphs.length) {
      return;
    }
    const para: Paragraph = paragraphs[idx];
    const baseId: string = `p_${para.index}`;
    if (this.prefetchedCache.has(baseId)) {
      return;
    }
    try {
      await this.synthesizeParagraph(paragraphs, idx, bookId, provider, voiceId);
    } catch {
      // 预取失败静默
    }
  }

  // ─── 暂停（对齐 mobile TrackPlayer.pause）─────────────────────────────
  public async pause(): Promise<void> {
    if (!this.avPlayer) {
      return;
    }
    try {
      await this.avPlayer.pause();
    } catch {
      // 已经暂停或状态不对时静默
    }
  }

  // ─── 继续播放（对齐 mobile TrackPlayer.play）───────────────────────────
  public async play(): Promise<void> {
    if (!this.avPlayer) {
      return;
    }
    try {
      await this.avPlayer.play();
      this.startProgressTimer();
    } catch {
      // 状态不对时静默
    }
  }

  // ─── 停止并清空队列（对齐 mobile TrackPlayer.reset）────────────────────
  public async stop(): Promise<void> {
    this.stopProgressTimer();
    if (!this.avPlayer) {
      return;
    }
    try {
      await this.avPlayer.reset();
    } catch {
      // 静默
    }
    this.queue = [];
    this.queueIndex = 0;
    this.paragraphChunkStart = [];
    this.positionMs = 0;
    this.durationMs = 0;
    this.currentBookId = '';
    this.currentProvider = '';
    this.currentVoiceId = '';
    this.bookTitle = '';
    this.chapterTitle = '';
    this.coverUrl = '';
    this.totalParagraphs = 0;
    this.currentParagraphs = [];
    this.setState(TTSPlayerState.IDLE);
  }

  // ─── 跳转到指定毫秒（对齐 mobile TrackPlayer.seekTo，AVPlayer API 是 seek）───
  public async seekTo(ms: number): Promise<void> {
    if (!this.avPlayer) {
      return;
    }
    try {
      await this.avPlayer.seek(ms);
      this.positionMs = ms;
    } catch {
      // 静默
    }
  }

  // ─── 设置倍速（对齐 mobile TrackPlayer.setRate）────────────────────────
  public async setPlaybackSpeed(rate: number): Promise<void> {
    this.playbackRate = rate;
    await this.applyPlaybackRate();
  }

  private async applyPlaybackRate(): Promise<void> {
    if (!this.avPlayer) {
      return;
    }
    try {
      // AVPlayer 的 setPlaybackSpeed 用枚举，0.5-2.0 共 7 档
      let speed: media.PlaybackSpeed = media.PlaybackSpeed.SPEED_FORWARD_1_00_X;
      if (this.playbackRate <= 0.5) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_0_50_X;
      } else if (this.playbackRate <= 0.75) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_0_75_X;
      } else if (this.playbackRate <= 1.0) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_1_00_X;
      } else if (this.playbackRate <= 1.25) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_1_25_X;
      } else if (this.playbackRate <= 1.5) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_1_50_X;
      } else if (this.playbackRate <= 1.75) {
        speed = media.PlaybackSpeed.SPEED_FORWARD_1_75_X;
      } else {
        speed = media.PlaybackSpeed.SPEED_FORWARD_2_00_X;
      }
      this.avPlayer.setSpeed(speed);
    } catch {
      // 静默
    }
  }

  // ─── 进度轮询（AVPlayer 无进度回调，用 setInterval 每 500ms 拉一次）─────
  private startProgressTimer(): void {
    this.stopProgressTimer();
    this.progressTimerId = setInterval((): void => {
      if (!this.avPlayer) {
        return;
      }
      try {
        this.positionMs = this.avPlayer.currentTime;
        this.durationMs = this.avPlayer.duration;
        this.onProgressUpdate?.(this.positionMs, this.durationMs);
      } catch {
        // 播放器已释放时静默
      }
    }, 500);
  }

  private stopProgressTimer(): void {
    if (this.progressTimerId >= 0) {
      clearInterval(this.progressTimerId);
      this.progressTimerId = -1;
    }
  }

  // ─── 状态变更通知 ────────────────────────────────────────────────────
  private setState(s: TTSPlayerState, errorMsg?: string): void {
    this.state = s;
    this.onStateChange?.(s, errorMsg);
  }

  // ─── 清空预取缓存（对齐 mobile clearPrefetchCache，切章/切书时调）─────
  public clearPrefetchCache(): void {
    this.prefetchedCache.clear();
  }

  // ─── 释放资源（页面销毁时调）──────────────────────────────────────────
  public async release(): Promise<void> {
    this.stopProgressTimer();
    if (this.avPlayer) {
      try {
        await this.avPlayer.release();
      } catch {
        // 静默
      }
      this.avPlayer = null;
    }
    this.queue = [];
    this.queueIndex = 0;
    this.paragraphChunkStart = [];
    this.prefetchedCache.clear();
    this.currentBookId = '';
    this.currentProvider = '';
    this.currentVoiceId = '';
    this.bookTitle = '';
    this.chapterTitle = '';
    this.coverUrl = '';
    this.totalParagraphs = 0;
    this.currentParagraphs = [];
    this.state = TTSPlayerState.IDLE;
  }

  // ─── 当前播放的段落索引（供 TTSScreen 读）────────────────────────────
  public getCurrentParagraphIndex(): number {
    return this.currentParagraphIndex;
  }
}
