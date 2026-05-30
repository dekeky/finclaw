import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChevronRight, IconFileDescription, IconFolder, IconFolderOpen } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { MarketFileEntry } from '../api/agentMarket';

interface TreeNode {
  name: string;
  /** 完整相对路径（文件用于打开；目录用于 key）。 */
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 把扁平的文件列表组织成目录树。 */
function buildTree(files: MarketFileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, size: 0, children: [] };
  for (const f of files) {
    const parts = normalize(f.path).split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;
    parts.forEach((part, idx) => {
      const isLeaf = idx === parts.length - 1;
      const fullPath = parts.slice(0, idx + 1).join('/');
      let child = cursor.children.find((c) => c.name === part && c.isDir === !isLeaf);
      if (!child) {
        child = {
          name: part,
          path: fullPath,
          isDir: !isLeaf,
          size: isLeaf ? f.size : 0,
          children: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    });
  }
  sortTree(root);
  return root.children;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) if (c.isDir) sortTree(c);
}

function ancestorDirPaths(filePath: string): string[] {
  const parts = normalize(filePath).split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    dirs.push(acc);
  }
  return dirs;
}

function FileRow({
  node,
  paddingLeft,
  selected,
  onSelect,
}: {
  node: TreeNode;
  paddingLeft: number;
  selected: boolean;
  onSelect: (path: string) => void;
}) {
  const md = isMarkdown(node.name);
  const size = formatSize(node.size);
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      title={`${node.path} · 点击查看`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-muted/80',
        selected && 'bg-accent/80',
      )}
      style={{ paddingLeft }}
    >
      <IconFileDescription
        className={cn('size-3.5 shrink-0', md ? 'text-violet-500/70' : 'text-muted-foreground')}
        stroke={1.75}
      />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs text-foreground/90">{node.name}</span>
        {size && <span className="shrink-0 text-[10px] text-muted-foreground">{size}</span>}
      </span>
    </button>
  );
}

function DirRow({
  node,
  level,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode;
  level: number;
  expanded: boolean;
  onToggle: () => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const paddingLeft = 8 + level * 12;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-muted/80"
        style={{ paddingLeft }}
      >
        <IconChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
        {expanded ? (
          <IconFolderOpen className="size-3.5 shrink-0 text-amber-500/70" stroke={1.75} />
        ) : (
          <IconFolder className="size-3.5 shrink-0 text-amber-500/70" stroke={1.75} />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{node.name}</span>
      </button>
      {expanded && (
        <TreeLevel
          nodes={node.children}
          level={level + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      )}
    </div>
  );
}

function TreeLevel({
  nodes,
  level,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  nodes: TreeNode[];
  level: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  return (
    <div>
      {nodes.map((n) =>
        n.isDir ? (
          <DirRow
            key={`d:${n.path}`}
            node={n}
            level={level}
            expanded={expandedDirs.has(n.path)}
            onToggle={() => onToggleDir(n.path)}
            selectedPath={selectedPath}
            onSelect={onSelect}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        ) : (
          <FileRow
            key={`f:${n.path}`}
            node={n}
            paddingLeft={8 + level * 12}
            selected={selectedPath === n.path}
            onSelect={onSelect}
          />
        ),
      )}
    </div>
  );
}

interface MarketFileTreeProps {
  files: MarketFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/** 以「Agent 资产」式的文件树展示模板内容，点击文件触发阅读面板。 */
export function MarketFileTree({ files, selectedPath, onSelect }: MarketFileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedDirs(new Set());
  }, [files]);

  useEffect(() => {
    if (!selectedPath) return;
    const dirs = ancestorDirPaths(selectedPath);
    if (dirs.length === 0) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const d of dirs) next.add(d);
      return next;
    });
  }, [selectedPath]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (tree.length === 0) {
    return <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">该模板暂无文件</p>;
  }
  return (
    <div className="py-1">
      <TreeLevel
        nodes={tree}
        level={0}
        selectedPath={selectedPath}
        onSelect={onSelect}
        expandedDirs={expandedDirs}
        onToggleDir={toggleDir}
      />
    </div>
  );
}
