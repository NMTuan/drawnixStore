/// <reference types="vitest/globals" />
/** 验证浏览器 BFF 客户端的同源请求与存储 DTO 映射，防止重新引入 PocketBase 直连。 */
import { afterEach, expect, it, vi } from 'vitest';
import { bff } from './bff-client';

afterEach(() => vi.unstubAllGlobals());

it('将 BFF Canvas DTO 映射为编辑器使用的记录，并携带同源 Cookie', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        canvas: {
          id: 'canvas-1',
          workspaceId: 'workspace-1',
          title: '画布',
          snapshot: '{}',
          previewSvg: '<svg/>',
          shareToken: 'a'.repeat(48),
          shareEnabled: false,
          archived: false,
          revision: 2,
          created: '2026-01-01 00:00:00.000Z',
          updated: '2026-01-01 00:00:00.000Z',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(bff.getCanvas('canvas-1')).resolves.toMatchObject({
    workspace: 'workspace-1',
    preview_svg: '<svg/>',
    share_token: 'a'.repeat(48),
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/canvases/canvas-1', {
    credentials: 'same-origin',
    headers: {},
  });
});

it('通过 BFF 登录而不在浏览器处理 PocketBase token', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ user: { id: 'user-1', email: 'user@example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(bff.login('user@example.com', 'password-123')).resolves.toEqual({
    id: 'user-1',
    email: 'user@example.com',
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: 'password-123' }),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
});

it('通过同源 BFF 提交一次性初始化令牌且不保存 token', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ user: { id: 'user-1', email: 'owner@example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(bff.setup('owner@example.com', 'password-123', 'setup-token')).resolves.toEqual({
    id: 'user-1',
    email: 'owner@example.com',
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'password-123',
      token: 'setup-token',
    }),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
});

it('通过受登录保护的 BFF 解析分享页编辑入口', async () => {
  const token = 'a'.repeat(48);
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ canvasId: 'canvas-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(bff.getSharedCanvasForEditing(token)).resolves.toBe('canvas-1');
  expect(fetchMock).toHaveBeenCalledWith(`/api/share/${token}`, {
    credentials: 'same-origin',
    headers: {},
  });
});
