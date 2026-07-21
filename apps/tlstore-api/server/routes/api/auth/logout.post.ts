/** 清除当前 BFF Cookie 会话。 */
import { defineHandler } from 'h3';
import { assertTrustedOrigin, clearSession } from '../../../utils/auth';

export default defineHandler((event) => {
  assertTrustedOrigin(event);
  clearSession(event);
  return { ok: true };
});
