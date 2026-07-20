/** 浏览器端 PocketBase 客户端，只读取可公开的服务地址。 */
import PocketBase from 'pocketbase';

export const pocketBaseUrl = import.meta.env.VITE_POCKETBASE_URL as string | undefined;
/** SVG 嵌入服务的公开地址；留空时使用 Web 同源反向代理。 */
export const tlstoreApiUrl = import.meta.env.VITE_TLSTORE_API_URL as string | undefined;
export const pb = new PocketBase(pocketBaseUrl || window.location.origin);
pb.autoCancellation(false);
