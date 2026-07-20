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
} from '@tlstore/domain';
import { Archive, ArrowLeft, Pencil, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasRecord } from './types';

interface CanvasEditorProps {
  canvas: CanvasRecord;
  onBack: () => void;
  onSave: (snapshot: string) => Promise<void>;
  onRename: () => void;
  onArchive: () => void;
}

const SAVE_DELAY = 900;

/** 返回 Canvas 专用的离线快照存储键，避免不同画布相互覆盖。 */
function pendingSnapshotKey(canvasId: string): string {
  return `tlstore:pending-canvas:${canvasId}`;
}

/** 读取待保存数据；错误或旧格式均由领域层降级为合法空白快照。 */
function readPendingSnapshot(canvas: CanvasRecord): CanvasSnapshot {
  return parseCanvasSnapshot(
    localStorage.getItem(pendingSnapshotKey(canvas.id)) || canvas.snapshot
  );
}

/** 显示单个 Drawnix 编辑器，负责自动保存、离线保留与网络恢复重试。 */
export function CanvasEditor({ canvas, onBack, onSave, onRename, onArchive }: CanvasEditorProps) {
  const [snapshot, setSnapshot] = useState<CanvasSnapshot>(() => readPendingSnapshot(canvas));
  const [saveState, setSaveState] = useState<SaveQueueState>('idle');
  const snapshotRef = useRef(snapshot);
  const initialPendingRef = useRef(localStorage.getItem(pendingSnapshotKey(canvas.id)));
  const saveTimerRef = useRef<number | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const queueRef = useRef<SaveQueue<string> | null>(null);

  if (!queueRef.current) {
    queueRef.current = new SaveQueue<string>({
      isOnline: () => navigator.onLine,
      save: async (next) => {
        await saveRef.current(next);
        if (localStorage.getItem(pendingSnapshotKey(canvas.id)) === next) {
          localStorage.removeItem(pendingSnapshotKey(canvas.id));
        }
      },
      onStateChange: setSaveState,
    });
  }

  useEffect(() => {
    const retry = () => void queueRef.current?.flush();
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!queueRef.current?.hasPending() && saveTimerRef.current === null) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('online', retry);
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      window.removeEventListener('online', retry);
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (initialPendingRef.current) queueRef.current?.enqueue(initialPendingRef.current);
  }, []);

  /** 暂存最新快照，并在防抖窗口结束后通过串行队列提交。 */
  function scheduleSave(next: CanvasSnapshot) {
    snapshotRef.current = next;
    setSnapshot(next);
    const serialized = serializeCanvasSnapshot(next);
    localStorage.setItem(pendingSnapshotKey(canvas.id), serialized);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(
      () => queueRef.current?.enqueue(serialized),
      SAVE_DELAY
    );
  }

  /** 用户主动保存时跳过防抖，并等待同一串行队列完成当前快照。 */
  async function flushCurrentSnapshot() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const serialized = serializeCanvasSnapshot(snapshotRef.current);
    localStorage.setItem(pendingSnapshotKey(canvas.id), serialized);
    await queueRef.current?.enqueue(serialized);
    if (queueRef.current?.hasPending()) throw new Error('当前画布尚未保存，无法继续操作。');
  }

  /** 用户主动保存时跳过防抖，失败状态继续显示在编辑器头部。 */
  function saveNow() {
    void flushCurrentSnapshot();
  }

  /** 归档前必须把防抖中的最新编辑落盘，避免卸载时丢失快照。 */
  function requestArchive() {
    void flushCurrentSnapshot()
      .then(onArchive)
      .catch(() => undefined);
  }

  const stateText = {
    idle: '已保存',
    saving: '保存中',
    offline: '离线待保存',
    error: '保存失败',
  }[saveState];

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
        />
      </section>
    </main>
  );
}
