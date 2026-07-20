/// <reference types="vitest/globals" />
/** tlStore 根组件的配置状态测试，避免缺少服务地址时渲染无提示的空页面。 */
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../pocketbase', () => ({
  pocketBaseUrl: undefined,
  pb: {
    authStore: { isValid: false, onChange: vi.fn() },
    autoCancellation: vi.fn(),
  },
}));

import App from './app';

describe('App', () => {
  it('缺少 PocketBase 地址时显示配置提示', () => {
    render(<App />);

    expect(screen.getByText('缺少 `VITE_POCKETBASE_URL` 配置。')).toBeTruthy();
  });
});
