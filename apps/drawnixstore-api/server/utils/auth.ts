/**
 * Drawnix Store BFF 的用户会话与 CSRF 边界。
 * 浏览器仅持有 HttpOnly Cookie；每个请求独立恢复 PocketBase 用户身份以复用既有访问规则。
 */
import { timingSafeEqual } from 'node:crypto';
import { createError, getCookie, getHeader, setCookie, type H3Event } from 'h3';
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { useRuntimeConfig } from 'nitro/runtime-config';

const SECURE_SESSION_COOKIE = '__Host-drawnixstore-session';
const DEVELOPMENT_SESSION_COOKIE = 'drawnixstore-session';
const INITIAL_SETUP_RECORD_ID = 'initialsetup001';

/** 返回客户端可安全消费的登录用户字段，绝不透传 PocketBase 完整 AuthRecord。 */
export interface SessionUser {
  id: string;
  email: string;
}

/** BFF 路由需要的经验证用户身份和仅限当前请求使用的 PocketBase 客户端。 */
export interface AuthenticatedRequest {
  pb: PocketBase;
  user: SessionUser;
}

function runtimeConfig() {
  const config = useRuntimeConfig();
  if (!config.pocketbaseInternalUrl)
    throw createError({ statusCode: 500, statusMessage: '服务端 PocketBase 地址未配置。' });
  if (!config.webOrigin)
    throw createError({ statusCode: 500, statusMessage: 'BFF 浏览器来源未配置。' });
  return config;
}

/** 认证客户端不可跨请求复用，避免可变 authStore 在并发请求之间串用身份。 */
export function createUserPocketBase(): PocketBase {
  const pb = new PocketBase(runtimeConfig().pocketbaseInternalUrl);
  pb.autoCancellation(false);
  return pb;
}

/** 使用仅服务端保存的超级管理员凭据创建管理客户端，禁止将该客户端返回给浏览器。 */
export async function createSuperuserPocketBase(): Promise<PocketBase> {
  const config = runtimeConfig();
  const email = String(config.pocketbaseSuperuserEmail || '');
  const password = String(config.pocketbaseSuperuserPassword || '');
  if (!email || !password)
    throw createError({ statusCode: 500, statusMessage: '服务端 PocketBase 管理员凭据未配置。' });
  const pb = createUserPocketBase();
  await pb.collection('_superusers').authWithPassword(email, password);
  return pb;
}

/** 判断是否显式允许普通注册，默认值为 false，避免私有部署意外开放账号入口。 */
export function isRegistrationEnabled(): boolean {
  return String(runtimeConfig().registrationEnabled) === 'true';
}

/** 返回仅在关闭普通注册、已配置令牌且尚无用户时可用的一次性初始化状态。 */
export async function isInitialSetupAvailable(): Promise<boolean> {
  const setupToken = String(runtimeConfig().setupToken || '');
  if (isRegistrationEnabled() || !setupToken) return false;
  const pb = await createSuperuserPocketBase();
  const users = await pb.collection('users').getList(1, 1, { fields: 'id' });
  if (users.totalItems > 0) return false;
  try {
    await pb.collection('drawnixstore_setup').getOne(INITIAL_SETUP_RECORD_ID, { fields: 'id' });
    return false;
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) return true;
    throw error;
  }
}

/** 以恒定时间比较初始化令牌，避免通过响应时间推测服务端令牌内容。 */
export function hasValidSetupToken(value: string): boolean {
  const expected = Buffer.from(String(runtimeConfig().setupToken || ''));
  const submitted = Buffer.from(value);
  return (
    expected.length > 0 &&
    expected.length === submitted.length &&
    timingSafeEqual(expected, submitted)
  );
}

/** 将首账号与固定初始化记录加入同一 PocketBase 事务，避免多实例竞争或崩溃留下半完成状态。 */
export async function createInitialUser(email: string, password: string): Promise<void> {
  const pb = await createSuperuserPocketBase();
  const batch = pb.createBatch();
  batch.collection('drawnixstore_setup').create({ id: INITIAL_SETUP_RECORD_ID });
  batch.collection('users').create({ email, password, passwordConfirm: password });
  await batch.send();
}

function hasSecureSessionCookie(): boolean {
  // Cookie 属性必须与浏览器实际访问的固定公开来源一致，避免 HTTP 部署返回浏览器会拒绝的 Secure Cookie。
  return new URL(runtimeConfig().webOrigin).protocol === 'https:';
}

function sessionCookieName(): string {
  return hasSecureSessionCookie() ? SECURE_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;
}

/** 将 PocketBase 用户 token 设置为仅服务端可读取的会话 Cookie。 */
export function setSession(event: H3Event, token: string) {
  setCookie(event, sessionCookieName(), token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax',
    secure: hasSecureSessionCookie(),
  });
}

/** 清理浏览器会话，不影响 PocketBase 中用户本身的长期认证状态。 */
export function clearSession(event: H3Event) {
  setCookie(event, sessionCookieName(), '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: hasSecureSessionCookie(),
  });
}

/** 写请求只接受部署配置的固定浏览器来源，避免 Cookie 会话遭受 CSRF。 */
export function assertTrustedOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin');
  const configuredOrigin = runtimeConfig().webOrigin;
  if (!origin || origin !== configuredOrigin)
    throw createError({ statusCode: 403, statusMessage: '不受信任的请求来源。' });
}

/** 将 PocketBase AuthRecord 收敛为 BFF 的稳定会话 DTO。 */
export function sessionUser(record: RecordModel): SessionUser {
  return { id: record.id, email: String(record.getStringValue?.('email') || record.email || '') };
}

/**
 * 恢复并刷新 Cookie 内的 PocketBase 用户 token。
 * 刷新失败统一转为 401，调用方无需暴露 PocketBase 的认证细节。
 */
export async function requireUser(event: H3Event): Promise<AuthenticatedRequest> {
  const token = getCookie(event, sessionCookieName());
  if (!token) throw createError({ statusCode: 401, statusMessage: '请先登录。' });
  const pb = createUserPocketBase();
  pb.authStore.save(token);
  try {
    const auth = await pb.collection('users').authRefresh();
    setSession(event, auth.token);
    return { pb, user: sessionUser(auth.record) };
  } catch (error) {
    clearSession(event);
    if (error instanceof ClientResponseError)
      throw createError({ statusCode: 401, statusMessage: '登录状态已失效。' });
    throw error;
  }
}

/** BFF 仅向浏览器返回已归类的 PocketBase 请求错误，避免泄露服务端实现。 */
export function toApiError(error: unknown): never {
  if (error instanceof ClientResponseError) {
    const statusCode = error.status >= 400 && error.status < 500 ? error.status : 502;
    throw createError({ statusCode, statusMessage: '请求未能完成。' });
  }
  throw error;
}
