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
import { exportCanvasSvg } from '../drawnix-svg';
import type { CanvasRecord } from './types';

interface CanvasEditorProps {
  canvas: CanvasRecord;
  onBack: () => void;
  onSave: (save: PendingCanvasSave) => Promise<void>;
  onRename: () => void;
  onArchive: () => void;
  onShare: () => void;
}

const SAVE_DELAY = 900;

/** 单个保存项将源快照与同一次编辑生成的 SVG 预览关联起来。 */
export interface PendingCanvasSave {
  snapshot: string;
  previewSvg?: string;
}

/** 返回 Canvas 专用的离线快照存储键，避免不同画布相互覆盖。 */
function pendingSnapshotKey(canvasId: string): string {
  return `drawnixstore:pending-canvas:${canvasId}`;
}

/** 读取待保存数据；错误或旧格式均由领域层降级为合法空白快照。 */
function readPendingSave(canvas: CanvasRecord): PendingCanvasSave | null {
  const raw = localStorage.getItem(pendingSnapshotKey(canvas.id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingCanvasSave;
    if (typeof parsed.snapshot === 'string') return parsed;
  } catch {
    // 兼容早期仅保存字符串快照的本地待保存数据。
  }
  return { snapshot: raw };
}

/** 将离线项写入本地存储，服务端成功保存同一项后才移除。 */
function writePendingSave(canvasId: string, save: PendingCanvasSave) {
  localStorage.setItem(pendingSnapshotKey(canvasId), JSON.stringify(save));
}

/** 显示单个 Drawnix 编辑器，负责自动保存、离线保留与网络恢复重试。 */
export function CanvasEditor({
  canvas,
  onBack,
  onSave,
  onRename,
  onArchive,
  onShare,
}: CanvasEditorProps) {
  const pendingSave = readPendingSave(canvas);
  const [snapshot, setSnapshot] = useState<CanvasSnapshot>(() =>
    parseCanvasSnapshot(pendingSave?.snapshot || canvas.snapshot)
  );
  const [saveState, setSaveState] = useState<SaveQueueState>('idle');
  const snapshotRef = useRef(snapshot);
  const initialPendingRef = useRef(pendingSave);
  const saveTimerRef = useRef<number | null>(null);
  const boardRef = useRef<PlaitBoard | null>(null);
  const documentVersionRef = useRef(0);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const queueRef = useRef<SaveQueue<PendingCanvasSave> | null>(null);

  if (!queueRef.current) {
    queueRef.current = new SaveQueue<PendingCanvasSave>({
      isOnline: () => navigator.onLine,
      save: async (next) => {
        await saveRef.current(next);
        if (localStorage.getItem(pendingSnapshotKey(canvas.id)) === JSON.stringify(next)) {
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

  /** 暂存最新快照，并在防抖窗口结束后通过串行队列提交。 */
  function scheduleSave(next: CanvasSnapshot) {
    documentVersionRef.current += 1;
    snapshotRef.current = next;
    setSnapshot(next);
    const serialized = serializeCanvasSnapshot(next);
    writePendingSave(canvas.id, { snapshot: serialized });
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void flushCurrentSnapshot(), SAVE_DELAY);
  }

  /** 用户主动保存时跳过防抖，并等待同一串行队列完成当前快照。 */
  async function flushCurrentSnapshot() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const documentVersion = documentVersionRef.current;
    const save: PendingCanvasSave = { snapshot: serializeCanvasSnapshot(snapshotRef.current) };
    if (boardRef.current) save.previewSvg = await exportCanvasSvg(boardRef.current);
    // 导出期间若有新编辑，丢弃旧 SVG；新编辑的防抖任务会提交匹配的快照与预览。
    if (documentVersion !== documentVersionRef.current) return flushCurrentSnapshot();
    writePendingSave(canvas.id, save);
    await queueRef.current?.enqueue(save);
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

  /** 分享同样使用最后成功保存的 SVG，确保新打开的链接不会展示旧预览。 */
  function requestShare() {
    void flushCurrentSnapshot()
      .then(onShare)
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
            if (initialPendingRef.current)
              void flushCurrentSnapshot().catch(() => setSaveState('error'));
          }}
        />
      </section>
    </main>
  );
}
