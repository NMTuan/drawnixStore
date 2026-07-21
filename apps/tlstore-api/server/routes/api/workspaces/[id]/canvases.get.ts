/** 返回指定 Workspace 内当前用户可访问的 Canvas，支持活跃和归档两种视图。 */
import { createError, defineHandler, getQuery } from 'h3';
import { requireUser, toApiError } from '../../../../utils/auth';
import { canvasDto, type CanvasRecord } from '../../../../utils/records';

export default defineHandler(async (event) => {
  const workspaceId = event.context.params?.id || '';
  const archivedValue = getQuery(event).archived;
  if (!workspaceId || (archivedValue !== 'true' && archivedValue !== 'false'))
    throw createError({ statusCode: 400, statusMessage: 'Canvas 查询参数不合法。' });
  try {
    const { pb } = await requireUser(event);
    const records = await pb.collection('canvases').getFullList<CanvasRecord>({
      filter: pb.filter('workspace = {:workspace} && archived = {:archived}', {
        workspace: workspaceId,
        archived: archivedValue === 'true',
      }),
      sort: '-updated',
    });
    return { canvases: records.map(canvasDto) };
  } catch (error) {
    return toApiError(error);
  }
});
