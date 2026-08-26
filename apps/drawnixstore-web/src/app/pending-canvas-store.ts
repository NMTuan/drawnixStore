/**
 * Canvas 待保存副本的浏览器持久化。
 * 使用 IndexedDB 优先的独立 localforage 实例，避免大快照受 localStorage 配额限制；
 * 同时读取并迁移早期版本写入 localStorage 的副本，保证升级后离线编辑不会丢失。
 */
import localforage from 'localforage';

/** 同一次 Canvas 保存需要一并恢复的源快照和可选 SVG 预览。 */
export interface PendingCanvasSave {
  snapshot: string;
  previewSvg?: string;
}

/** 供待保存副本使用的最小异步键值存储合同，便于隔离 localforage 并进行单元测试。 */
export interface PendingCanvasStorage {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
}

const LEGACY_PENDING_CANVAS_PREFIX = 'drawnixstore:pending-canvas:';

const pendingCanvasStorage = localforage.createInstance({
  name: 'Drawnix Store',
  storeName: 'pending_canvas_saves',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

/** 返回旧版 localStorage 与新版 IndexedDB 共用的 Canvas 待保存键。 */
export function pendingCanvasSaveKey(canvasId: string): string {
  return `${LEGACY_PENDING_CANVAS_PREFIX}${canvasId}`;
}

/** 判断未知值是否为可安全恢复的待保存副本。 */
function asPendingCanvasSave(value: unknown): PendingCanvasSave | null {
  if (typeof value === 'string') return parseLegacyPendingCanvasSave(value);
  if (typeof value !== 'object' || value === null || !('snapshot' in value)) return null;
  if (typeof value.snapshot !== 'string') return null;
  if (
    'previewSvg' in value &&
    value.previewSvg !== undefined &&
    typeof value.previewSvg !== 'string'
  )
    return null;
  return {
    snapshot: value.snapshot,
    ...(typeof value.previewSvg === 'string' && { previewSvg: value.previewSvg }),
  };
}

/** 兼容早期版本直接存储快照字符串，或将对象 JSON 作为字符串存储的形式。 */
function parseLegacyPendingCanvasSave(value: string): PendingCanvasSave | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    const save = asPendingCanvasSave(parsed);
    if (save) return save;
  } catch {
    // 旧版本可能直接写入序列化后的 Drawnix 快照，作为 snapshot 本身恢复。
  }
  return value ? { snapshot: value } : null;
}

/** 比较两个待保存项，确保旧请求成功时不会删掉更新后的本地副本。 */
function isSamePendingCanvasSave(
  left: PendingCanvasSave | null,
  right: PendingCanvasSave
): boolean {
  return left?.snapshot === right.snapshot && left?.previewSvg === right.previewSvg;
}

/** 一个编辑器实例内串行化写删操作，避免异步 IndexedDB 完成顺序反转本地副本。 */
export class PendingCanvasStore {
  private operation: Promise<void> = Promise.resolve();

  constructor(
    private readonly canvasId: string,
    private readonly storage: PendingCanvasStorage = pendingCanvasStorage
  ) {}

  /** 读取新版副本；没有新版时迁移仍存在的 legacy localStorage 副本。 */
  async read(): Promise<PendingCanvasSave | null> {
    await this.operation.catch(() => undefined);
    try {
      const stored = asPendingCanvasSave(await this.storage.getItem<unknown>(this.key));
      if (stored) {
        this.removeLegacyIfCurrent(stored);
        return stored;
      }
    } catch {
      // IndexedDB 不可用时仍尝试恢复旧副本；后续写入错误会由编辑器展示提示。
    }

    const legacy = this.readLegacy();
    if (!legacy) return null;
    try {
      await this.write(legacy);
      this.removeLegacyIfCurrent(legacy);
    } catch {
      // 保留旧 localStorage 副本，供当前会话同步或下一次兼容恢复使用。
    }
    return legacy;
  }

  /** 持久化最新副本；调用方可捕获配额错误但不应因此阻断网络保存。 */
  write(save: PendingCanvasSave): Promise<void> {
    return this.enqueue(async () => {
      await this.storage.setItem(this.key, save);
    });
  }

  /** 仅在存储中的值仍是本次成功保存的副本时删除，保护保存期间的新编辑。 */
  clearIfCurrent(save: PendingCanvasSave): Promise<void> {
    return this.enqueue(async () => {
      try {
        const stored = asPendingCanvasSave(await this.storage.getItem<unknown>(this.key));
        if (isSamePendingCanvasSave(stored, save)) await this.storage.removeItem(this.key);
      } finally {
        this.removeLegacyIfCurrent(save);
      }
    });
  }

  private get key(): string {
    return pendingCanvasSaveKey(this.canvasId);
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const result = this.operation.catch(() => undefined).then(action);
    this.operation = result;
    return result;
  }

  private readLegacy(): PendingCanvasSave | null {
    try {
      return asPendingCanvasSave(globalThis.localStorage.getItem(this.key));
    } catch {
      return null;
    }
  }

  private removeLegacyIfCurrent(save: PendingCanvasSave) {
    try {
      if (isSamePendingCanvasSave(this.readLegacy(), save))
        globalThis.localStorage.removeItem(this.key);
    } catch {
      // localStorage 可能在隐私模式下不可访问；不影响 IndexedDB 或服务端保存。
    }
  }
}
