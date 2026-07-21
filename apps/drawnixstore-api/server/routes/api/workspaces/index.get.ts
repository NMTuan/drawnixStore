/** 返回当前用户的 Workspace 列表，排序规则由 BFF 固定。 */
import { defineHandler } from 'h3';
import { requireUser, toApiError } from '../../../utils/auth';
import { workspaceDto, type WorkspaceRecord } from '../../../utils/records';

export default defineHandler(async (event) => {
  try {
    const { pb } = await requireUser(event);
    const records = await pb
      .collection('workspaces')
      .getFullList<WorkspaceRecord>({ sort: '-created' });
    return { workspaces: records.map(workspaceDto) };
  } catch (error) {
    return toApiError(error);
  }
});
