import{j as e}from"./radix-CbEPGcFZ.js";import{a as n,v as j}from"./react-vendor-DN2CTUzv.js";import{i as N,f as z,p as w}from"./agentAssets-C9xlZAJl.js";import{u as S,d as C,D as I,f as M,M as E,c as v}from"./useTocHeadings-DX-YBzfe.js";import{aq as A,a as k,M as R,B as D,au as L}from"./index-iwgwYMlP.js";import{S as O}from"./scroll-area-DJ4jkctI.js";import{I as T}from"./IconExternalLink-meldsb0I.js";import"./IconTrash-CPMsF5ty.js";import"./syntax-highlighter-B8gEV188.js";import"./markdown-KTwjix2b.js";const _=`
.doc-share-body {
  position: relative;
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.doc-share-scroll {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.doc-share-scroll [data-slot="scroll-area-viewport"] {
  overflow-x: hidden !important;
  max-width: 100%;
}
/* Radix ScrollArea 会把内容包一层 display: table 的 div，
   会保留内容最小宽度而不收缩；强制成 block 100% 才能让正文跟随外层宽度重排。 */
.doc-share-scroll [data-slot="scroll-area-viewport"] > div {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
  overflow-x: hidden;
}
.doc-share-article {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
}
@media (max-width: 767px) {
  .doc-share-article {
    padding-inline: 12px;
    padding-block: 16px;
    overflow-x: hidden;
  }
  .doc-share-article .doc-reading-prose {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  .doc-share-article .doc-reading-prose :is(th, td) {
    padding-inline: 8px;
    padding-block: 6px;
  }
  .doc-share-article .doc-reading-prose :is(.group\\/code pre, pre) {
    font-size: 12px;
  }
}
/* 与 DocReadingPanel 一致：平板及以上居中窄栏 */
@media (min-width: 768px) {
  .doc-share-article {
    max-width: 48rem;
    padding-inline: 24px;
    padding-block: 24px;
  }
}
@media (min-width: 1024px) {
  .doc-share-article {
    max-width: 52rem;
    padding-inline: 32px;
    padding-block: 28px;
  }
}
@media (min-width: 1280px) {
  .doc-share-article {
    max-width: 56rem;
  }
}
.doc-reading-prose {
  max-width: 100%;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.doc-reading-prose :is(pre, table, img, video, iframe) {
  max-width: 100%;
}
.doc-reading-prose :is(.group\\/code, pre, .markdown-body > div) {
  max-width: 100%;
}
.doc-reading-prose .markdown-body {
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
.doc-reading-prose :is(.group\\/code, table) {
  -webkit-overflow-scrolling: touch;
}
.doc-dock-toc-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-trigger:hover {
  background: var(--muted);
  color: var(--foreground);
}
.doc-dock-toc-sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doc-dock-toc-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.doc-dock-toc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
  padding: 10px 8px 8px 14px;
  border-bottom: 1px solid var(--border);
}
.doc-dock-toc-collapse {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-collapse:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}
.doc-dock-toc-rail {
  flex-shrink: 0;
  width: 34px;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
}
.doc-dock-toc-expand {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 30px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-expand:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}
.doc-dock-toc-rail-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 10px;
  letter-spacing: 0.15em;
  color: var(--muted-foreground);
  user-select: none;
}
.doc-dock-toc-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  padding: 5px 12px 5px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted-foreground);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.doc-dock-toc-item:hover {
  background: rgba(139,92,246,0.07);
  color: var(--foreground);
}
.doc-dock-toc-item--active {
  border-left-color: #8b5cf6;
  background: rgba(139,92,246,0.09);
  color: #7c3aed;
  font-weight: 600;
}
.doc-dock-toc-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}
.doc-dock-toc-overlay--open {
  pointer-events: auto;
}
.doc-dock-toc-overlay-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(0, 0, 0, 0.28);
  opacity: 0;
  transition: opacity 0.18s ease;
  cursor: default;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-backdrop {
  opacity: 1;
}
.doc-dock-toc-overlay-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-panel {
  transform: translateX(0);
}
`;function F({content:o,fileName:s,className:c}){const l=n.useRef(null),a=A(),[r,i]=n.useState(!1),[p,d]=n.useState(typeof window<"u"?window.innerWidth:1024),t=N(s),{headings:m,activeId:f,scrollToHeading:g}=S(l,t?o:null,t),b=t&&m.length>0,x=b&&(a||p<900);return n.useEffect(()=>{const h=()=>d(window.innerWidth);return h(),window.addEventListener("resize",h),()=>window.removeEventListener("resize",h)},[]),n.useEffect(()=>{x||i(!1)},[x]),e.jsxs(e.Fragment,{children:[e.jsx("style",{children:_}),e.jsxs("div",{className:k("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card",c),children:[x&&e.jsx("div",{className:"flex shrink-0 justify-end border-b border-border/40 px-3 py-2",children:e.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>i(!0),title:"打开目录","aria-label":"打开目录",children:[e.jsx(C,{className:"size-3.5"}),"目录"]})}),e.jsxs("div",{className:"doc-share-body min-h-0 flex-1",children:[b&&!x&&e.jsx(I,{headings:m,activeId:f,onHeadingClick:g,storageKey:"finclaw.share.tocCollapsed"}),x&&e.jsx(M,{open:r,onOpenChange:i,headings:m,activeId:f,onHeadingClick:g}),e.jsx(O,{ref:l,className:"doc-share-scroll min-h-0 flex-1",children:t?e.jsx("div",{className:"doc-share-article",children:e.jsx(E,{copyableCode:!0,size:a?"sm":"md",className:"doc-reading-prose",children:o})}):e.jsx("pre",{className:"doc-share-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:o})})]})]})]})}function y({className:o,...s}){return e.jsx("svg",{viewBox:"0 0 24 24",fill:"currentColor","aria-hidden":!0,className:k("size-4 shrink-0",o),...s,children:e.jsx("path",{d:"M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"})})}const u="https://github.com/dekeky/finclaw";function B({children:o}){return e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-x-4 gap-y-2",children:[e.jsxs("a",{href:u,target:"_blank",rel:"noopener noreferrer",className:"group inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground",children:[e.jsx(L,{variant:"mark",size:18,decorative:!0}),e.jsx("span",{className:"font-semibold text-foreground/90",children:"Finclaw"}),e.jsx("span",{className:"hidden text-muted-foreground/70 sm:inline",children:"·"}),e.jsx("span",{className:"hidden text-muted-foreground sm:inline",children:"AI × 金融 · 开源多 Agent 投研平台"}),e.jsx(y,{className:"size-3.5 opacity-60 transition-opacity group-hover:opacity-100"})]}),o]})}function H(){return e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground",children:[e.jsxs("span",{children:["由"," ",e.jsx("a",{href:u,target:"_blank",rel:"noopener noreferrer",className:"font-medium text-foreground/80 transition-colors hover:text-foreground hover:underline",children:"Finclaw"})," ","提供 · 开源 · Apache-2.0"]}),e.jsxs("a",{href:u,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1.5 transition-colors hover:text-foreground hover:underline",children:[e.jsx(y,{className:"size-3"}),"github.com/dekeky/finclaw",e.jsx(T,{className:"size-3"})]})]})}function Y(){const{token:o=""}=j(),[s,c]=n.useState(!0),[l,a]=n.useState(null),[r,i]=n.useState(null);n.useEffect(()=>{if(!o){a("无效的分享链接"),c(!1);return}let d=!1;return c(!0),a(null),z(o).then(t=>{if(!d){if(t.is_dir){a("暂不支持分享文件夹，请分享单个文件。"),i(null);return}i(t)}}).catch(t=>{d||(a(t instanceof Error?t.message:"加载失败"),i(null))}).finally(()=>{d||c(!1)}),()=>{d=!0}},[o]);const p=(r==null?void 0:r.name)||(r==null?void 0:r.path)||"";return e.jsxs("div",{className:"flex h-dvh min-h-0 flex-col bg-background",children:[e.jsx("header",{className:"shrink-0 border-b border-border/50 bg-muted/10 px-3 py-2 sm:px-4 sm:py-2.5",children:e.jsx("div",{className:"mx-auto w-full max-w-7xl",children:e.jsx(B,{children:r&&e.jsxs("div",{className:"flex min-w-0 items-center gap-2",children:[e.jsx("span",{className:"hidden text-[11px] text-muted-foreground sm:inline",children:"分享文件"}),e.jsx("span",{className:"max-w-[10rem] truncate text-xs font-medium text-foreground sm:max-w-[20rem]",title:r.name,children:r.name}),e.jsx("a",{href:w(o),className:"inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",title:"下载原文件","aria-label":"下载原文件",children:e.jsx(v,{className:"size-3.5"})})]})})})}),e.jsx("main",{className:"mx-auto flex min-h-0 w-full max-w-7xl min-w-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4",children:s?e.jsxs("div",{className:"flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground",children:[e.jsx(R,{className:"size-5 animate-spin"}),"加载分享内容…"]}):l?e.jsx("div",{className:"rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive",children:l}):r!=null&&r.content?e.jsx(F,{content:r.content,fileName:p,className:"min-h-0 flex-1"}):e.jsxs("div",{className:"rounded-lg border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground",children:[e.jsx("p",{className:"mb-4",children:"该文件无法在线预览，请下载原文件后查看。"}),e.jsx(D,{asChild:!0,variant:"outline",size:"sm",children:e.jsxs("a",{href:w(o),children:[e.jsx(v,{className:"mr-1 size-3.5"}),"下载原文件"]})})]})}),e.jsx("footer",{className:"shrink-0 border-t border-border/40 px-3 py-2 sm:px-4 sm:py-2.5",children:e.jsx("div",{className:"mx-auto w-full max-w-7xl",children:e.jsx(H,{})})})]})}export{Y as default};
