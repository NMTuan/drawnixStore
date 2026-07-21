/** 返回当前用户拥有的单个 Canvas。 */
import { createError, defineHandler } from 'h3';
import { requireUser, toApiError } from '../../../utils/auth';
import { canvasDto, type CanvasRecord } from '../../../utils/records';

export default defineHandler(async (event) => {
  const id = event.context.params?.id || '';
  if (!id) throw createError({ statusCode: 400, statusMessage: '画布标识不合法。' });
  try {
    const { pb } = await requireUser(event);
    const record = await pb.collection('canvases').getOne<CanvasRecord>(id);
    return { canvas: canvasDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
