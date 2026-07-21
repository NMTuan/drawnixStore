/** Drawnix Store BFF 的稳定记录 DTO、输入校验与 PocketBase 映射。 */
import { createError } from 'h3';
import type { RecordModel } from 'pocketbase';

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const MAX_DOCUMENT_SIZE = 10_000_000;
const canvasLocks = new Map<string, Promise<void>>();

/** 返回给浏览器的私有 Workspace 数据。 */
export interface WorkspaceDto {
  id: string;
  name: string;
  lastAccessed: string;
  created: string;
  updated: string;
}

/** 返回给浏览器的私有 Canvas 数据；owner 永远由 BFF 会话推导，不成为客户端写入字段。 */
export interface CanvasDto {
  id: string;
  workspaceId: string;
  title: string;
  snapshot: string;
  previewSvg: string;
  shareToken: string;
  shareEnabled: boolean;
  archived: boolean;
  revision: number;
  created: string;
  updated: string;
}

interface WorkspaceRecord extends RecordModel {
  name: string;
  last_accessed: string;
}

interface CanvasRecord extends RecordModel {
  workspace: string;
  title: string;
  snapshot: string;
  preview_svg: string;
  share_token: string;
  share_enabled: boolean;
  archived: boolean;
  revision: number;
}

/** 将 PocketBase 字段名映射为浏览器 API 合同，避免前端依赖存储层结构。 */
export function workspaceDto(record: WorkspaceRecord): WorkspaceDto {
  return {
    id: record.id,
    name: record.name,
    lastAccessed: record.last_accessed || '',
    created: record.created,
    updated: record.updated,
  };
}

/** 将 PocketBase Canvas 记录映射为 BFF 合同。 */
export function canvasDto(record: CanvasRecord): CanvasDto {
  return {
    id: record.id,
    workspaceId: record.workspace,
    title: record.title,
    snapshot: record.snapshot,
    previewSvg: record.preview_svg,
    shareToken: record.share_token,
    shareEnabled: record.share_enabled,
    archived: record.archived,
    revision: record.revision,
    created: record.created,
    updated: record.updated,
  };
}

/** 校验用户可见名称，避免无意义或超过 PocketBase 字段范围的输入进入服务层。 */
export function requiredText(value: unknown, label: string, maximum: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum)
    throw createError({ statusCode: 400, statusMessage: `${label}长度不合法。` });
  return text;
}

/** 校验持久化快照或 SVG 的文本大小，限制单条 Canvas 写入的最大负载。 */
export function documentText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > MAX_DOCUMENT_SIZE)
    throw createError({ statusCode: 400, statusMessage: `${label}内容不合法。` });
  return value;
}

/** 生成 192 位十六进制 bearer token，随机源只在服务端运行。 */
export function createShareToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 判断 token 是否符合 BFF 的固定分享凭据格式。 */
export function isShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(value);
}

/**
 * 将同一 Canvas 的读改写操作串行化，保证单 Nitro 实例内 revision 校验与更新不可交错。
 * 横向扩容时应替换为 PocketBase 事务或分布式锁。
 */
export async function withCanvasLock<T>(canvasId: string, action: () => Promise<T>): Promise<T> {
  const previous = canvasLocks.get(canvasId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  canvasLocks.set(canvasId, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (canvasLocks.get(canvasId) === queued) canvasLocks.delete(canvasId);
  }
}

export type { CanvasRecord, WorkspaceRecord };
