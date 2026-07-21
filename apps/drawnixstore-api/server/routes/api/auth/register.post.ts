/** 注册 Drawnix Store 用户并立即建立服务端 Cookie 会话。 */
import { createError, defineHandler, readBody } from 'h3';
import {
  assertTrustedOrigin,
  createUserPocketBase,
  setSession,
  sessionUser,
  toApiError,
} from '../../../utils/auth';
import { enforceAuthenticationRateLimit } from '../../../utils/rate-limit';

interface RegisterBody {
  email?: unknown;
  password?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const body = (await readBody<RegisterBody>(event)) || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || password.length < 8)
    throw createError({ statusCode: 400, statusMessage: '请输入有效邮箱和至少 8 位密码。' });
  enforceAuthenticationRateLimit(event, email);
  try {
    const pb = createUserPocketBase();
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    const auth = await pb.collection('users').authWithPassword(email, password);
    setSession(event, auth.token);
    return { user: sessionUser(auth.record) };
  } catch (error) {
    return toApiError(error);
  }
});
