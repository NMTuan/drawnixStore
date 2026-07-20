/** tlStore 浏览器应用使用的 PocketBase 记录类型。 */
export interface WorkspaceRecord {
  id: string;
  owner: string;
  name: string;
  last_accessed: string;
  created: string;
  updated: string;
}

/** Canvas 的最小持久化记录，不包含尚未实现的分享和预览字段。 */
export interface CanvasRecord {
  id: string;
  owner: string;
  workspace: string;
  title: string;
  snapshot: string;
  archived: boolean;
  revision: number;
  created: string;
  updated: string;
}
