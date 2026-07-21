/** 返回匿名界面需要的认证入口状态，不返回初始化令牌或用户数量。 */
import { defineHandler } from 'h3';
import { isInitialSetupAvailable, isRegistrationEnabled } from '../../../utils/auth';

export default defineHandler(async () => ({
  registrationEnabled: isRegistrationEnabled(),
  initialSetupAvailable: await isInitialSetupAvailable(),
}));
