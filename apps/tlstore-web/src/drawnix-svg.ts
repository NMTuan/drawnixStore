/**
 * Drawnix SVG 适配层。
 * 该模块是唯一使用 Plait 公开导出 API 的业务例外：afterInit 显式提供 PlaitBoard，
 * toSvgData 用于复用 Drawnix 同一渲染链路生成可持久化的完整画布预览。
 */
import { getBackgroundColor } from '@drawnix/drawnix';
import { toSvgData, type PlaitBoard } from '@plait/core';

/** 导出完整画布而非当前选区，供 Canvas 列表缩略图和公开嵌入复用。 */
export async function exportCanvasSvg(board: PlaitBoard): Promise<string> {
  return toSvgData(board, {
    fillStyle: getBackgroundColor(board) || 'white',
    padding: 24,
    ratio: 4,
    inlineStyleClassNames: '.plait-text-container',
    styleNames: ['position'],
  });
}
