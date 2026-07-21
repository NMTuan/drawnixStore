/// <reference types="vitest/globals" />
/** Drawnix Store 根组件的会话状态测试，浏览器只通过同源 BFF 获取会话。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

const bffMock = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
  authEntryStatus: vi.fn(),
  setup: vi.fn(),
  getSharedCanvasForEditing: vi.fn(),
}));

vi.mock('../bff-client', () => ({ bff: bffMock }));

import App from './app';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    bffMock.listWorkspaces.mockReset().mockResolvedValue([]);
    bffMock.logout.mockReset().mockResolvedValue(undefined);
    bffMock.session.mockReset().mockRejectedValue(new Error('未登录'));
    bffMock.authEntryStatus
      .mockReset()
      .mockResolvedValue({ registrationEnabled: false, initialSetupAvailable: false });
    bffMock.setup.mockReset();
    bffMock.getSharedCanvasForEditing.mockReset().mockRejectedValue(new Error('没有编辑权限'));
  });

  it('没有会话时显示登录入口', async () => {
    render(<App />);

    expect(await screen.findByText('欢迎回来')).toBeTruthy();
  });

  it('没有用户且初始化可用时跳转至首账号创建页', async () => {
    bffMock.authEntryStatus.mockResolvedValue({
      registrationEnabled: false,
      initialSetupAvailable: true,
    });
    render(<App />);

    expect(await screen.findByText('创建首个账户')).toBeTruthy();
    expect(window.location.pathname).toBe('/setup');
  });

  it('空工作区账户访问遗留 URL 时显示首次创建入口', async () => {
    window.history.replaceState({}, '', '/workspaces/previous-user-workspace');
    bffMock.session.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    render(<App />);

    expect(await screen.findByText('创建第一个工作区')).toBeTruthy();
    expect(screen.queryByText('找不到该工作区。')).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('登出失败时保留当前会话并显示错误', async () => {
    bffMock.session.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    bffMock.logout.mockRejectedValue(new Error('登出失败'));
    render(<App />);

    const logoutButton = await screen.findByTitle('退出登录');
    fireEvent.click(logoutButton);

    expect(await screen.findByText('登出失败')).toBeTruthy();
    expect(screen.getByTitle('退出登录')).toBeTruthy();
  });

  it('有效分享页仅为已登录 owner 提供编辑入口', async () => {
    window.history.replaceState({}, '', `/share/${'a'.repeat(48)}`);
    bffMock.session.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    bffMock.getSharedCanvasForEditing.mockResolvedValue('canvas-1');
    render(<App />);

    expect(await screen.findByRole('button', { name: '编辑画布' })).toBeTruthy();
  });

  it('非 owner 访问分享页时不显示编辑入口', async () => {
    const token = 'b'.repeat(48);
    window.history.replaceState({}, '', `/share/${token}`);
    bffMock.session.mockResolvedValue({ id: 'user-2', email: 'other@example.com' });
    render(<App />);

    await waitFor(() => expect(bffMock.getSharedCanvasForEditing).toHaveBeenCalledWith(token));
    expect(screen.queryByRole('button', { name: '编辑画布' })).toBeNull();
  });
});
