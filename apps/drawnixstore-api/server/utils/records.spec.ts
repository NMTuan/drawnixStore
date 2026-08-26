/// <reference types="vitest/globals" />
/** 验证 Canvas 字段与整条写入请求的容量边界。 */
import { MAX_CANVAS_DOCUMENT_BYTES, MAX_CANVAS_WRITE_BYTES } from '@drawnixstore/domain';
import type { H3Event } from 'h3';
import { assertCanvasWriteBodySize, documentText } from './records';

it('按 UTF-8 字节校验 Canvas 文档字段', () => {
  expect(documentText('画布', '画布快照')).toBe('画布');
  expect(() => documentText(42, '画布快照')).toThrow('画布快照内容不合法。');
  expect(() => documentText('a'.repeat(MAX_CANVAS_DOCUMENT_BYTES + 1), '画布快照')).toThrow(
    '画布快照超过 10 MiB 上限，请减少图片或画布内容后重试。'
  );
});

it('在 JSON 解析前拒绝超过 Canvas 总预算的请求', async () => {
  const event = {
    req: {
      body: {},
      headers: new Headers({ 'content-length': String(MAX_CANVAS_WRITE_BYTES + 1) }),
    },
  } as unknown as H3Event;

  await expect(assertCanvasWriteBodySize(event)).rejects.toMatchObject({
    status: 413,
    message: '画布保存请求超过 24 MiB 上限，请减少图片或画布内容后重试。',
  });
});
