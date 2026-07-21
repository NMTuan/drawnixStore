/**
 * 针对登录与注册的进程内基础限流。
 * 单实例部署可直接使用；扩容后必须替换为 Redis、网关或边缘限流，不能将此实现视为全局防护。
 */
import { createError, getHeader, type H3Event } from 'h3';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, number[]>();

/** 清理过期限流窗口，避免攻击者使用大量不同键导致进程内存无界增长。 */
function pruneExpiredAttempts(now: number) {
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((timestamp) => timestamp > now - WINDOW_MS);
    if (recent.length) attempts.set(key, recent);
    else attempts.delete(key);
  }
}

function assertAttemptAvailable(key: string) {
  const recent = attempts.get(key) || [];
  if (recent.length >= MAX_ATTEMPTS)
    throw createError({ statusCode: 429, statusMessage: '尝试过于频繁，请稍后再试。' });
}

function recordAttempt(key: string, now: number) {
  const recent = attempts.get(key) || [];
  recent.push(now);
  attempts.set(key, recent);
}

/** 同时按邮箱和来源地址限流，兼顾分布式撞库与批量注册。 */
export function enforceAuthenticationRateLimit(event: H3Event, email: string) {
  const now = Date.now();
  const address = getHeader(event, 'x-real-ip') || 'unknown';
  pruneExpiredAttempts(now);
  const emailKey = `email:${email.toLowerCase()}`;
  const addressKey = `address:${address}`;
  assertAttemptAvailable(emailKey);
  assertAttemptAvailable(addressKey);
  recordAttempt(emailKey, now);
  recordAttempt(addressKey, now);
}
