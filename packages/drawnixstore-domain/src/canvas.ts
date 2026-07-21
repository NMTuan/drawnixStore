/**
 * Canvas 快照合同。
 * 该模块不依赖 Drawnix 或 Plait 的运行时类型，使持久化记录可在上游编辑器升级时独立演进。
 */

/** 保存到 Canvas 记录的 Drawnix 文档状态。 */
export interface CanvasSnapshot {
  children: unknown[];
  viewport?: unknown;
  theme?: unknown;
  toolState?: unknown;
  formatVersion: 1;
}

/** 创建空白 Canvas 使用的稳定快照格式。 */
export function createEmptyCanvasSnapshot(): CanvasSnapshot {
  return { children: [], formatVersion: 1 };
}

/**
 * 读取数据库快照并过滤无效值。
 * 无法识别的历史数据降级为空白画布，避免一次坏数据阻断用户进入工作区。
 */
export function parseCanvasSnapshot(raw: string): CanvasSnapshot {
  if (!raw) return createEmptyCanvasSnapshot();

  try {
    const value = JSON.parse(raw) as Partial<CanvasSnapshot>;
    if (!Array.isArray(value.children)) return createEmptyCanvasSnapshot();
    return {
      children: value.children,
      viewport: value.viewport,
      theme: value.theme,
      toolState: value.toolState,
      formatVersion: 1,
    };
  } catch {
    return createEmptyCanvasSnapshot();
  }
}

/** 序列化前标准化快照版本，供服务端记录直接存储。 */
export function serializeCanvasSnapshot(snapshot: Omit<CanvasSnapshot, 'formatVersion'>): string {
  return JSON.stringify({ ...snapshot, formatVersion: 1 });
}
