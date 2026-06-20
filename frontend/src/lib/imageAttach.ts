/** 与后端 finclaw 通道一致的内联图片约束。 */
export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
];

/** 单张图片上限（与后端 DefaultMaxMediaSize 对齐：20MB）。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface PendingImage {
  /** data:image/...;base64,... */
  dataUrl: string;
  name: string;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * 读取并校验图片文件，转换为 base64 data URL。
 * 返回成功转换的图片与被拒绝文件的错误信息。
 */
export async function filesToPendingImages(
  files: FileList | File[],
): Promise<{ images: PendingImage[]; errors: string[] }> {
  const images: PendingImage[] = [];
  const errors: string[] = [];

  for (const file of Array.from(files)) {
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      errors.push(`${file.name}: 不支持的图片格式`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}: 超过 20MB 限制`);
      continue;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      if (!dataUrl.startsWith('data:image/')) {
        errors.push(`${file.name}: 读取失败`);
        continue;
      }
      images.push({ dataUrl, name: file.name });
    } catch {
      errors.push(`${file.name}: 读取失败`);
    }
  }

  return { images, errors };
}
