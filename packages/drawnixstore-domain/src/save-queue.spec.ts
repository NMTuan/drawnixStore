/** 串行保存与最新快照优先规则的回归测试。 */
import { afterEach, vi } from 'vitest';
import { SaveQueue, type SaveQueueState } from './save-queue';

afterEach(() => vi.useRealTimers());

describe('SaveQueue', () => {
  it('当前保存结束后只写入最新待保存值', async () => {
    const saved: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save: async (value) => {
        saved.push(value);
        if (value === 'first') await firstSave;
      },
    });

    void queue.enqueue('first');
    void queue.enqueue('second');
    const completed = queue.enqueue('third');
    resolveFirst?.();
    await completed;

    expect(saved).toEqual(['first', 'third']);
  });

  it('离线时保留待保存状态', async () => {
    const states: SaveQueueState[] = [];
    const queue = new SaveQueue<string>({
      isOnline: () => false,
      save: async () => undefined,
      onStateChange: (state) => states.push(state),
    });

    await queue.enqueue('offline');

    expect(queue.hasPending()).toBe(true);
    expect(states).toEqual(['offline']);
  });

  it('确定性失败保留待保存项但不会重复提交同一请求', async () => {
    vi.useFakeTimers();
    const states: SaveQueueState[] = [];
    const save = vi.fn().mockRejectedValue(new Error('payload too large'));
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save,
      getRetryDelay: () => null,
      onStateChange: (state) => states.push(state),
    });

    await queue.enqueue('too-large');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.hasPending()).toBe(true);
    expect(states).toEqual(['saving', 'error']);
  });

  it('旧快照确定性失败时仍会提交保存期间产生的新快照', async () => {
    let rejectOldSave: ((error: Error) => void) | undefined;
    const oldSave = new Promise<void>((_resolve, reject) => {
      rejectOldSave = reject;
    });
    const saved: string[] = [];
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save: async (value) => {
        saved.push(value);
        if (value === 'old') await oldSave;
      },
      getRetryDelay: () => null,
    });

    const firstFlush = queue.enqueue('old');
    void queue.enqueue('new');
    rejectOldSave?.(new Error('payload too large'));
    await firstFlush;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saved).toEqual(['old', 'new']);
    expect(queue.hasPending()).toBe(false);
  });

  it('临时失败按调用方指定的退避等待后重试', async () => {
    vi.useFakeTimers();
    const states: SaveQueueState[] = [];
    const save = vi
      .fn<(_: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(undefined);
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save,
      getRetryDelay: () => 1_000,
      onStateChange: (state) => states.push(state),
    });

    await queue.enqueue('retry');
    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.hasPending()).toBe(false);
    expect(states).toEqual(['saving', 'retrying', 'saving', 'idle']);
  });

  it('释放后忽略在途请求失败，且不会重新安排自动重试', async () => {
    vi.useFakeTimers();
    let rejectSave: ((error: Error) => void) | undefined;
    const inFlightSave = new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    });
    const states: SaveQueueState[] = [];
    const save = vi.fn().mockReturnValue(inFlightSave);
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save,
      getRetryDelay: () => 1_000,
      onStateChange: (state) => states.push(state),
    });

    const flushing = queue.enqueue('stale');
    queue.dispose();
    rejectSave?.(new Error('network failed'));
    await flushing;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.hasPending()).toBe(false);
    expect(states).toEqual(['saving']);
  });

  it('释放后忽略在途请求成功，不再发出后续状态更新', async () => {
    let resolveSave: (() => void) | undefined;
    const inFlightSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const states: SaveQueueState[] = [];
    const queue = new SaveQueue<string>({
      isOnline: () => true,
      save: () => inFlightSave,
      onStateChange: (state) => states.push(state),
    });

    const flushing = queue.enqueue('stale');
    queue.dispose();
    resolveSave?.();
    await flushing;

    expect(queue.hasPending()).toBe(false);
    expect(states).toEqual(['saving']);
  });
});
