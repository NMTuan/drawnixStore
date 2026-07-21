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

/** 对 BFF 进行同源 JSON 请求，并把服务端安全错误统一转为界面可展示的 Error。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | (T & { statusMessage?: string; message?: string })
    | null;
  if (!response.ok)
    throw new Error(body?.statusMessage || body?.message || '请求失败，请稍后重试。');
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
