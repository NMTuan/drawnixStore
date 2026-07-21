/** 更新当前用户拥有的 Workspace 名称或最近访问时间。 */
import { createError, defineHandler, readBody } from 'h3';
import { assertTrustedOrigin, requireUser, toApiError } from '../../../utils/auth';
import { requiredText, workspaceDto, type WorkspaceRecord } from '../../../utils/records';

interface UpdateWorkspaceBody {
  name?: unknown;
  lastAccessed?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const id = event.context.params?.id || '';
  const body = (await readBody<UpdateWorkspaceBody>(event)) || {};
  if (!id) throw createError({ statusCode: 400, statusMessage: '工作区标识不合法。' });
  const update: Record<string, string> = {};
  if (body.name !== undefined) update.name = requiredText(body.name, '工作区名称', 120);
  if (body.lastAccessed !== undefined) {
    if (typeof body.lastAccessed !== 'string' || Number.isNaN(Date.parse(body.lastAccessed)))
      throw createError({ statusCode: 400, statusMessage: '最近访问时间不合法。' });
    update.last_accessed = body.lastAccessed;
  }
  if (!Object.keys(update).length)
    throw createError({ statusCode: 400, statusMessage: '没有可更新字段。' });
  try {
    const { pb } = await requireUser(event);
    const record = await pb.collection('workspaces').update<WorkspaceRecord>(id, update);
    return { workspace: workspaceDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
