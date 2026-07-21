/** Canvas 快照合同的回归测试。 */
import { createEmptyCanvasSnapshot, parseCanvasSnapshot, serializeCanvasSnapshot } from './canvas';

describe('Canvas 快照', () => {
  it('解析无效数据时返回空白快照', () => {
    expect(parseCanvasSnapshot('{')).toEqual(createEmptyCanvasSnapshot());
  });

  it('序列化时写入格式版本', () => {
    expect(serializeCanvasSnapshot({ children: [{ type: 'draw' }] })).toBe(
      '{"children":[{"type":"draw"}],"formatVersion":1}'
    );
  });
});
