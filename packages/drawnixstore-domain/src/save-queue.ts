/**
 * Canvas 串行保存队列。
 * 同一 Canvas 在请求进行期间只保留最新待保存快照，实现“最后一次成功保存覆盖”。
 */

export type SaveQueueState = 'idle' | 'saving' | 'offline' | 'error';

export interface SaveQueueOptions<T> {
  isOnline: () => boolean;
  save: (value: T) => Promise<void>;
  onStateChange?: (state: SaveQueueState) => void;
}

/** 对异步写入进行去重与串行化，调用方负责持久化离线副本。 */
export class SaveQueue<T> {
  private pending: T | null = null;
  private saving = false;
  private activeFlush: Promise<void> | null = null;

  constructor(private readonly options: SaveQueueOptions<T>) {}

  enqueue(value: T): Promise<void> {
    this.pending = value;
    return this.flush();
  }

  flush(): Promise<void> {
    if (this.activeFlush) return this.activeFlush;
    if (!this.pending) return Promise.resolve();
    this.activeFlush = this.runFlush().finally(() => {
      this.activeFlush = null;
      if (this.pending && this.options.isOnline()) void this.flush();
    });
    return this.activeFlush;
  }

  /** 执行一次队列 drain；调用者可等待其结束后再执行归档等生命周期操作。 */
  private async runFlush(): Promise<void> {
    if (!this.options.isOnline()) {
      this.options.onStateChange?.('offline');
      return;
    }

    this.saving = true;
    this.options.onStateChange?.('saving');
    let current: T | null = null;
    try {
      while (this.pending && this.options.isOnline()) {
        const next = this.pending;
        current = next;
        this.pending = null;
        await this.options.save(next);
        current = null;
      }
      this.options.onStateChange?.(this.pending ? 'offline' : 'idle');
    } catch {
      this.pending ??= current;
      this.options.onStateChange?.(this.options.isOnline() ? 'error' : 'offline');
    } finally {
      this.saving = false;
    }
  }

  hasPending(): boolean {
    return this.pending !== null || this.saving;
  }
}
