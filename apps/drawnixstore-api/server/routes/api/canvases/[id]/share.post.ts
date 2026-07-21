/** 确保 Canvas 具有稳定分享 token；创建 token 不会自动开启公开访问。 */
import { createError, defineHandler } from 'h3';
import { assertTrustedOrigin, requireUser, toApiError } from '../../../../utils/auth';
import {
  canvasDto,
  createShareToken,
  isShareToken,
  type CanvasRecord,
} from '../../../../utils/records';

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const id = event.context.params?.id || '';
  if (!id) throw createError({ statusCode: 400, statusMessage: '画布标识不合法。' });
  try {
    const { pb } = await requireUser(event);
    const canvas = await pb.collection('canvases').getOne<CanvasRecord>(id);
    if (isShareToken(canvas.share_token)) return { canvas: canvasDto(canvas) };
    const record = await pb.collection('canvases').update<CanvasRecord>(id, {
      share_token: createShareToken(),
    });
    return { canvas: canvasDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
