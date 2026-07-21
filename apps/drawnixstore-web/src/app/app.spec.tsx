/// <reference types="vitest/globals" />
/** Drawnix Store 根组件的会话状态测试，浏览器只通过同源 BFF 获取会话。 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

const bffMock = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
}));

vi.mock('../bff-client', () => ({ bff: bffMock }));

import App from './app';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    bffMock.listWorkspaces.mockReset().mockResolvedValue([]);
    bffMock.logout.mockReset().mockResolvedValue(undefined);
    bffMock.session.mockReset().mockRejectedValue(new Error('未登录'));
  });

  it('没有会话时显示登录入口', async () => {
    render(<App />);

    expect(await screen.findByText('欢迎回来')).toBeTruthy();
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
});
