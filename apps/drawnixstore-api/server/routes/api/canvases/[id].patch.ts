/** 更新当前用户拥有的 Canvas 内容和生命周期字段，拒绝 owner 与 workspace 重绑定。 */
import { createError, defineHandler, readBody } from 'h3';
import { assertTrustedOrigin, requireUser, toApiError } from '../../../utils/auth';
import {
  canvasDto,
  documentText,
  requiredText,
  type CanvasRecord,
  withCanvasLock,
} from '../../../utils/records';

interface UpdateCanvasBody {
  title?: unknown;
  snapshot?: unknown;
  previewSvg?: unknown;
  shareEnabled?: unknown;
  archived?: unknown;
  revision?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const id = event.context.params?.id || '';
  const body = (await readBody<UpdateCanvasBody>(event)) || {};
  if (!id) throw createError({ statusCode: 400, statusMessage: '画布标识不合法。' });
  const update: Record<string, string | number | boolean> = {};
  if (body.title !== undefined) update.title = requiredText(body.title, '画布名称', 200);
  if (body.snapshot !== undefined) update.snapshot = documentText(body.snapshot, '画布快照');
  if (body.previewSvg !== undefined) update.preview_svg = documentText(body.previewSvg, 'SVG 预览');
  if (body.shareEnabled !== undefined) {
    if (typeof body.shareEnabled !== 'boolean')
      throw createError({ statusCode: 400, statusMessage: '分享状态不合法。' });
    update.share_enabled = body.shareEnabled;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean')
      throw createError({ statusCode: 400, statusMessage: '归档状态不合法。' });
    update.archived = body.archived;
  }
  if (body.revision !== undefined) {
    if (
      typeof body.revision !== 'number' ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0
    )
      throw createError({ statusCode: 400, statusMessage: '修订号不合法。' });
    update.revision = body.revision;
  }
  if (!Object.keys(update).length)
    throw createError({ statusCode: 400, statusMessage: '没有可更新字段。' });
  try {
    const { pb } = await requireUser(event);
    const record = await withCanvasLock(id, async () => {
      // 快照保存携带客户端观察到的下一 revision；不匹配即拒绝过期离线或多端覆盖。
      if (body.revision !== undefined) {
        const current = await pb.collection('canvases').getOne<CanvasRecord>(id);
        if (body.revision !== current.revision + 1)
          throw createError({
            statusCode: 409,
            statusMessage: '画布已在其他位置更新，请重新加载后再保存。',
          });
      }
      return pb.collection('canvases').update<CanvasRecord>(id, update);
    });
    return { canvas: canvasDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
