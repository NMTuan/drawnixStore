/** 使用图片上下文展示已持久化 SVG，避免将 SVG 字符串作为 HTML 注入页面。 */
interface CanvasSvgProps {
  svg: string;
  alt: string;
  className?: string;
}

/** 将受控导出的 SVG 编码为图片数据 URL，供私有 Canvas 列表展示缩略图。 */
export function CanvasSvg({ svg, alt, className }: CanvasSvgProps) {
  if (!svg) return null;
  return (
    <img
      alt={alt}
      className={className}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
    />
  );
}
