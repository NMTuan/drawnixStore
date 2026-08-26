/// <reference types="vitest/globals" />
/** 验证编辑器在本地副本失败和保存失败时仍维持受控的自动保存行为。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, vi } from 'vitest';

const pendingStoreMock = vi.hoisted(() => ({
  clearIfCurrent: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock('@drawnix/drawnix', () => ({ Drawnix: () => null }));

vi.mock('./pending-canvas-store', () => ({
  PendingCanvasStore: function PendingCanvasStore() {
    return pendingStoreMock;
  },
}));

import { CanvasEditor } from './canvas-editor';

const canvas = {
  archived: false,
  created: '2026-01-01T00:00:00.000Z',
  id: 'canvas-1',
  preview_svg: '',
  revision: 0,
  share_enabled: false,
  share_token: '',
  snapshot: '{"children":[],"formatVersion":1}',
  title: '测试画布',
  updated: '2026-01-01T00:00:00.000Z',
  workspace: 'workspace-1',
};

beforeEach(() => {
  pendingStoreMock.clearIfCurrent.mockReset().mockResolvedValue(undefined);
  pendingStoreMock.read.mockReset().mockResolvedValue(null);
  pendingStoreMock.write.mockReset().mockResolvedValue(undefined);
});

it('离线副本写入失败时仍提交服务端保存并展示一次警告', async () => {
  pendingStoreMock.write.mockRejectedValue(new Error('quota exceeded'));
  const onSave = vi.fn().mockResolvedValue(1);
  const onStorageWarning = vi.fn();
  render(
    <CanvasEditor
      canvas={canvas}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onRename={vi.fn()}
      onSave={onSave}
      onShare={vi.fn()}
      onStorageWarning={onStorageWarning}
    />
  );

  fireEvent.click(await screen.findByTitle('立即保存'));

  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), 1, expect.any(Function))
  );
  expect(onStorageWarning).toHaveBeenCalledTimes(1);
  expect(onStorageWarning).toHaveBeenCalledWith(
    '浏览器离线副本无法写入，请保持页面打开直到画布显示“已保存”。'
  );
});

it('保存失败时仅更新保存状态，不留下未处理的自动保存 Promise', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('request failed'));
  render(
    <CanvasEditor
      canvas={canvas}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onRename={vi.fn()}
      onSave={onSave}
      onShare={vi.fn()}
      onStorageWarning={vi.fn()}
    />
  );

  fireEvent.click(await screen.findByTitle('立即保存'));

  expect(await screen.findByText('保存失败')).toBeTruthy();
  expect(onSave).toHaveBeenCalledTimes(1);
});

it('卸载期间完成离线副本写入时不创建新的保存队列', async () => {
  let resolveWrite: (() => void) | undefined;
  pendingStoreMock.write.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      })
  );
  const onSave = vi.fn().mockResolvedValue(1);
  const { unmount } = render(
    <CanvasEditor
      canvas={canvas}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onRename={vi.fn()}
      onSave={onSave}
      onShare={vi.fn()}
      onStorageWarning={vi.fn()}
    />
  );

  fireEvent.click(await screen.findByTitle('立即保存'));
  await waitFor(() => expect(pendingStoreMock.write).toHaveBeenCalledTimes(1));
  unmount();
  resolveWrite?.();

  await Promise.resolve();
  await Promise.resolve();
  expect(onSave).not.toHaveBeenCalled();
});

it('React Strict Mode 重启 effect 后仍可保存', async () => {
  const onSave = vi.fn().mockResolvedValue(1);
  render(
    <StrictMode>
      <CanvasEditor
        canvas={canvas}
        onArchive={vi.fn()}
        onBack={vi.fn()}
        onRename={vi.fn()}
        onSave={onSave}
        onShare={vi.fn()}
        onStorageWarning={vi.fn()}
      />
    </StrictMode>
  );

  fireEvent.click(await screen.findByTitle('立即保存'));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
});
