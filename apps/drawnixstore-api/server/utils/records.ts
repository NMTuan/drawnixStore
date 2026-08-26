/** Drawnix Store BFF 的稳定记录 DTO、输入校验与 PocketBase 映射。 */
import {
  getUtf8ByteLength,
  MAX_CANVAS_DOCUMENT_BYTES,
  MAX_CANVAS_WRITE_BYTES,
} from '@drawnixstore/domain';
import { assertBodySize, createError, type H3Event } from 'h3';
import type { RecordModel } from 'pocketbase';

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
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

/** 校验持久化快照或 SVG 的 UTF-8 大小，限制单个 Canvas 文档字段的容量。 */
export function documentText(value: unknown, label: string): string {
  if (typeof value !== 'string')
    throw createError({ statusCode: 400, statusMessage: `${label}内容不合法。` });
  if (getUtf8ByteLength(value) > MAX_CANVAS_DOCUMENT_BYTES)
    throw createError({
      statusCode: 413,
      statusMessage: `${label}超过 10 MiB 上限，请减少图片或画布内容后重试。`,
    });
  return value;
}

/** 在读取 JSON 前限制整条 Canvas 写入请求，防止大请求绕过字段校验占用 API 内存。 */
export async function assertCanvasWriteBodySize(event: H3Event): Promise<void> {
  try {
    await assertBodySize(event, MAX_CANVAS_WRITE_BYTES);
  } catch (error) {
    if (isRequestEntityTooLarge(error))
      throw createError({
        statusCode: 413,
        statusMessage: '画布保存请求超过 24 MiB 上限，请减少图片或画布内容后重试。',
      });
    throw error;
  }
}

/** 兼容 H3 不同版本对请求体过大错误使用的 status 或 statusCode 字段。 */
function isRequestEntityTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (
    ('status' in error && error.status === 413) ||
    ('statusCode' in error && error.statusCode === 413)
  );
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
