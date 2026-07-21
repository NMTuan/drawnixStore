/// <reference types="vitest/globals" />
/** 验证私有部署认证开关、初始化令牌和多实例首账号申领的服务端安全边界。 */
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockClientResponseError extends Error {
    constructor(public status: number) {
      super(`PocketBase error ${status}`);
    }
  }
  return {
    MockClientResponseError,
    runtimeConfig: {
      pocketbaseInternalUrl: 'http://pocketbase:8090',
      pocketbaseSuperuserEmail: 'admin@example.com',
      pocketbaseSuperuserPassword: 'password-123',
      webOrigin: 'https://drawnixstore.example.com',
      registrationEnabled: false,
      setupToken: 'setup-token',
    },
    users: { getList: vi.fn() },
    setup: { create: vi.fn(), delete: vi.fn(), getOne: vi.fn() },
    superusers: { authWithPassword: vi.fn() },
  };
});

vi.mock('nitro/runtime-config', () => ({ useRuntimeConfig: () => mocks.runtimeConfig }));
vi.mock('pocketbase', () => ({
  ClientResponseError: mocks.MockClientResponseError,
  default: class MockPocketBase {
    autoCancellation() {}

    collection(name: string) {
      if (name === '_superusers') return mocks.superusers;
      if (name === 'users') return mocks.users;
      return mocks.setup;
    }
  },
}));

import { hasValidSetupToken, isInitialSetupAvailable, isRegistrationEnabled } from './auth';

const { runtimeConfig, setup, superusers, users } = mocks;

beforeEach(() => {
  runtimeConfig.registrationEnabled = false;
  runtimeConfig.setupToken = 'setup-token';
  users.getList.mockReset().mockResolvedValue({ totalItems: 0 });
  setup.create.mockReset();
  setup.delete.mockReset();
  setup.getOne.mockReset();
  superusers.authWithPassword.mockReset().mockResolvedValue({});
});

it('默认关闭普通注册，且只接受完全匹配的初始化令牌', () => {
  expect(isRegistrationEnabled()).toBe(false);
  expect(hasValidSetupToken('setup-token')).toBe(true);
  expect(hasValidSetupToken('wrong-token')).toBe(false);
});

it('显式开启时允许普通注册', () => {
  runtimeConfig.registrationEnabled = true;
  expect(isRegistrationEnabled()).toBe(true);
});

it('未创建用户且未被申领时允许初始化，已有申领时拒绝', async () => {
  setup.getOne.mockRejectedValue(new mocks.MockClientResponseError(404));
  await expect(isInitialSetupAvailable()).resolves.toBe(true);

  setup.getOne.mockResolvedValue({ id: 'initialsetup001' });
  await expect(isInitialSetupAvailable()).resolves.toBe(false);
});
