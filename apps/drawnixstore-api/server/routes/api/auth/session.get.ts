/** 返回当前 Cookie 会话的最小用户资料，并刷新临近过期的 PocketBase token。 */
import { defineHandler } from 'h3';
import { requireUser } from '../../../utils/auth';

export default defineHandler(async (event) => ({ user: (await requireUser(event)).user }));
