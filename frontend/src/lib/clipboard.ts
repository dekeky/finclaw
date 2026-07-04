/** 复制文本到剪贴板；HTTP 等非安全上下文下回退到 execCommand。 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 权限拒绝或其它原因，尝试传统方式
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持复制到剪贴板');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  if (!ok) {
    throw new Error('当前环境不支持复制到剪贴板，请手动复制链接');
  }
}
