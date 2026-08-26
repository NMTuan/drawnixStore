/**
 * Canvas 串行保存队列。
 * 同一 Canvas 在请求进行期间只保留最新待保存快照，实现“最后一次成功保存覆盖”。
 */

export type SaveQueueState = 'idle' | 'saving' | 'offline' | 'retrying' | 'error';

export interface SaveQueueOptions<T> {
  isOnline: () => boolean;
  save: (value: T) => Promise<void>;
  /** 返回下一次自动重试前的等待毫秒数；返回 null 表示当前失败不可自动重试。 */
  getRetryDelay?: (error: unknown, attempt: number) => number | null;
  onStateChange?: (state: SaveQueueState) => void;
}

/** 对异步写入进行去重、串行化与受控重试，调用方负责持久化离线副本。 */
export class SaveQueue<T> {
  private pending: T | null = null;
  private saving = false;
  private activeFlush: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private blocked = false;
  private disposed = false;

  constructor(private readonly options: SaveQueueOptions<T>) {}

  /** 新编辑或手动保存代表用户明确发起一次新尝试，可解除之前的确定性失败阻塞。 */
  enqueue(value: T): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pending = value;
    this.blocked = false;
    this.retryAttempt = 0;
    this.clearRetryTimer();
    return this.flush();
  }

  /** 仅在没有确定性失败或等待中的退避任务时立即 drain 队列。 */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.activeFlush) return this.activeFlush;
    if (!this.pending || this.blocked) return Promise.resolve();
    if (!this.options.isOnline()) {
      this.options.onStateChange?.('offline');
      return Promise.resolve();
    }
    this.activeFlush = this.runFlush().finally(() => {
      this.activeFlush = null;
      // 仅成功 drain 后补处理保存期间新入队的值；失败重试由退避定时器控制。
      if (
        !this.disposed &&
        this.pending &&
        !this.blocked &&
        !this.retryTimer &&
        this.options.isOnline()
      )
        void this.flush();
    });
    return this.activeFlush;
  }

  /** 执行一次队列 drain；调用者可等待其结束后再执行归档等生命周期操作。 */
  private async runFlush(): Promise<void> {
    if (this.disposed || !this.options.isOnline()) {
      if (this.disposed) return;
      this.options.onStateChange?.('offline');
      return;
    }

    this.saving = true;
    this.options.onStateChange?.('saving');
    let current: T | null = null;
    try {
      while (!this.disposed && this.pending && this.options.isOnline()) {
        const next = this.pending;
        current = next;
        this.pending = null;
        await this.options.save(next);
        if (this.disposed) return;
        current = null;
        this.retryAttempt = 0;
      }
      if (this.disposed) return;
      this.options.onStateChange?.(this.pending ? 'offline' : 'idle');
    } catch (error) {
      if (this.disposed) return;
      // 保存期间已有新编辑时，失败只属于旧快照；让 finally 立即处理新快照，不能把它一并阻塞。
      const hasNewerPending = this.pending !== null;
      this.pending ??= current;
      if (!this.options.isOnline()) this.options.onStateChange?.('offline');
      else if (hasNewerPending) this.retryAttempt = 0;
      else this.scheduleRetry(error);
    } finally {
      this.saving = false;
    }
  }

  /** 根据调用方提供的错误分类安排退避，确定性失败只保留待保存项并进入 error 状态。 */
  private scheduleRetry(error: unknown) {
    if (this.disposed) return;
    const delay = this.options.getRetryDelay?.(error, this.retryAttempt + 1);
    if (delay === null || delay === undefined || !Number.isFinite(delay) || delay < 0) {
      this.blocked = true;
      this.options.onStateChange?.('error');
      return;
    }

    this.retryAttempt += 1;
    this.options.onStateChange?.('retrying');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed && this.pending && this.options.isOnline() && !this.blocked)
        void this.flush();
    }, delay);
  }

  /** 编辑器卸载时永久停止队列，取消重试且不再处理在途请求的后续结果。 */
  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.clearRetryTimer();
  }

  private clearRetryTimer() {
    if (this.retryTimer === null) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  hasPending(): boolean {
    if (this.disposed) return false;
    return this.pending !== null || this.saving || this.retryTimer !== null;
  }
}
