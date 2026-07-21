/// <reference types="vitest/globals" />
/** 验证分享弹窗输出的嵌入片段始终指向只读分享页，而不暴露编辑资源。 */
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ShareDialog } from './dialogs';

it('为公开 Canvas 提供图片、HTML 与 Markdown 分享片段', () => {
  const url = 'https://store.example.com/share/token-1';
  const embedUrl = 'https://store.example.com/embed/token-1.svg';
  render(
    <ShareDialog
      embedUrl={embedUrl}
      enabled
      title="示例 [画布]"
      url={url}
      onClose={vi.fn()}
      onEnabledChange={vi.fn().mockResolvedValue(undefined)}
    />
  );

  expect((screen.getByLabelText('图片地址') as HTMLTextAreaElement).value).toBe(embedUrl);
  expect((screen.getByLabelText('带链接 HTML 图片') as HTMLTextAreaElement).value).toBe(
    `<a href="${url}"><img src="${embedUrl}" alt="示例 [画布]" /></a>`
  );
  expect((screen.getByLabelText('带链接 Markdown 图片') as HTMLTextAreaElement).value).toBe(
    `[![示例 \\[画布\\]](${embedUrl})](${url})`
  );
  expect(screen.getByTitle('复制分享页面地址')).toBeTruthy();
});
