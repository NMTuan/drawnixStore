/** 通过服务端初始化令牌创建唯一首账号，并立即写入 HttpOnly 会话 Cookie。 */
import { createError, defineHandler, readBody } from 'h3';
import { ClientResponseError } from 'pocketbase';
import {
  assertTrustedOrigin,
  createInitialUser,
  hasValidSetupToken,
  isInitialSetupAvailable,
  sessionUser,
  setSession,
  toApiError,
} from '../../../utils/auth';
import { enforceAuthenticationRateLimit } from '../../../utils/rate-limit';

interface SetupBody {
  email?: unknown;
  password?: unknown;
  token?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const body = (await readBody<SetupBody>(event)) || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const token = typeof body.token === 'string' ? body.token : '';
  if (!email || password.length < 8)
    throw createError({ statusCode: 400, statusMessage: '请输入有效邮箱和至少 8 位密码。' });
  enforceAuthenticationRateLimit(event, email);
  try {
    if (!hasValidSetupToken(token))
      throw createError({ statusCode: 403, statusMessage: '初始化令牌无效或初始化已完成。' });
    if (!(await isInitialSetupAvailable()))
      throw createError({ statusCode: 403, statusMessage: '初始化令牌无效或初始化已完成。' });
    try {
      await createInitialUser(email, password);
      const auth = await createUserPocketBase()
        .collection('users')
        .authWithPassword(email, password);
      setSession(event, auth.token);
      return { user: sessionUser(auth.record) };
    } catch (error) {
      // 并发请求的事务冲突不会创建第二个账号，统一收敛为初始化已完成。
      if (error instanceof ClientResponseError && error.status === 400)
        throw createError({ statusCode: 403, statusMessage: '初始化令牌无效或初始化已完成。' });
      throw error;
    }
  } catch (error) {
    return toApiError(error);
  }
});
