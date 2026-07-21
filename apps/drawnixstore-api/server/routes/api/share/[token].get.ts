/**
 * 为已登录的画布 owner 解析有效分享 token 对应的编辑地址。
 * 分享 token 只能定位公开预览；编辑权限仍由当前 PocketBase 用户和访问规则共同决定。
 */
import { createError, defineHandler } from 'h3';
import { ClientResponseError } from 'pocketbase';
import { requireUser } from '../../../utils/auth';
import { isShareToken } from '../../../utils/records';

export default defineHandler(async (event) => {
  const token = event.context.params?.token || '';
  if (!isShareToken(token))
    throw createError({ statusCode: 404, statusMessage: '分享内容不存在。' });

  const { pb } = await requireUser(event);
  try {
    const canvas = await pb
      .collection('canvases')
      .getFirstListItem<{ id: string }>(
        pb.filter('share_enabled = true && archived = false && share_token = {:token}', { token })
      );
    return { canvasId: canvas.id };
  } catch (error) {
    // 非 owner、失效 token 和不存在记录都返回同一结果，避免以 token 枚举私有 Canvas。
    if (error instanceof ClientResponseError)
      throw createError({ statusCode: 404, statusMessage: '分享内容不存在。' });
    throw error;
  }
});
