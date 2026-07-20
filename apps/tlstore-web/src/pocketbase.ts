/** 浏览器端 PocketBase 客户端，只读取可公开的服务地址。 */
import PocketBase from 'pocketbase';

export const pocketBaseUrl = import.meta.env.VITE_POCKETBASE_URL as string | undefined;
export const pb = new PocketBase(pocketBaseUrl || window.location.origin);
pb.autoCancellation(false);
