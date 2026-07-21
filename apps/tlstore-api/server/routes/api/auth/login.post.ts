/** 使用邮箱密码换取 HttpOnly 会话 Cookie，PocketBase JWT 不进入浏览器 JavaScript。 */
import { createError, defineHandler, readBody } from 'h3';
import { ClientResponseError } from 'pocketbase';
import {
  assertTrustedOrigin,
  createUserPocketBase,
  setSession,
  sessionUser,
  toApiError,
} from '../../../utils/auth';
import { enforceAuthenticationRateLimit } from '../../../utils/rate-limit';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const body = (await readBody<LoginBody>(event)) || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password)
    throw createError({ statusCode: 400, statusMessage: '请输入邮箱和密码。' });
  enforceAuthenticationRateLimit(event, email);
  try {
    const pb = createUserPocketBase();
    const auth = await pb.collection('users').authWithPassword(email, password);
    setSession(event, auth.token);
    return { user: sessionUser(auth.record) };
  } catch (error) {
    // 不区分不存在的邮箱和错误密码，避免登录端点成为账号枚举接口。
    if (error instanceof ClientResponseError && error.status === 400)
      throw createError({
        statusCode: 401,
        statusMessage: '邮箱或密码不正确；若尚未注册，请切换至注册。',
      });
    return toApiError(error);
  }
});
