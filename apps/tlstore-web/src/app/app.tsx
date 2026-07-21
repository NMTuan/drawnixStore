/**
 * tlStore 根组件管理认证、唯一 URL、工作区导航及 Canvas 生命周期。
 * 编辑器仅通过 Drawnix 的公开 Props 和回调接入，私有数据授权由 PocketBase rule 执行。
 */
import { createEmptyCanvasSnapshot, serializeCanvasSnapshot } from '@tlstore/domain';
import {
  Archive,
  ArchiveRestore,
  FilePlus2,
  FolderPlus,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bff } from '../bff-client';
import { CanvasEditor, type PendingCanvasSave } from './canvas-editor';
import { CanvasSvg } from './canvas-svg';
import { ConfirmDialog, ShareDialog, TextDialog } from './dialogs';
import type { CanvasRecord, WorkspaceRecord } from './types';

type CanvasView = 'active' | 'archived';
type DialogState =
  | { kind: 'create-workspace' }
  | { kind: 'rename-workspace'; value: string }
  | { kind: 'rename-canvas'; canvas: CanvasRecord }
  | null;

/** 将浏览器地址更新为资源 URL，并触发页面数据加载。 */
function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** 将服务端异常收敛为面向用户的简短提示。 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试。';
}

/** 格式化 Canvas 的更新时间，方便用户扫描列表。 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** 分享 SVG 始终由同源 BFF 返回，浏览器不直接连接 PocketBase。 */
function embedSvgUrl(token: string): string {
  return `${window.location.origin}/embed/${token}.svg`;
}

/** 匿名分享页仅加载 SVG 图片，不能读取 Canvas JSON 或挂载编辑器。 */
function ShareCanvasPage({ token }: { token: string }) {
  return (
    <main className="share-page">
      <header>
        <strong>tlStore</strong>
        <span>只读分享</span>
      </header>
      <img alt="Canvas preview" src={embedSvgUrl(token)} />
    </main>
  );
}

/** 提供账户入口、工作区与 Canvas 管理，并根据 URL 打开唯一资源。 */
export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [authenticated, setAuthenticated] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [canvases, setCanvases] = useState<CanvasRecord[]>([]);
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [canvasView, setCanvasView] = useState<CanvasView>('active');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [archiveTarget, setArchiveTarget] = useState<CanvasRecord | null>(null);
  const [shareCanvas, setShareCanvas] = useState<CanvasRecord | null>(null);
  const [error, setError] = useState('');
  const loadRequestIdRef = useRef(0);
  const loadPathRef = useRef<(requestId: number) => Promise<void>>(async () => undefined);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  useEffect(() => {
    let active = true;
    void bff
      .session()
      .then(() => active && setAuthenticated(true))
      .catch(() => active && setAuthenticated(false));
    return () => {
      active = false;
    };
  }, []);

  /** 根据当前 URL 加载工作区或 Canvas，PocketBase rule 会拒绝非 owner 请求。 */
  async function loadPath(requestId: number) {
    const canvasId = pathname.match(/^\/canvases\/([^/]+)$/)?.[1];
    const workspaceId = pathname.match(/^\/workspaces\/([^/]+)$/)?.[1];
    try {
      const records = await bff.listWorkspaces();
      if (requestId !== loadRequestIdRef.current) return;
      setWorkspaces(records);
      if (canvasId) {
        const target = await bff.getCanvas(canvasId);
        if (requestId !== loadRequestIdRef.current) return;
        const ownerWorkspace = records.find((item) => item.id === target.workspace);
        if (!ownerWorkspace) throw new Error('找不到该画布所属的工作区。');
        await selectWorkspace(ownerWorkspace, 'active', requestId);
        if (requestId !== loadRequestIdRef.current) return;
        setCanvas(target);
        return;
      }
      if (workspaceId) {
        const target = records.find((item) => item.id === workspaceId);
        // 新账户可能继承登录前浏览器保留的其他用户工作区 URL，此时回到首次使用界面。
        if (records.length === 0) {
          navigate('/');
          return;
        }
        if (!target) throw new Error('找不到该工作区。');
        await selectWorkspace(target, 'active', requestId);
        return;
      }
      if (records[0] && requestId === loadRequestIdRef.current) {
        navigate(`/workspaces/${records[0].id}`);
      }
    } catch (cause) {
      if (requestId === loadRequestIdRef.current) setError(errorMessage(cause));
    }
  }
  loadPathRef.current = loadPath;

  useEffect(() => {
    if (!authenticated) {
      loadRequestIdRef.current += 1;
      setWorkspaces([]);
      setWorkspace(null);
      setCanvases([]);
      setCanvas(null);
      return;
    }
    const requestId = ++loadRequestIdRef.current;
    void loadPathRef.current(requestId);
  }, [authenticated, pathname]);

  /** 进入工作区只更新 last_accessed，不改变按创建时间排列的导航顺序。 */
  async function selectWorkspace(next: WorkspaceRecord, view: CanvasView, requestId?: number) {
    const updated = await bff.updateWorkspace(next.id, { lastAccessed: new Date().toISOString() });
    if (requestId !== undefined && requestId !== loadRequestIdRef.current) return;
    setWorkspace(updated);
    setCanvas(null);
    setCanvasView(view);
    await loadCanvases(updated.id, view, requestId);
  }

  /** 活跃与归档状态使用同一列表规则，始终按最后更新时间倒序。 */
  async function loadCanvases(workspaceId: string, view: CanvasView, requestId?: number) {
    const records = await bff.listCanvases(workspaceId, view === 'archived');
    if (requestId !== undefined && requestId !== loadRequestIdRef.current) return;
    setCanvases(records);
  }

  /** 创建工作区后立即进入，避免用户还需在侧栏定位新记录。 */
  async function createWorkspace(name: string) {
    try {
      const created = await bff.createWorkspace(name);
      setWorkspaces((current) => [created, ...current]);
      navigate(`/workspaces/${created.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  /** 更新当前工作区名称并同步侧栏，不触发排序变化。 */
  async function renameWorkspace(name: string) {
    if (!workspace || name === workspace.name) return;
    try {
      const updated = await bff.updateWorkspace(workspace.id, { name });
      setWorkspace(updated);
      setWorkspaces((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  /** 新 Canvas 从稳定的空白 Drawnix 快照开始，保证首次打开就能恢复。 */
  async function createCanvas() {
    if (!workspace) return;
    try {
      const created = await bff.createCanvas(
        workspace.id,
        '未命名画布',
        serializeCanvasSnapshot(createEmptyCanvasSnapshot())
      );
      navigate(`/canvases/${created.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  /** 更新 Canvas 名称并同步列表及已打开的编辑器标题。 */
  async function renameCanvas(target: CanvasRecord, name: string) {
    if (name === target.title) return;
    try {
      const updated = await bff.updateCanvas(target.id, { title: name });
      setCanvases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (canvas?.id === updated.id) setCanvas(updated);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  /** 归档保留快照与审计时间，成功后返回当前工作区的活跃列表。 */
  async function archiveCanvas(target: CanvasRecord) {
    try {
      await bff.updateCanvas(target.id, { archived: true });
      if (workspace) await loadCanvases(workspace.id, canvasView);
      if (canvas?.id === target.id) navigate(`/workspaces/${target.workspace}`);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  /** 恢复归档 Canvas 后重新加载当前归档视图，使该记录立即从列表移除。 */
  async function restoreCanvas(target: CanvasRecord) {
    try {
      await bff.updateCanvas(target.id, { archived: false });
      if (workspace) await loadCanvases(workspace.id, 'archived');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  /** 成功保存后的服务端记录覆盖本地状态，明确采用最后成功保存优先语义。 */
  async function saveCanvas(save: PendingCanvasSave) {
    if (!canvas) throw new Error('当前画布已关闭，无法保存。');
    try {
      const update: {
        snapshot: string;
        revision: number;
        previewSvg?: string;
        shareEnabled?: boolean;
      } = {
        snapshot: save.snapshot,
        revision: canvas.revision + 1,
      };
      // 图片会以内嵌 Data URL 进入 SVG；超限时关闭分享，避免旧预览继续公开。
      if (save.previewSvg && save.previewSvg.length > 10_000_000) {
        update.previewSvg = '';
        update.shareEnabled = false;
        setError('SVG 预览超过 10 MB，已保存画布快照并关闭分享。');
      } else if (save.previewSvg) {
        update.previewSvg = save.previewSvg;
      }
      const updated = await bff.updateCanvas(canvas.id, update);
      setCanvas(updated);
      setCanvases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  /** 确保 Canvas 拥有稳定的分享 token；仅打开弹窗时生成，默认仍保持关闭。 */
  async function openShare(target: CanvasRecord) {
    try {
      const updated = await bff.ensureShare(target.id);
      if (updated.share_token !== target.share_token) {
        setCanvas((current) => (current?.id === updated.id ? updated : current));
        setCanvases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
      setShareCanvas(updated);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  /** 更新唯一的公开访问开关；API 每次请求都会读取它，因此关闭立即生效。 */
  async function setShareEnabled(target: CanvasRecord, shareEnabled: boolean) {
    try {
      const updated = await bff.updateCanvas(target.id, { shareEnabled });
      setCanvas((current) => (current?.id === updated.id ? updated : current));
      setCanvases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setShareCanvas(updated);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  const shareToken = pathname.match(/^\/share\/([a-f0-9]{48})$/)?.[1];
  if (shareToken) return <ShareCanvasPage token={shareToken} />;
  if (!authenticated)
    return (
      <AuthScreen
        error={error}
        onAuthenticated={() => {
          setError('');
          setAuthenticated(true);
        }}
        onClearError={() => setError('')}
        onError={setError}
      />
    );

  if (canvas) {
    return (
      <>
        <CanvasEditor
          key={canvas.id}
          canvas={canvas}
          onArchive={() => setArchiveTarget(canvas)}
          onBack={() => navigate(`/workspaces/${canvas.workspace}`)}
          onRename={() => setDialog({ kind: 'rename-canvas', canvas })}
          onSave={saveCanvas}
          onShare={() => void openShare(canvas)}
        />
        {error && <ErrorBanner message={error} onClose={() => setError('')} />}
        {dialog?.kind === 'rename-canvas' && (
          <TextDialog
            confirmLabel="保存"
            description="为这张画布使用一个便于检索的名称。"
            initialValue={dialog.canvas.title}
            label="画布名称"
            title="重命名画布"
            onClose={() => setDialog(null)}
            onConfirm={(name) => renameCanvas(dialog.canvas, name)}
          />
        )}
        {archiveTarget && (
          <ArchiveDialog
            canvas={archiveTarget}
            onClose={() => setArchiveTarget(null)}
            onConfirm={archiveCanvas}
          />
        )}
        {shareCanvas && (
          <ShareDialog
            embedUrl={embedSvgUrl(shareCanvas.share_token)}
            enabled={shareCanvas.share_enabled}
            url={`${window.location.origin}/share/${shareCanvas.share_token}`}
            onClose={() => setShareCanvas(null)}
            onEnabledChange={(enabled) => setShareEnabled(shareCanvas, enabled)}
          />
        )}
      </>
    );
  }

  return (
    <main className="workspace-page">
      <header className="app-header">
        <button className="brand" type="button" onClick={() => navigate('/')}>
          tlStore
        </button>
        <div className="app-header__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={() => setDialog({ kind: 'create-workspace' })}
          >
            <FolderPlus aria-hidden="true" size={17} />
            <span>新建工作区</span>
          </button>
          <button
            className="icon-button"
            title="退出登录"
            type="button"
            onClick={() =>
              void bff
                .logout()
                .then(() => setAuthenticated(false))
                .catch((cause) => setError(errorMessage(cause)))
            }
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </header>
      {error && <ErrorBanner message={error} onClose={() => setError('')} />}
      <div className="workspace-layout">
        <aside className="workspace-nav">
          <div className="workspace-nav__title">
            <span>工作区</span>
            <small>{workspaces.length}</small>
          </div>
          <nav aria-label="工作区列表">
            {workspaces.map((item, index) => (
              <button
                className={
                  item.id === workspace?.id
                    ? 'workspace-link workspace-link--selected'
                    : 'workspace-link'
                }
                key={item.id}
                type="button"
                onClick={() => navigate(`/workspaces/${item.id}`)}
              >
                <i className={`workspace-link__mark workspace-link__mark--${index % 4}`} />
                <span>{item.name}</span>
              </button>
            ))}
            <button
              className="workspace-add"
              type="button"
              onClick={() => setDialog({ kind: 'create-workspace' })}
            >
              <Plus aria-hidden="true" size={16} /> 添加工作区
            </button>
          </nav>
        </aside>
        <section className="canvas-list">
          {workspace ? (
            <>
              <div className="canvas-list__header">
                <div>
                  <div className="section-label">当前工作区</div>
                  <div className="workspace-heading">
                    <h1>{workspace.name}</h1>
                    <button
                      className="icon-button"
                      title="重命名工作区"
                      type="button"
                      onClick={() => setDialog({ kind: 'rename-workspace', value: workspace.name })}
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void createCanvas()}
                >
                  <FilePlus2 aria-hidden="true" size={17} /> 新建画布
                </button>
              </div>
              <div className="canvas-tabs" role="tablist" aria-label="Canvas 状态">
                <button
                  className={canvasView === 'active' ? 'is-active' : ''}
                  role="tab"
                  type="button"
                  onClick={() => {
                    if (workspace) {
                      setCanvasView('active');
                      void loadCanvases(workspace.id, 'active');
                    }
                  }}
                >
                  画布
                </button>
                <button
                  className={canvasView === 'archived' ? 'is-active' : ''}
                  role="tab"
                  type="button"
                  onClick={() => {
                    if (workspace) {
                      setCanvasView('archived');
                      void loadCanvases(workspace.id, 'archived');
                    }
                  }}
                >
                  归档
                </button>
              </div>
              <CanvasGrid
                canvases={canvases}
                view={canvasView}
                onArchive={setArchiveTarget}
                onOpen={(item) => navigate(`/canvases/${item.id}`)}
                onRename={(item) => setDialog({ kind: 'rename-canvas', canvas: item })}
                onRestore={restoreCanvas}
              />
            </>
          ) : (
            <EmptyWorkspace onCreate={() => setDialog({ kind: 'create-workspace' })} />
          )}
        </section>
      </div>
      {dialog?.kind === 'create-workspace' && (
        <TextDialog
          confirmLabel="创建"
          description="工作区用于组织彼此独立的画布。"
          label="工作区名称"
          title="新建工作区"
          onClose={() => setDialog(null)}
          onConfirm={createWorkspace}
        />
      )}
      {dialog?.kind === 'rename-workspace' && (
        <TextDialog
          confirmLabel="保存"
          description="更新后的名称将立即显示在导航中。"
          initialValue={dialog.value}
          label="工作区名称"
          title="重命名工作区"
          onClose={() => setDialog(null)}
          onConfirm={renameWorkspace}
        />
      )}
      {dialog?.kind === 'rename-canvas' && (
        <TextDialog
          confirmLabel="保存"
          description="为这张画布使用一个便于检索的名称。"
          initialValue={dialog.canvas.title}
          label="画布名称"
          title="重命名画布"
          onClose={() => setDialog(null)}
          onConfirm={(name) => renameCanvas(dialog.canvas, name)}
        />
      )}
      {archiveTarget && (
        <ArchiveDialog
          canvas={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onConfirm={archiveCanvas}
        />
      )}
      {shareCanvas && (
        <ShareDialog
          embedUrl={embedSvgUrl(shareCanvas.share_token)}
          enabled={shareCanvas.share_enabled}
          url={`${window.location.origin}/share/${shareCanvas.share_token}`}
          onClose={() => setShareCanvas(null)}
          onEnabledChange={(enabled) => setShareEnabled(shareCanvas, enabled)}
        />
      )}
    </main>
  );
}

/** 以卡片展示 Canvas；预览仅使用已保存 SVG，不在列表中初始化编辑器。 */
function CanvasGrid({
  canvases,
  view,
  onOpen,
  onRename,
  onArchive,
  onRestore,
}: {
  canvases: CanvasRecord[];
  view: CanvasView;
  onOpen: (canvas: CanvasRecord) => void;
  onRename: (canvas: CanvasRecord) => void;
  onArchive: (canvas: CanvasRecord) => void;
  onRestore: (canvas: CanvasRecord) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  if (canvases.length === 0)
    return (
      <div className="empty-state">
        {view === 'active' ? '这个工作区还没有画布。' : '没有归档的画布。'}
      </div>
    );
  return (
    <div className="canvas-grid">
      {canvases.map((item) => (
        <article className="canvas-card" key={item.id}>
          <button
            className="canvas-card__open"
            disabled={view === 'archived'}
            type="button"
            onClick={() => onOpen(item)}
          >
            <div className="canvas-card__preview">
              {item.preview_svg ? (
                <CanvasSvg
                  alt={`${item.title} 的预览`}
                  className="canvas-card__svg"
                  svg={item.preview_svg}
                />
              ) : (
                <span>空白画布</span>
              )}
              <i />
            </div>
            <div className="canvas-card__info">
              <strong>{item.title}</strong>
              <span>修改于 {formatTime(item.updated)}</span>
            </div>
          </button>
          <div className="canvas-card__footer">
            <span>
              {view === 'archived' ? '已归档' : item.share_enabled ? '已分享' : '私有画布'}
            </span>
            <div className="canvas-menu">
              <button
                className="icon-button"
                title="画布操作"
                type="button"
                onClick={() => setMenuId((current) => (current === item.id ? null : item.id))}
              >
                <MoreHorizontal aria-hidden="true" size={18} />
              </button>
              {menuId === item.id && (
                <div className="canvas-menu__items">
                  {view === 'active' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuId(null);
                          onRename(item);
                        }}
                      >
                        <Pencil aria-hidden="true" size={15} />
                        重命名
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => {
                          setMenuId(null);
                          onArchive(item);
                        }}
                      >
                        <Archive aria-hidden="true" size={15} />
                        归档
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        onRestore(item);
                      }}
                    >
                      <ArchiveRestore aria-hidden="true" size={15} />
                      恢复画布
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** 首次使用时引导用户创建内容容器。 */
function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="first-workspace">
      <span>
        <FolderPlus aria-hidden="true" size={22} />
      </span>
      <div className="section-label">开始整理</div>
      <h1>创建第一个工作区</h1>
      <p>用工作区分隔不同主题的 Canvas，让每一次绘制都保留清晰的上下文。</p>
      <button className="button button--primary" type="button" onClick={onCreate}>
        <FolderPlus aria-hidden="true" size={17} />
        新建工作区
      </button>
    </div>
  );
}

/** 错误横幅可关闭，避免遮挡编辑或列表操作。 */
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <p>{message}</p>
      <button className="icon-button" title="关闭提示" type="button" onClick={onClose}>
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

/** 归档确认独立封装，使编辑器与列表共享一致的后果说明。 */
function ArchiveDialog({
  canvas,
  onClose,
  onConfirm,
}: {
  canvas: CanvasRecord;
  onClose: () => void;
  onConfirm: (canvas: CanvasRecord) => Promise<void>;
}) {
  return (
    <ConfirmDialog
      confirmLabel="归档画布"
      description={`“${canvas.title}”将从当前画布列表移至归档区，其内容会被保留并可随时恢复。`}
      title="归档这张画布？"
      onClose={onClose}
      onConfirm={() => onConfirm(canvas)}
    />
  );
}

/** 提供参考项目同等的邮箱密码登录与注册入口。 */
function AuthScreen({
  error,
  onAuthenticated,
  onClearError,
  onError,
}: {
  error: string;
  onAuthenticated: () => void;
  onClearError: () => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClearError();
    setSubmitting(true);
    try {
      if (mode === 'register') await bff.register(email, password);
      else await bff.login(email, password);
      onAuthenticated();
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand">tlStore</div>
        <div>
          <div className="section-label">私人画布工作台</div>
          <h1>为还未成形的想法留出空间。</h1>
          <p>创建独立工作区，随时回到每一张 Canvas。绘制、保存与整理都保持在你的掌控中。</p>
        </div>
        <small>tlStore / private canvas archive</small>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="section-label">进入工作台</div>
          <h1>{mode === 'login' ? '欢迎回来' : '创建账户'}</h1>
          <div className="canvas-tabs">
            <button
              className={mode === 'login' ? 'is-active' : ''}
              type="button"
              onClick={() => setMode('login')}
            >
              登录
            </button>
            <button
              className={mode === 'register' ? 'is-active' : ''}
              type="button"
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="password">密码</label>
          <input
            id="password"
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? '处理中' : mode === 'login' ? '登录' : '创建账户'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
