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
import { audio } from '@kit.AudioKit';
import { avSession } from '@kit.AVSessionKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { common, wantAgent, WantAgent } from '@kit.AbilityKit';
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
  // 与 paragraphChunkStart 一一对应的绝对段落索引。
  // 从中间段起播时 paragraphChunkStart 只有 [0],队列段序号 ≠ 真实段落索引,必须单独记录。
  private paragraphChunkIndices: number[] = [];
  // in-flight 合成任务:预取与"队列播空后续播"可能同时触发同一段,复用同一个 Promise 避免重复合成/重复入队
  private enqueueTasks: Map<number, Promise<void>> = new Map();

  // ─── 状态 ─────────────────────────────────────────────────────────
  public state: TTSPlayerState = TTSPlayerState.IDLE;
  public positionMs: number = 0;
  public durationMs: number = 0;
  public playbackRate: number = 1.0;
  // 续播时待应用的段内偏移:playParagraphs 收到 startOffsetMs 后暂存,
  // AVPlayer 进入 prepared(拿到真实 duration)后再 seek,避免从段首开始播。
  private pendingSeekMs: number = 0;

  // ─── 当前播放书籍信息（MiniPlayer 显示用）────────────────────────────
  public currentBookId: string = '';
  public bookTitle: string = '';
  // 当前播放章节索引(mini 展开回听书页时据此接续,避免从服务端旧进度重开第一段)
  public currentChapterIndex: number = -1;
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

  // ─── 后台播放(媒体类播放必须接入 AVSession + AUDIO_PLAYBACK 长时任务)──
  // AVSession 必须由单例长期持有;局部变量会被系统回收,导致后台发声被强制暂停。
  private appContext: common.UIAbilityContext | null = null;
  private mediaSession: avSession.AVSession | null = null;
  private backgroundTaskActive: boolean = false;

  private constructor() {}

  // UIAbility 启动时注入上下文,并创建/激活媒体会话(全局只需一次)
  public configure(context: common.UIAbilityContext): void {
    this.appContext = context;
    void this.initMediaSession();
  }

  private async initMediaSession(): Promise<void> {
    if (!this.appContext || this.mediaSession) {
      return;
    }
    try {
      const session: avSession.AVSession = await avSession.createAVSession(
        this.appContext, 'AudioDockTTS', 'audio');
      this.mediaSession = session;
      await session.setAVMetadata(this.buildAVMetadata());
      await session.setAVPlaybackState({
        state: avSession.PlaybackState.PLAYBACK_STATE_PAUSE
      });
      // activate 必须在元数据/播放状态设置完成后调用
      await session.activate();
      // init 可能晚于首次 setState(PLAYING),补一次状态同步
      this.updateMediaSessionState();
    } catch {
      // 播控中心接入失败不影响前台播放
    }
  }

  private buildAVMetadata(): avSession.AVMetadata {
    return {
      assetId: this.currentBookId || 'audiodock-tts',
      title: this.bookTitle || '听书',
      mediaImage: this.coverUrl || '',
      artist: '声仓'
    };
  }

  private updateMediaSessionState(): void {
    const session: avSession.AVSession | null = this.mediaSession;
    if (!session) {
      return;
    }
    let state: avSession.PlaybackState = avSession.PlaybackState.PLAYBACK_STATE_PAUSE;
    if (this.state === TTSPlayerState.PLAYING) {
      state = avSession.PlaybackState.PLAYBACK_STATE_PLAY;
    } else if (this.state === TTSPlayerState.LOADING) {
      state = avSession.PlaybackState.PLAYBACK_STATE_BUFFERING;
    }
    const playbackState: avSession.AVPlaybackState = {
      state: state,
      position: { elapsedTime: Math.max(0, this.positionMs), updateTime: new Date().getTime() },
      speed: this.playbackRate
    };
    void session.setAVPlaybackState(playbackState).catch((): void => {});
  }

  // 播放时申请 AUDIO_PLAYBACK 长时任务,避免退后台被系统挂起/静音
  private startBackgroundTask(): void {
    const context: common.UIAbilityContext | null = this.appContext;
    if (!context || this.backgroundTaskActive) {
      return;
    }
    try {
      const info: wantAgent.WantAgentInfo = {
        wants: [{
          bundleName: context.abilityInfo.bundleName,
          abilityName: context.abilityInfo.name
        }],
        operationType: wantAgent.OperationType.START_ABILITY,
        requestCode: 0,
        wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      };
      void wantAgent.getWantAgent(info).then((agent: WantAgent): Promise<void> => {
        return backgroundTaskManager.startBackgroundRunning(
          context, backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK, agent);
      }).then((): void => {
        this.backgroundTaskActive = true;
      }).catch((): void => {
        // 申请失败时仍可前台播放,不中断业务
      });
    } catch {
      // 静默
    }
  }

  private stopBackgroundTask(): void {
    const context: common.UIAbilityContext | null = this.appContext;
    if (!context || !this.backgroundTaskActive) {
      return;
    }
    this.backgroundTaskActive = false;
    try {
      void backgroundTaskManager.stopBackgroundRunning(context).catch((): void => {});
    } catch {
      // 静默
    }
  }

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
        // 听书场景须在 prepare 前声明 AUDIOBOOK 流类型(否则默认按 MUSIC 处理,后台受管控)
        try {
          player.audioRendererInfo = {
            usage: audio.StreamUsage.STREAM_USAGE_AUDIOBOOK,
            rendererFlags: 0
          };
        } catch {
          // 设备/SDK 不支持时保持默认流类型
        }
        player.prepare();
      } else if (state === 'prepared') {
        this.durationMs = player.duration;
        // 恢复续播:seek 到上次的段内偏移后再播(对齐 mobile TrackPlayer.seekTo)
        const seekMs: number = this.pendingSeekMs;
        this.pendingSeekMs = 0;
        if (seekMs > 0 && seekMs < this.durationMs) {
          void player.seek(seekMs);
          this.positionMs = seekMs;
        }
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
      // 队列播空:下一段可能还在后台合成(冷启动时服务端首次合成较慢,预取常来不及入队)。
      // 必须等合成入队后主动接着播,否则播完当前段就停。
      const nextIdx: number = this.currentParagraphIndex + 1;
      if (nextIdx < this.totalParagraphs && this.currentParagraphs.length > 0) {
        void this.synthesizeAndEnqueueParagraph(this.currentParagraphs, nextIdx).then((): void => {
          if (this.queueIndex >= this.queue.length) {
            // 合成失败:暴露真实状态,避免 mini 一直显示"播放中"却没声音
            this.setState(TTSPlayerState.ERROR, '下一段合成失败');
            return;
          }
          // 用绝对段落索引更新 UI(从中间段起播时队列段序号 ≠ 段落索引)
          const paraIdx: number = this.findParagraphIndexByQueueIndex(this.queueIndex);
          if (paraIdx !== this.currentParagraphIndex) {
            this.currentParagraphIndex = paraIdx;
            this.onParagraphChange?.(paraIdx);
          }
          void this.playQueueItem(this.queueIndex);
        });
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
  // 同一段只保留一个 in-flight Promise:预取与队列播空续播并发时不会重复合成/重复入队
  private synthesizeAndEnqueueParagraph(
    paragraphs: Paragraph[],
    idx: number
  ): Promise<void> {
    if (idx >= paragraphs.length) {
      return Promise.resolve();
    }
    const running: Promise<void> | undefined = this.enqueueTasks.get(idx);
    if (running) {
      return running;
    }
    const task: Promise<void> = this.doSynthesizeAndEnqueue(paragraphs, idx);
    this.enqueueTasks.set(idx, task);
    void task.then(
      (): void => { this.enqueueTasks.delete(idx); },
      (): void => { this.enqueueTasks.delete(idx); }
    );
    return task;
  }

  private async doSynthesizeAndEnqueue(paragraphs: Paragraph[], idx: number): Promise<void> {
    if (idx >= paragraphs.length || this.queueHasParagraph(idx)) {
      return;
    }
    try {
      const uris: string[] = await this.synthesizeParagraph(
        paragraphs, idx, this.currentBookId, this.currentProvider, this.currentVoiceId
      );
      if (uris.length === 0) {
        return;
      }
      // 把新合成的 chunks 加入 queue 尾部，记录绝对段落索引
      const startQueueIdx: number = this.queue.length;
      this.queue = this.queue.concat(uris);
      this.paragraphChunkStart = this.paragraphChunkStart.concat([startQueueIdx]);
      this.paragraphChunkIndices = this.paragraphChunkIndices.concat([idx]);
    } catch {
      // 静默失败：切段时会再触发一次合成
    }
  }

  // ─── 检查 queue 是否已包含某段（避免重复合成）───────────────────────
  private queueHasParagraph(idx: number): boolean {
    return this.paragraphChunkIndices.some((v: number): boolean => v === idx);
  }

  // ─── 根据 queueIndex 反查绝对段落索引 ────────────────────────────────
  private findParagraphIndexByQueueIndex(qIdx: number): number {
    // paragraphChunkStart 是每段第一个 chunk 的 queue 起始索引，倒序找最后一个 <= qIdx 的
    for (let i: number = this.paragraphChunkStart.length - 1; i >= 0; i--) {
      if (this.paragraphChunkStart[i] <= qIdx) {
        return this.paragraphChunkIndices[i];
      }
    }
    return this.currentParagraphIndex;
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
    coverUrl: string = '',
    chapterIndex: number = -1
  ): Promise<boolean> {
    if (idx < 0 || idx >= paragraphs.length) {
      this.setState(TTSPlayerState.IDLE);
      return false;
    }
    this.setState(TTSPlayerState.LOADING);
    this.currentParagraphIndex = idx;
    this.positionMs = startOffsetMs;
    this.pendingSeekMs = Math.max(0, startOffsetMs);
    // 记录书籍信息（MiniPlayer 显示用 + handleCompleted 续队用）
    this.currentBookId = bookId;
    this.currentProvider = provider;
    this.currentVoiceId = voiceId;
    this.bookTitle = bookTitle;
    this.currentChapterIndex = chapterIndex;
    this.chapterTitle = chapterTitle;
    this.coverUrl = coverUrl;
    this.totalParagraphs = paragraphs.length;
    this.currentParagraphs = paragraphs;
    const session: avSession.AVSession | null = this.mediaSession;
    if (session) {
      void session.setAVMetadata(this.buildAVMetadata()).catch((): void => {});
    }

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
      this.paragraphChunkIndices = [idx];
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
    this.paragraphChunkIndices = [];
    this.enqueueTasks.clear();
    this.positionMs = 0;
    this.durationMs = 0;
    this.pendingSeekMs = 0;
    this.currentBookId = '';
    this.currentProvider = '';
    this.currentVoiceId = '';
    this.bookTitle = '';
    this.currentChapterIndex = -1;
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
    if (s === TTSPlayerState.PLAYING) {
      this.startBackgroundTask();
    } else if (s === TTSPlayerState.PAUSED || s === TTSPlayerState.IDLE || s === TTSPlayerState.ERROR) {
      this.stopBackgroundTask();
    }
    this.updateMediaSessionState();
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
    this.paragraphChunkIndices = [];
    this.enqueueTasks.clear();
    this.prefetchedCache.clear();
    this.currentBookId = '';
    this.currentProvider = '';
    this.currentVoiceId = '';
    this.bookTitle = '';
    this.currentChapterIndex = -1;
    this.chapterTitle = '';
    this.coverUrl = '';
    this.totalParagraphs = 0;
    this.currentParagraphs = [];
    this.stopBackgroundTask();
    this.state = TTSPlayerState.IDLE;
  }

  // ─── 当前播放的段落索引（供 TTSScreen 读）────────────────────────────
  public getCurrentParagraphIndex(): number {
    return this.currentParagraphIndex;
  }
}
