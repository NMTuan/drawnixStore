/** Canvas 快照与写入容量合同的回归测试。 */
import {
  createEmptyCanvasSnapshot,
  getUtf8ByteLength,
  MAX_CANVAS_DOCUMENT_BYTES,
  MAX_CANVAS_WRITE_BYTES,
  parseCanvasSnapshot,
  serializeCanvasSnapshot,
} from './canvas';

describe('Canvas 快照', () => {
  it('解析无效数据时返回空白快照', () => {
    expect(parseCanvasSnapshot('{')).toEqual(createEmptyCanvasSnapshot());
  });

  it('序列化时写入格式版本', () => {
    expect(serializeCanvasSnapshot({ children: [{ type: 'draw' }] })).toBe(
      '{"children":[{"type":"draw"}],"formatVersion":1}'
    );
  });

  it('按 UTF-8 字节而不是 JavaScript 字符数计算容量', () => {
    expect(getUtf8ByteLength('画布')).toBe(6);
    expect(MAX_CANVAS_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_CANVAS_WRITE_BYTES).toBe(24 * 1024 * 1024);
  });
});
