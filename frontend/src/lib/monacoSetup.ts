/**
 * Monaco 本地打包配置。
 *
 * 默认情况下 @monaco-editor/react 的 loader 会在首次使用编辑器时从
 * jsDelivr CDN 下载整份 monaco-editor（约数 MB），网络不稳时回测页
 * 首次打开会非常慢甚至失败。这里把 monaco 打包进产物（独立 chunk），
 * 并让 loader 直接使用本地实例，彻底去掉 CDN 依赖。
 *
 * 本模块同时被「后台预加载」与「策略代码编辑器」引用，二者共享同一个
 * chunk，预加载完成后用户打开回测页即秒开。
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

interface MonacoEnvironmentLike {
  globalAPI?: boolean;
  getWorker?: (workerId: string, label: string) => Worker;
}

if (!self.MonacoEnvironment) {
  // 提供本地打包的编辑器 worker，避免 monaco 在运行时去 fetch 不存在的
  // worker 文件而产生网络错误与告警。
  (self as unknown as { MonacoEnvironment: MonacoEnvironmentLike }).MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
}

loader.config({ monaco });

export { monaco };
