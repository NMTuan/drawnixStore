/**
 * CanvasEditor 将 Drawnix 公开回调接入业务保存队列。
 * 图片插入由 Drawnix 自身处理，作为画布快照的一部分随 Canvas 保存与恢复。
 */
import { Drawnix, type DrawnixToolState } from '@drawnix/drawnix';
import {
  parseCanvasSnapshot,
  SaveQueue,
  serializeCanvasSnapshot,
  type CanvasSnapshot,
  type SaveQueueState,
} from '@drawnixstore/domain';
import type { PlaitBoard } from '@plait/core';
import { Archive, ArrowLeft, Pencil, Save, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getCanvasSaveRetryDelay } from '../bff-client';
import { exportCanvasSvg } from '../drawnix-svg';
import { PendingCanvasStore, type PendingCanvasSave } from './pending-canvas-store';
import type { CanvasRecord } from './types';

export type { PendingCanvasSave } from './pending-canvas-store';

interface CanvasEditorProps {
  canvas: CanvasRecord;
  onBack: () => void;
  /** 返回服务端确认的 revision，供同一串行队列的下一项使用。 */
  onSave: (
    save: PendingCanvasSave,
    nextRevision: number,
    isEditorActive: () => boolean
  ) => Promise<number>;
  /** 浏览器离线副本不可用时提示用户，但不阻断仍可成功的服务端保存。 */
  onStorageWarning: (message: string) => void;
  onRename: () => void;
  onArchive: () => void;
  onShare: () => void;
}

const SAVE_DELAY = 900;

/** 显示单个 Drawnix 编辑器，负责自动保存、离线保留与网络恢复重试。 */
export function CanvasEditor({
  canvas,
  onBack,
  onSave,
  onStorageWarning,
  onRename,
  onArchive,
  onShare,
}: CanvasEditorProps) {
  const [snapshot, setSnapshot] = useState<CanvasSnapshot>(() =>
    parseCanvasSnapshot(canvas.snapshot)
  );
  const [isPendingSaveLoaded, setIsPendingSaveLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveQueueState>('idle');
  const snapshotRef = useRef(snapshot);
  const initialPendingRef = useRef<PendingCanvasSave | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const boardRef = useRef<PlaitBoard | null>(null);
  const documentVersionRef = useRef(0);
  const isActiveRef = useRef(true);
  const storageWarningShownRef = useRef(false);
  // 队列可能在 React 提交上一条保存状态前继续 drain，revision 不能依赖下一次渲染才更新。
  const revisionRef = useRef(canvas.revision);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const storageWarningRef = useRef(onStorageWarning);
  storageWarningRef.current = onStorageWarning;
  const queueRef = useRef<SaveQueue<PendingCanvasSave> | null>(null);
  const pendingStoreRef = useRef<PendingCanvasStore | null>(null);

  if (!pendingStoreRef.current) pendingStoreRef.current = new PendingCanvasStore(canvas.id);

  /** 离线副本写入失败不阻断服务端保存，但必须明确告知用户不要在未同步前关闭页面。 */
  function reportStorageWarning() {
    if (!isActiveRef.current || storageWarningShownRef.current) return;
    storageWarningShownRef.current = true;
    storageWarningRef.current('浏览器离线副本无法写入，请保持页面打开直到画布显示“已保存”。');
  }

  /** 串行写入 IndexedDB，失败后继续执行网络保存，避免本地配额导致自动保存完全中断。 */
  async function persistPendingSave(save: PendingCanvasSave) {
    try {
      await pendingStoreRef.current?.write(save);
      storageWarningShownRef.current = false;
    } catch {
      reportStorageWarning();
    }
  }

  /** 仅删除仍与本次服务端成功项一致的副本，写删异常不会触发重复网络保存。 */
  async function clearPendingSave(save: PendingCanvasSave) {
    try {
      await pendingStoreRef.current?.clearIfCurrent(save);
      storageWarningShownRef.current = false;
    } catch {
      reportStorageWarning();
    }
  }

  /**
   * 在需要时创建本编辑器实例的保存队列。
   * React Strict Mode 会在开发环境模拟一次 effect 清理再初始化，因此清理后必须允许新生命周期重建队列。
   */
  function ensureSaveQueue(): SaveQueue<PendingCanvasSave> {
    if (!queueRef.current) {
      queueRef.current = new SaveQueue<PendingCanvasSave>({
        isOnline: () => navigator.onLine,
        save: async (next) => {
          const savedRevision = await saveRef.current(
            next,
            revisionRef.current + 1,
            () => isActiveRef.current
          );
          // 编辑器已经卸载时保留副本给下一实例恢复，不再清理或更新本地 revision。
          if (!isActiveRef.current) return;
          revisionRef.current = savedRevision;
          await clearPendingSave(next);
        },
        getRetryDelay: getCanvasSaveRetryDelay,
        onStateChange: setSaveState,
      });
    }
    return queueRef.current;
  }
  ensureSaveQueue();

  useEffect(() => {
    let active = true;
    void pendingStoreRef.current
      ?.read()
      .then((pendingSave) => {
        if (!active || !pendingSave) return;
        initialPendingRef.current = pendingSave;
        const restoredSnapshot = parseCanvasSnapshot(pendingSave.snapshot);
        snapshotRef.current = restoredSnapshot;
        setSnapshot(restoredSnapshot);
      })
      .catch(() => reportStorageWarning())
      .finally(() => {
        if (active) setIsPendingSaveLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    isActiveRef.current = true;
    ensureSaveQueue();
    const retry = () => void ensureSaveQueue().flush();
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!ensureSaveQueue().hasPending() && saveTimerRef.current === null) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('online', retry);
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      isActiveRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      const queue = queueRef.current;
      queue?.dispose();
      if (queueRef.current === queue) queueRef.current = null;
      window.removeEventListener('online', retry);
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, []);

  /** 暂存最新快照，并在防抖窗口结束后通过串行队列提交。 */
  function scheduleSave(next: CanvasSnapshot) {
    documentVersionRef.current += 1;
    snapshotRef.current = next;
    setSnapshot(next);
    const serialized = serializeCanvasSnapshot(next);
    void persistPendingSave({ snapshot: serialized });
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(
      () => void flushCurrentSnapshot().catch(() => undefined),
      SAVE_DELAY
    );
  }

  /** 用户主动保存时跳过防抖，并等待同一串行队列完成当前快照。 */
  async function flushCurrentSnapshot() {
    if (!isActiveRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const documentVersion = documentVersionRef.current;
    const save: PendingCanvasSave = { snapshot: serializeCanvasSnapshot(snapshotRef.current) };
    if (boardRef.current) save.previewSvg = await exportCanvasSvg(boardRef.current);
    // SVG 导出或离线副本写入期间可能已卸载，不能为旧实例重新创建队列。
    if (!isActiveRef.current) return;
    // 导出期间若有新编辑，丢弃旧 SVG；新编辑的防抖任务会提交匹配的快照与预览。
    if (documentVersion !== documentVersionRef.current) return flushCurrentSnapshot();
    await persistPendingSave(save);
    if (!isActiveRef.current) return;
    const queue = ensureSaveQueue();
    await queue.enqueue(save);
    if (queue.hasPending()) throw new Error('当前画布尚未保存，无法继续操作。');
  }

  /** 用户主动保存时跳过防抖，失败状态继续显示在编辑器头部。 */
  function saveNow() {
    void flushCurrentSnapshot().catch(() => undefined);
  }

  /** 归档前必须把防抖中的最新编辑落盘，避免卸载时丢失快照。 */
  function requestArchive() {
    void flushCurrentSnapshot()
      .then(() => {
        if (isActiveRef.current) onArchive();
      })
      .catch(() => undefined);
  }

  /** 分享同样使用最后成功保存的 SVG，确保新打开的链接不会展示旧预览。 */
  function requestShare() {
    void flushCurrentSnapshot()
      .then(() => {
        if (isActiveRef.current) onShare();
      })
      .catch(() => undefined);
  }

  const stateText = {
    idle: '已保存',
    saving: '保存中',
    offline: '离线待保存',
    retrying: '正在重试',
    error: '保存失败',
  }[saveState];

  if (!isPendingSaveLoaded) return <main aria-busy="true" className="editor-page" />;

  return (
    <main className="editor-page">
      <header className="editor-header">
        <button className="icon-button" type="button" title="返回画布列表" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <h1>{canvas.title}</h1>
        <span className={`save-state save-state--${saveState}`}>{stateText}</span>
        <button className="icon-button" type="button" title="重命名画布" onClick={onRename}>
          <Pencil aria-hidden="true" size={17} />
        </button>
        <button className="icon-button" type="button" title="归档画布" onClick={requestArchive}>
          <Archive aria-hidden="true" size={17} />
        </button>
        <button className="icon-button" type="button" title="分享画布" onClick={requestShare}>
          <Share2 aria-hidden="true" size={17} />
        </button>
        <button
          className="button button--primary editor-save"
          type="button"
          title="立即保存"
          onClick={saveNow}
        >
          <Save aria-hidden="true" size={17} />
          <span>保存</span>
        </button>
      </header>
      <section className="editor-surface" aria-label="画布编辑器">
        <Drawnix
          value={snapshot.children as never}
          viewport={snapshot.viewport as never}
          theme={snapshot.theme as never}
          initialToolState={snapshot.toolState as Partial<DrawnixToolState>}
          initialLanguage="zh"
          onChange={(value) => {
            const next = value as unknown as Omit<CanvasSnapshot, 'formatVersion' | 'toolState'>;
            scheduleSave({ ...next, toolState: snapshotRef.current.toolState, formatVersion: 1 });
          }}
          onToolStateChange={(toolState) => {
            snapshotRef.current = { ...snapshotRef.current, toolState };
          }}
          afterInit={(board) => {
            boardRef.current = board;
            if (initialPendingRef.current) void flushCurrentSnapshot().catch(() => undefined);
          }}
        />
      </section>
    </main>
  );
}
