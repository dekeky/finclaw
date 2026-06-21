import type { ProcessSegment } from '../types';
import { AGGREGATED_THOUGHT_JOIN } from './foldThoughtMessages';
import { AGGREGATED_TOOL_FEEDBACK_JOIN } from './foldPicoclawToolFeedback';

const TOOL_LABELS: Record<string, string> = {
  exec: '执行命令',
  read_file: '读取文件',
  write_file: '写入文件',
  edit_file: '编辑文件',
  list_dir: '浏览目录',
  web_search: '网络搜索',
  search: '搜索',
  fetch: '获取内容',
  browser: '浏览器操作',
};

export type ToolIconName =
  | 'exec'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'list_dir'
  | 'web_search'
  | 'search'
  | 'fetch'
  | 'browser'
  | 'default';

const CONTINUATION_HINT_RE = /^Continuing the current task\.?:\s*/i;

function stripContinuationHint(text: string): string {
  return text.replace(CONTINUATION_HINT_RE, '').trim();
}

function segmentToProcessSteps(segment: ProcessSegment): ProcessStep[] {
  return splitProcessParts(segment.content, segment.type).map((raw) => ({
    type: segment.type,
    raw,
    preview: segment.type === 'tool' ? formatToolLine(raw) : previewThoughtLine(raw),
  }));
}

function appendToolGroup(groups: ProcessStepGroup[], steps: ProcessStep[]): void {
  if (steps.length === 0) return;
  const last = groups[groups.length - 1];
  if (last?.type === 'tool') {
    last.steps.push(...steps);
    return;
  }
  groups.push({ type: 'tool', steps });
}

/**
 * 展示用分组：连续工具段合并为一块；两段工具之间夹着的思考段跳过（Agent 逐步推理），
 * 避免同一轮连续工具调用被拆成多个时间线节点。
 */
export function groupProcessSegmentsForDisplay(segments: ProcessSegment[]): ProcessStepGroup[] {
  const groups: ProcessStepGroup[] = [];
  let i = 0;

  while (i < segments.length) {
    const segment = segments[i];

    if (segment.type !== 'tool') {
      groups.push({ type: 'thought', steps: segmentToProcessSteps(segment) });
      i += 1;
      continue;
    }

    const toolSteps = segmentToProcessSteps(segment);
    i += 1;

    while (i < segments.length) {
      if (segments[i].type === 'tool') {
        toolSteps.push(...segmentToProcessSteps(segments[i]));
        i += 1;
        continue;
      }
      if (segments[i].type === 'thought' && segments[i + 1]?.type === 'tool') {
        i += 1;
        continue;
      }
      break;
    }

    appendToolGroup(groups, toolSteps);
  }

  return groups;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function resolveToolIconName(toolName: string): ToolIconName {
  if (toolName in TOOL_LABELS) return toolName as ToolIconName;
  return 'default';
}

function readJsonStringField(raw: string, field: string): string | null {
  const marker = `"${field}"`;
  const idx = raw.indexOf(marker);
  if (idx < 0) return null;

  let i = idx + marker.length;
  while (i < raw.length && /\s/.test(raw[i])) i += 1;
  if (raw[i] !== ':') return null;
  i += 1;
  while (i < raw.length && /\s/.test(raw[i])) i += 1;

  if (raw[i] === '"') {
    i += 1;
    let value = '';
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '\\') {
        i += 1;
        if (i >= raw.length) break;
        const next = raw[i];
        if (next === 'n') value += '\n';
        else if (next === 'r') value += '\r';
        else if (next === 't') value += '\t';
        else if (next === '"') value += '"';
        else if (next === '\\') value += '\\';
        else value += next;
        i += 1;
        continue;
      }
      if (ch === '"') return value;
      value += ch;
      i += 1;
    }
    return value || null;
  }

  const primitive = raw.slice(i).match(/^(-?\d+(?:\.\d+)?|true|false|null)/);
  return primitive ? primitive[1] : null;
}

function extractJsonRaw(content: string): string | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const jsonLabel = content.match(/\njson\s*\n([\s\S]*)/i);
  if (jsonLabel?.[1]) {
    const block = jsonLabel[1].trim();
    const brace = block.match(/\{[\s\S]*/);
    if (brace) return brace[0].trim();
  }

  const inline = content.match(/\{[\s\S]*\}/);
  if (inline) return inline[0].trim();

  const partial = content.match(/\{[\s\S]*/);
  return partial ? partial[0].trim() : null;
}

function parseToolJson(content: string): Record<string, unknown> | null {
  const jsonRaw = extractJsonRaw(content);
  if (!jsonRaw) return null;
  try {
    return JSON.parse(jsonRaw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readJsonFieldsLoose(content: string, ...fields: string[]): Record<string, string> {
  const jsonRaw = extractJsonRaw(content);
  if (!jsonRaw) return {};
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = readJsonStringField(jsonRaw, field);
    if (value != null && value !== '') out[field] = value;
  }
  return out;
}

function readStringField(json: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = json[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractToolExplanation(content: string, firstLine: string): string {
  let body = content.slice(firstLine.length).trim();
  if (!body) return '';

  const fenceIdx = body.search(/```(?:json)?/i);
  if (fenceIdx >= 0) body = body.slice(0, fenceIdx).trim();

  const jsonLabelIdx = body.search(/\njson\s*\n/i);
  if (jsonLabelIdx >= 0) body = body.slice(0, jsonLabelIdx).trim();

  const braceIdx = body.indexOf('{');
  if (braceIdx >= 0) body = body.slice(0, braceIdx).trim();

  return stripContinuationHint(body);
}

function formatFileWriteDetail(path: string | null, fileContent: string | null): string | null {
  const parts: string[] = [];
  if (path) parts.push(`文件：${path}`);
  if (fileContent) parts.push(`内容：\n${fileContent}`);
  return parts.length > 0 ? parts.join('\n\n') : null;
}

function extractToolDetail(toolName: string, content: string, json: Record<string, unknown> | null): string | null {
  const action = json && typeof json.action === 'string' ? json.action : '';
  const effectiveTool = toolName === 'exec' || action === 'run' ? 'exec' : toolName;
  const loose = readJsonFieldsLoose(content, 'path', 'file', 'file_path', 'filepath', 'content', 'command', 'query', 'url');

  if (effectiveTool === 'write_file' || effectiveTool === 'edit_file') {
    const path =
      (json && readStringField(json, 'path', 'file', 'file_path', 'filepath')) ??
      loose.path ??
      loose.file ??
      loose.file_path ??
      loose.filepath ??
      null;
    const fileContent =
      (json && readStringField(json, 'content', 'text', 'body')) ?? loose.content ?? null;
    const formatted = formatFileWriteDetail(path, fileContent);
    if (formatted) return formatted;
  }

  if (json) {
    if (effectiveTool === 'read_file') {
      const path = readStringField(json, 'path', 'file', 'file_path', 'filepath');
      if (path) return path;
    }
    if (effectiveTool === 'list_dir') {
      const path = readStringField(json, 'path', 'dir', 'directory');
      if (path) return path;
    }
    if (effectiveTool === 'exec') {
      const command = readStringField(json, 'command', 'cmd');
      if (command) return command;
    }
    if (toolName === 'web_search' || effectiveTool === 'search') {
      const query = readStringField(json, 'query', 'q', 'search');
      if (query) return query;
    }
    const query = readStringField(json, 'query', 'url');
    if (query) return query;
  }

  if (loose.command) return loose.command;
  if (loose.path) return loose.path;
  if (loose.query) return loose.query;
  if (loose.url) return loose.url;
  if (loose.content && (effectiveTool === 'write_file' || effectiveTool === 'edit_file')) {
    return `内容：\n${loose.content}`;
  }

  return null;
}

export interface FormattedTool {
  toolName: string;
  iconName: ToolIconName;
  label: string;
  detail: string;
}

/** 解析单条工具反馈：保留完整执行内容，仅隐藏 JSON 结构 */
export function formatToolFeedback(content: string): FormattedTool {
  const firstLine = content.split('\n')[0]?.trim() ?? content;
  const toolMatch = /^🔧\s*(?:`([^`]+)`|(\S+))(?:\s+(.+))?/.exec(firstLine);
  if (!toolMatch) {
    const fallback = firstLine.replace(/^🔧\s*/, '').trim();
    return {
      toolName: 'default',
      iconName: 'default',
      label: '工具',
      detail: fallback,
    };
  }

  const toolName = (toolMatch[1] || toolMatch[2] || '').trim();
  let inlineDesc = stripContinuationHint((toolMatch[3] || '').trim());
  const explanation = extractToolExplanation(content, firstLine);
  const json = parseToolJson(content);
  const structuredDetail = extractToolDetail(toolName, content, json);

  const detail = structuredDetail || explanation || inlineDesc;

  return {
    toolName,
    iconName: resolveToolIconName(toolName),
    label: toolLabel(toolName),
    detail,
  };
}

/** 折叠标题用：工具一步的文本预览 */
export function formatToolLine(content: string): string {
  const { label, detail } = formatToolFeedback(content);
  return detail ? `${label} · ${collapseWhitespace(detail)}` : label;
}

/** 折叠标题用：取思考首行预览（正文区展示完整内容，不在此截断） */
export function previewThoughtLine(content: string): string {
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) ?? content;
  return collapseWhitespace(firstLine) || '整理思路';
}

export function splitProcessParts(content: string, type: 'thought' | 'tool'): string[] {
  const join = type === 'tool' ? AGGREGATED_TOOL_FEEDBACK_JOIN : AGGREGATED_THOUGHT_JOIN;
  return content.split(join).map((part) => part.trim()).filter(Boolean);
}

export interface ProcessStep {
  type: 'thought' | 'tool';
  raw: string;
  preview: string;
}

export interface ProcessStepGroup {
  type: 'thought' | 'tool';
  steps: ProcessStep[];
}

/** 一组行动：前置思考 + 其后连续工具调用 */
export interface ProcessActionGroup {
  thoughts: ProcessStep[];
  tools: ProcessStep[];
}

/**
 * 按「思考 → 连续工具」分栏：每栏先收齐连续思考段，再收齐紧随其后的连续工具段；
 * 下一段思考开启新的一栏（工具之间的思考不再并入工具组）。
 */
export function groupProcessSegmentsIntoActions(segments: ProcessSegment[]): ProcessActionGroup[] {
  const actions: ProcessActionGroup[] = [];
  let i = 0;

  while (i < segments.length) {
    const thoughts: ProcessStep[] = [];
    const tools: ProcessStep[] = [];

    while (i < segments.length && segments[i].type !== 'tool') {
      thoughts.push(...segmentToProcessSteps(segments[i]));
      i += 1;
    }

    while (i < segments.length && segments[i].type === 'tool') {
      tools.push(...segmentToProcessSteps(segments[i]));
      i += 1;
    }

    if (thoughts.length > 0 || tools.length > 0) {
      actions.push({ thoughts, tools });
    }
  }

  return actions;
}

export function groupConsecutiveProcessSteps(steps: ProcessStep[]): ProcessStepGroup[] {
  const groups: ProcessStepGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (step.type === 'tool' && last?.type === 'tool') {
      last.steps.push(step);
    } else {
      groups.push({ type: step.type, steps: [step] });
    }
  }
  return groups;
}

export function flattenProcessSteps(segments: ProcessSegment[]): ProcessStep[] {
  const items: ProcessStep[] = [];
  for (const segment of segments) {
    for (const part of splitProcessParts(segment.content, segment.type)) {
      items.push({
        type: segment.type,
        raw: part,
        preview: segment.type === 'tool' ? formatToolLine(part) : previewThoughtLine(part),
      });
    }
  }
  return items;
}

/** 折叠标题：仅最新一步预览（统计数字由图标徽章展示） */
export function summarizeProcessPreview(segments: ProcessSegment[]): string {
  const actions = groupProcessSegmentsIntoActions(segments);
  if (actions.length === 0) return '工作过程';

  const lastAction = actions[actions.length - 1];
  const latest =
    lastAction.tools.length > 0
      ? lastAction.tools[lastAction.tools.length - 1]
      : lastAction.thoughts[lastAction.thoughts.length - 1];
  if (!latest) return '工作过程';

  const latestPrefix = latest.type === 'tool' ? '最新' : '当前';
  return `${latestPrefix}：${latest.preview}`;
}

/** 生成折叠标题：统计 + 最新一步预览 */
export function summarizeProcessSegments(segments: ProcessSegment[]): string {
  const actions = groupProcessSegmentsIntoActions(segments);
  if (actions.length === 0) return '工作过程';

  const thoughtCount = actions.reduce((n, a) => n + a.thoughts.length, 0);
  const toolCount = actions.reduce((n, a) => n + a.tools.length, 0);
  const parts: string[] = [`${actions.length} 轮行动`];
  if (thoughtCount > 0) parts.push(`思考 ${thoughtCount} 步`);
  if (toolCount > 0) parts.push(`工具 ${toolCount} 次`);

  const preview = summarizeProcessPreview(segments);
  if (preview === '工作过程') return parts.join(' · ');

  return `${parts.join(' · ')} — ${preview}`;
}
