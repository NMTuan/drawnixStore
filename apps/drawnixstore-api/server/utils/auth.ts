/**
 * Drawnix Store BFF 的用户会话与 CSRF 边界。
 * 浏览器仅持有 HttpOnly Cookie；每个请求独立恢复 PocketBase 用户身份以复用既有访问规则。
 */
import { createError, getCookie, getHeader, setCookie, type H3Event } from 'h3';
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { useRuntimeConfig } from 'nitro/runtime-config';

const SECURE_SESSION_COOKIE = '__Host-drawnixstore-session';
const DEVELOPMENT_SESSION_COOKIE = 'drawnixstore-session';

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
