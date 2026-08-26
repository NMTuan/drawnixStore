/** Drawnix Store 浏览器 BFF 客户端：只访问同源 Nitro API，绝不直接连接 PocketBase。 */
import type { CanvasRecord, WorkspaceRecord } from './app/types';

interface ApiWorkspace {
  id: string;
  name: string;
  lastAccessed: string;
  created: string;
  updated: string;
}

interface ApiCanvas {
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

export interface SessionUser {
  id: string;
  email: string;
}

/** 匿名访问时可安全读取的认证入口状态，不包含初始化令牌或用户数量。 */
export interface AuthEntryStatus {
  registrationEnabled: boolean;
  initialSetupAvailable: boolean;
}

/** BFF 返回了可识别 HTTP 状态时使用的错误，保存队列据此区分确定性与临时失败。 */
export class BffRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'BffRequestError';
  }
}

/** 请求未能到达 BFF 或未获得响应时使用的传输错误。 */
export class BffTransportError extends Error {
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message);
    this.name = 'BffTransportError';
  }
}

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

function workspaceRecord(workspace: ApiWorkspace): WorkspaceRecord {
  return {
    id: workspace.id,
    name: workspace.name,
    last_accessed: workspace.lastAccessed,
    created: workspace.created,
    updated: workspace.updated,
  };
}

function canvasRecord(canvas: ApiCanvas): CanvasRecord {
  return {
    id: canvas.id,
    workspace: canvas.workspaceId,
    title: canvas.title,
    snapshot: canvas.snapshot,
    preview_svg: canvas.previewSvg,
    share_token: canvas.shareToken,
    share_enabled: canvas.shareEnabled,
    archived: canvas.archived,
    revision: canvas.revision,
    created: canvas.created,
    updated: canvas.updated,
  };
}

/** 将代理返回的状态转换为可读提示；Nginx 的 HTML 错页也能保留其 HTTP 语义。 */
function requestErrorMessage(
  status: number,
  body: { statusMessage?: string; message?: string } | null
) {
  if (body?.statusMessage || body?.message) return body.statusMessage || body.message || '';
  if (status === 413) return '请求内容超过允许大小，请减少画布内容或图片后重新保存。';
  if (status === 429) return '请求过于频繁，正在稍后重试。';
  if (status >= 500) return '服务暂时不可用，正在稍后重试。';
  return '请求失败，请稍后重试。';
}

/** 解析服务端 Retry-After，并将自动重试等待时间限制在一个可控范围内。 */
function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(Math.max(seconds * 1_000, INITIAL_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return undefined;
  return Math.min(Math.max(retryAt - Date.now(), INITIAL_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
}

/** 返回 Canvas 保存失败的自动重试等待时间；null 表示相同请求重试没有意义。 */
export function getCanvasSaveRetryDelay(error: unknown, attempt: number): number | null {
  if (error instanceof BffRequestError) {
    const retryableStatus = error.status === 408 || error.status === 429 || error.status >= 500;
    if (!retryableStatus) return null;
    if (error.status === 429 && error.retryAfterMs !== undefined) return error.retryAfterMs;
  } else if (!(error instanceof BffTransportError)) {
    return null;
  }

  const exponentialDelay = INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
}

/** 对 BFF 进行同源 JSON 请求，并把服务端安全错误统一转为界面可展示的 Error。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch (error) {
    throw new BffTransportError('网络连接异常，请检查网络后重试。', error);
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { statusMessage?: string; message?: string })
    | null;
  if (!response.ok)
    throw new BffRequestError(
      requestErrorMessage(response.status, body),
      response.status,
      retryAfterMilliseconds(response.headers.get('Retry-After'))
    );
  return body as T;
}

/** 所有 Drawnix Store 私有数据操作经由 BFF 路由，浏览器不包含 PocketBase 地址或 token。 */
export const bff = {
  async session(): Promise<SessionUser> {
    return (await request<{ user: SessionUser }>('/auth/session')).user;
  },
  async register(email: string, password: string): Promise<SessionUser> {
    return (
      await request<{ user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    ).user;
  },
  async authEntryStatus(): Promise<AuthEntryStatus> {
    return request<AuthEntryStatus>('/auth/setup-status');
  },
  /** 仅在服务端确认尚无用户且令牌有效时创建首账号；令牌绝不持久化到浏览器。 */
  async setup(email: string, password: string, token: string): Promise<SessionUser> {
    return (
      await request<{ user: SessionUser }>('/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ email, password, token }),
      })
    ).user;
  },
  async login(email: string, password: string): Promise<SessionUser> {
    return (
      await request<{ user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    ).user;
  },
  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' });
  },
  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return (await request<{ workspaces: ApiWorkspace[] }>('/workspaces')).workspaces.map(
      workspaceRecord
    );
  },
  async createWorkspace(name: string): Promise<WorkspaceRecord> {
    return workspaceRecord(
      (
        await request<{ workspace: ApiWorkspace }>('/workspaces', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      ).workspace
    );
  },
  async updateWorkspace(
    id: string,
    update: { name?: string; lastAccessed?: string }
  ): Promise<WorkspaceRecord> {
    return workspaceRecord(
      (
        await request<{ workspace: ApiWorkspace }>(`/workspaces/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(update),
        })
      ).workspace
    );
  },
  async listCanvases(workspaceId: string, archived: boolean): Promise<CanvasRecord[]> {
    return (
      await request<{ canvases: ApiCanvas[] }>(
        `/workspaces/${workspaceId}/canvases?archived=${archived}`
      )
    ).canvases.map(canvasRecord);
  },
  async createCanvas(workspaceId: string, title: string, snapshot: string): Promise<CanvasRecord> {
    return canvasRecord(
      (
        await request<{ canvas: ApiCanvas }>(`/workspaces/${workspaceId}/canvases`, {
          method: 'POST',
          body: JSON.stringify({ title, snapshot }),
        })
      ).canvas
    );
  },
  async getCanvas(id: string): Promise<CanvasRecord> {
    return canvasRecord((await request<{ canvas: ApiCanvas }>(`/canvases/${id}`)).canvas);
  },
  async updateCanvas(
    id: string,
    update: {
      title?: string;
      snapshot?: string;
      previewSvg?: string;
      shareEnabled?: boolean;
      archived?: boolean;
      revision?: number;
    }
  ): Promise<CanvasRecord> {
    return canvasRecord(
      (
        await request<{ canvas: ApiCanvas }>(`/canvases/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(update),
        })
      ).canvas
    );
  },
  async ensureShare(id: string): Promise<CanvasRecord> {
    return canvasRecord(
      (await request<{ canvas: ApiCanvas }>(`/canvases/${id}/share`, { method: 'POST' })).canvas
    );
  },
  /** 仅在当前用户拥有仍在公开分享的 Canvas 时返回其编辑资源 ID。 */
  async getSharedCanvasForEditing(token: string): Promise<string> {
    return (await request<{ canvasId: string }>(`/share/${token}`)).canvasId;
  },
};
