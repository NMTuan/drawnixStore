/** tlStore 浏览器应用使用的 PocketBase 记录类型。 */
export interface WorkspaceRecord {
  id: string;
  name: string;
  last_accessed: string;
  created: string;
  updated: string;
}

/** Canvas 的持久化记录，包含仅供列表和分享读取的最后成功 SVG 预览。 */
export interface CanvasRecord {
  id: string;
  workspace: string;
  title: string;
  snapshot: string;
  preview_svg: string;
  share_token: string;
  share_enabled: boolean;
  archived: boolean;
  revision: number;
  created: string;
  updated: string;
}
