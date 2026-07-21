/** 在当前用户拥有的 Workspace 下创建空 Canvas，忽略客户端提供的 owner。 */
import { createError, defineHandler, readBody } from 'h3';
import { assertTrustedOrigin, requireUser, toApiError } from '../../../../utils/auth';
import {
  canvasDto,
  documentText,
  requiredText,
  type CanvasRecord,
} from '../../../../utils/records';

interface CreateCanvasBody {
  title?: unknown;
  snapshot?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const workspaceId = event.context.params?.id || '';
  const body = (await readBody<CreateCanvasBody>(event)) || {};
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: '工作区标识不合法。' });
  try {
    const { pb, user } = await requireUser(event);
    const record = await pb.collection('canvases').create<CanvasRecord>({
      owner: user.id,
      workspace: workspaceId,
      title: requiredText(body.title, '画布名称', 200),
      snapshot: documentText(body.snapshot, '画布快照'),
      preview_svg: '',
      share_token: '',
      share_enabled: false,
      archived: false,
      revision: 0,
    });
    return { canvas: canvasDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
