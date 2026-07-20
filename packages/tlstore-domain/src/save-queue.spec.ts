/** 串行保存与最新快照优先规则的回归测试。 */
import { SaveQueue, type SaveQueueState } from './save-queue';

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
});
