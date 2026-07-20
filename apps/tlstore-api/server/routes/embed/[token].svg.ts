/**
 * 返回可公开嵌入的 Canvas SVG。
 * 无论 token、开关或记录为何种无效状态均返回同一占位 SVG，避免泄露 Canvas 存在性。
 */
import { defineHandler } from 'nitro';
import { useRuntimeConfig } from 'nitro/runtime-config';
import PocketBase, { ClientResponseError } from 'pocketbase';

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const UNAVAILABLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" role="img" aria-label="Canvas preview unavailable"><rect width="480" height="240" fill="#f3f5f2"/><path d="M186 121h108" stroke="#9aa69e" stroke-width="2"/><text x="240" y="151" text-anchor="middle" fill="#617068" font-family="sans-serif" font-size="14">Canvas preview unavailable</text></svg>';

interface SharedCanvasRecord {
  preview_svg: string;
}

let client: PocketBase | null = null;
let authenticatedClient: Promise<PocketBase> | null = null;

/** 对服务端 PocketBase 客户端进行一次超级管理员认证，浏览器永远不会接触此客户端。 */
function getPocketBaseClient(config: ReturnType<typeof useRuntimeConfig>): Promise<PocketBase> {
  if (
    !config.pocketbaseInternalUrl ||
    !config.pocketbaseSuperuserEmail ||
    !config.pocketbaseSuperuserPassword
  ) {
    return Promise.reject(new Error('缺少 tlstore-api 的 PocketBase 服务端配置。'));
  }
  if (!client || client.baseUrl !== config.pocketbaseInternalUrl) {
    client = new PocketBase(config.pocketbaseInternalUrl);
    client.autoCancellation(false);
    authenticatedClient = null;
  }
  authenticatedClient ??= client
    .collection('_superusers')
    .authWithPassword(config.pocketbaseSuperuserEmail, config.pocketbaseSuperuserPassword)
    .then(() => client!);
  authenticatedClient.catch(() => {
    authenticatedClient = null;
  });
  return authenticatedClient;
}

/** 超级管理员 token 失效时重新认证一次，避免临时故障永久降级为占位 SVG。 */
async function getSharedCanvas(config: ReturnType<typeof useRuntimeConfig>, token: string) {
  const fetchRecord = async () => {
    const pb = await getPocketBaseClient(config);
    return pb
      .collection('canvases')
      .getFirstListItem<SharedCanvasRecord>(
        pb.filter('share_enabled = true && archived = false && share_token = {:token}', { token })
      );
  };
  try {
    return await fetchRecord();
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 401) throw error;
    authenticatedClient = null;
    return fetchRecord();
  }
}

/** 统一设置公开 SVG 的内容类型、无缓存策略和脚本隔离策略。 */
function setSvgHeaders(event: Parameters<Parameters<typeof defineHandler>[0]>[0]) {
  event.res.headers.set('Content-Type', 'image/svg+xml; charset=utf-8');
  event.res.headers.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  // Drawnix 图片以 data: URL 位于 SVG foreignObject 内；只放行该受控来源与必要行内样式。
  event.res.headers.set(
    'Content-Security-Policy',
    "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'"
  );
  event.res.headers.set('X-Content-Type-Options', 'nosniff');
}

export default defineHandler(async (event) => {
  setSvgHeaders(event);
  const token = event.context.params?.token || '';
  if (!TOKEN_PATTERN.test(token)) return UNAVAILABLE_SVG;

  try {
    const record = await getSharedCanvas(useRuntimeConfig(), token);
    return record.preview_svg || UNAVAILABLE_SVG;
  } catch {
    return UNAVAILABLE_SVG;
  }
});
