/// <reference types="vitest/globals" />
/** 验证大 Canvas 待保存副本的 IndexedDB 持久化、旧键迁移与写删顺序。 */
import { afterEach, expect, it } from 'vitest';
import {
  PendingCanvasStore,
  pendingCanvasSaveKey,
  type PendingCanvasStorage,
} from './pending-canvas-store';

class MemoryStorage implements PendingCanvasStorage {
  readonly values = new Map<string, unknown>();

  async getItem<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<T> {
    this.values.set(key, value);
    return value;
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

afterEach(() => localStorage.clear());

it('迁移旧 localStorage 副本到独立异步存储', async () => {
  const canvasId = 'canvas-1';
  const key = pendingCanvasSaveKey(canvasId);
  const legacySave = { snapshot: '{"children":[]}', previewSvg: '<svg/>' };
  localStorage.setItem(key, JSON.stringify(legacySave));
  const storage = new MemoryStorage();
  const store = new PendingCanvasStore(canvasId, storage);

  await expect(store.read()).resolves.toEqual(legacySave);
  await expect(storage.getItem(key)).resolves.toEqual(legacySave);
  expect(localStorage.getItem(key)).toBeNull();
});

it('旧保存成功时不会删掉保存期间写入的新副本', async () => {
  const canvasId = 'canvas-2';
  const storage = new MemoryStorage();
  const store = new PendingCanvasStore(canvasId, storage);
  const oldSave = { snapshot: '{"children":["old"]}' };
  const newSave = { snapshot: '{"children":["new"]}', previewSvg: '<svg>new</svg>' };

  await store.write(oldSave);
  await store.write(newSave);
  await store.clearIfCurrent(oldSave);

  await expect(store.read()).resolves.toEqual(newSave);
});
