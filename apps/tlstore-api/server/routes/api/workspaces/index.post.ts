/** 为当前登录用户创建 Workspace，owner 强制从会话身份派生。 */
import { defineHandler, readBody } from 'h3';
import { assertTrustedOrigin, requireUser, toApiError } from '../../../utils/auth';
import { requiredText, workspaceDto, type WorkspaceRecord } from '../../../utils/records';

interface CreateWorkspaceBody {
  name?: unknown;
}

export default defineHandler(async (event) => {
  assertTrustedOrigin(event);
  const body = (await readBody<CreateWorkspaceBody>(event)) || {};
  try {
    const { pb, user } = await requireUser(event);
    const record = await pb.collection('workspaces').create<WorkspaceRecord>({
      owner: user.id,
      name: requiredText(body.name, '工作区名称', 120),
      last_accessed: new Date().toISOString(),
    });
    return { workspace: workspaceDto(record) };
  } catch (error) {
    return toApiError(error);
  }
});
