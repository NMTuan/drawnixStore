/**
 * 初始化 Drawnix Store 的 PocketBase 私有数据集合。
 * 此原生 ESM 脚本只依赖生产依赖，可在一次性部署容器中运行而无需 TypeScript 工具链。
 */
import { config } from 'dotenv';
import PocketBase, { ClientResponseError } from 'pocketbase';

config({ path: '.env.local', quiet: true });

const baseUrl = process.env.POCKETBASE_INTERNAL_URL || process.env.NITRO_POCKETBASE_INTERNAL_URL;
const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
const INITIAL_SETUP_RECORD_ID = 'initialsetup001';

if (!baseUrl || !email || !password) throw new Error('缺少 PocketBase 初始化所需环境变量。');

const pb = new PocketBase(baseUrl);

/** 创建或更新指定集合定义，不删除集合中已有的业务记录。 */
async function ensureCollection(definition) {
  try {
    const existing = await pb.collections.getOne(String(definition.name));
    await pb.collections.update(existing.id, definition);
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) {
      await pb.collections.create(definition);
      return;
    }
    throw error;
  }
}

/** 启用仅供首账号创建使用的小型 PocketBase 批处理事务，避免跨实例初始化竞争。 */
async function ensureBatchTransactions() {
  const settings = await pb.settings.getAll();
  if (settings.batch?.enabled) return;
  await pb.settings.update({
    batch: {
      ...settings.batch,
      enabled: true,
      maxRequests: settings.batch?.maxRequests || 2,
      timeout: settings.batch?.timeout || 3,
      maxBodySize: settings.batch?.maxBodySize || 10_000,
    },
  });
}

/** 将内部初始化锁与已有用户状态对齐，升级已有部署时不会意外开放首账号创建。 */
async function synchronizeInitialSetupClaim() {
  const users = await pb.collection('users').getList(1, 1, { fields: 'id' });
  try {
    if (users.totalItems > 0) {
      await pb.collection('drawnixstore_setup').create({ id: INITIAL_SETUP_RECORD_ID });
      return;
    }
    await pb.collection('drawnixstore_setup').delete(INITIAL_SETUP_RECORD_ID);
  } catch (error) {
    // 固定记录已存在或尚不存在均是幂等同步的预期结果。
    if (error instanceof ClientResponseError && error.status === 400) return;
    if (error instanceof ClientResponseError && error.status === 404) return;
    throw error;
  }
}

/** 创建 Workspace 与 Canvas，并将每项读写严格限制到记录 owner。 */
async function bootstrap() {
  await pb.collection('_superusers').authWithPassword(email, password);
  await ensureBatchTransactions();
  const users = await pb.collections.getOne('users');
  await ensureCollection({
    // 初始化状态仅由服务器超级管理员读取，固定 ID 保证多实例只能申领一次。
    name: 'drawnixstore_setup',
    type: 'base',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  });
  const privateRules = {
    listRule: 'owner = @request.auth.id',
    viewRule: 'owner = @request.auth.id',
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: 'owner = @request.auth.id',
    deleteRule: null,
  };

  await ensureCollection({
    name: 'workspaces',
    type: 'base',
    ...privateRules,
    fields: [
      {
        name: 'owner',
        type: 'relation',
        required: true,
        collectionId: users.id,
        minSelect: 1,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { name: 'name', type: 'text', required: true, min: 1, max: 120 },
      { name: 'last_accessed', type: 'date' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  });

  const workspaces = await pb.collections.getOne('workspaces');
  await ensureCollection({
    name: 'canvases',
    type: 'base',
    ...privateRules,
    createRule:
      "@request.auth.id != '' && owner = @request.auth.id && workspace.owner = @request.auth.id",
    updateRule: 'owner = @request.auth.id && workspace.owner = @request.auth.id',
    fields: [
      {
        name: 'owner',
        type: 'relation',
        required: true,
        collectionId: users.id,
        minSelect: 1,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        name: 'workspace',
        type: 'relation',
        required: true,
        collectionId: workspaces.id,
        minSelect: 1,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { name: 'title', type: 'text', required: true, min: 1, max: 200 },
      { name: 'snapshot', type: 'text', required: false, max: 10_000_000, default: '' },
      // SVG 只作为列表和嵌入读模型；源快照始终是 Canvas 的唯一编辑真相。
      { name: 'preview_svg', type: 'text', required: false, max: 10_000_000, default: '' },
      // 分享 token 是 bearer credential，由 BFF 服务端安全随机源生成，API 只在开关开启时接受它。
      { name: 'share_token', type: 'text', required: false, max: 128, default: '' },
      { name: 'share_enabled', type: 'bool', required: false, default: false },
      // 归档只控制列表可见性，始终保留 Canvas 快照以供恢复。
      { name: 'archived', type: 'bool', required: false, default: false },
      { name: 'revision', type: 'number', required: false, min: 0, default: 0 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  });
  await synchronizeInitialSetupClaim();
}

await bootstrap();
