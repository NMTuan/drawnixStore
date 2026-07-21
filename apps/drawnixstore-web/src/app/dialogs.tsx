/** Drawnix Store 的轻量模态框，承载工作区与 Canvas 的命名和归档确认操作。 */
import { AlertTriangle, Copy, Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DialogShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}

/** 提供可关闭的通用模态容器，避免业务页面依赖上游编辑器 DOM。 */
function DialogShell({ title, description, children, onClose }: DialogShellProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-describedby="dialog-description"
        aria-labelledby="dialog-title"
        className="dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog__header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            <p id="dialog-description">{description}</p>
          </div>
          <button className="icon-button" title="关闭" type="button" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

interface TextDialogProps {
  title: string;
  description: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
}

/** 收集单一名称字段，提交失败时保留用户的已输入内容。 */
export function TextDialog({
  title,
  description,
  label,
  initialValue = '',
  confirmLabel,
  onClose,
  onConfirm,
}: TextDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setValue(initialValue), [initialValue]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedValue = value.trim();
    if (!trimmedValue) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await onConfirm(trimmedValue);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell description={description} title={title} onClose={onClose}>
      <form className="dialog__form" onSubmit={(event) => void submit(event)}>
        <label>
          {label}
          <input
            autoFocus
            maxLength={200}
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {failed && (
          <p className="form-error" role="alert">
            保存失败，请检查网络后重试。
          </p>
        )}
        <div className="dialog__actions">
          <button className="button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? '处理中' : confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** 对归档操作展示明确后果，并避免在请求未结束时重复提交。 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setSubmitting(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell description={description} title={title} onClose={onClose}>
      <div className="dialog__warning">
        <AlertTriangle aria-hidden="true" size={18} /> 此操作不会删除画布内容。
      </div>
      {failed && (
        <p className="form-error" role="alert">
          操作失败，请检查网络后重试。
        </p>
      )}
      <div className="dialog__actions">
        <button className="button" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="button button--danger"
          disabled={submitting}
          type="button"
          onClick={() => void confirm()}
        >
          {submitting ? '处理中' : confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

interface ShareDialogProps {
  url: string;
  embedUrl: string;
  enabled: boolean;
  onClose: () => void;
  onEnabledChange: (enabled: boolean) => Promise<void>;
}

/** 管理 Canvas 的公开访问开关，并在开启后提供普通链接与安全嵌入代码。 */
export function ShareDialog({
  url,
  embedUrl,
  enabled,
  onClose,
  onEnabledChange,
}: ShareDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState('');

  async function setEnabled(nextEnabled: boolean) {
    setSubmitting(true);
    try {
      await onEnabledChange(nextEnabled);
    } catch {
      // 父组件会写入全局错误横幅，弹窗保持当前状态便于用户重试。
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('浏览器拒绝访问剪贴板。');
      }
      setCopied(`已复制${label}`);
    } catch {
      setCopied('复制失败，请手动选择内容。');
    }
  }

  const embedCode = `<img src="${embedUrl}" alt="Canvas preview" />`;
  return (
    <DialogShell
      description="开启后，持有链接的人可以查看最新一次成功保存的 SVG 预览。"
      title="分享画布"
      onClose={onClose}
    >
      <label className="share-toggle">
        <span>
          <strong>允许公开查看</strong>
          <small>关闭后，所有已发出的链接会立即失效。</small>
        </span>
        <input
          checked={enabled}
          disabled={submitting}
          type="checkbox"
          onChange={(event) => void setEnabled(event.target.checked)}
        />
      </label>
      {enabled && (
        <div className="share-links">
          <label>
            分享链接
            <input readOnly value={url} />
          </label>
          <button className="button" type="button" onClick={() => void copy(url, '链接')}>
            <Link2 aria-hidden="true" size={16} />
            复制链接
          </button>
          <label>
            嵌入代码
            <textarea readOnly value={embedCode} />
          </label>
          <button className="button" type="button" onClick={() => void copy(embedCode, '代码')}>
            <Copy aria-hidden="true" size={16} />
            复制嵌入代码
          </button>
          {copied && <p className="share-copied">{copied}</p>}
        </div>
      )}
    </DialogShell>
  );
}
