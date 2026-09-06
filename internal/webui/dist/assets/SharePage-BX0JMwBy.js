import{j as e}from"./radix-CxiPtrkn.js";import{a,v as E}from"./react-vendor-DN2CTUzv.js";import{M as T,b as A,f as L,a as y,p as j}from"./MarkdownContent-CwSkNYgU.js";import{i as M,u as R,d as _,D as O,e as D}from"./asset-tree-rows-BLFWcLq3.js";import{ab as B,a as v,B as z,aa as F,C as P,ag as H}from"./index-Bj62KU5F.js";import{S}from"./scroll-area-BU0jTzmh.js";import{m as W,I as U,S as G,r as V,d as X,c as q,R as K}from"./StrategyPlatformField-B6wjSqv_.js";import{n as J,I as N}from"./strategyPlatforms-BLpJtA3q.js";import"./monaco-DZe73WsJ.js";import"./markdown-B5DK3FAo.js";import"./charts-Bh68vz78.js";import"./monacoSetup-trpfDLfG.js";const Q=`
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
`;function Y({content:o,fileName:m,className:i}){const n=a.useRef(null),d=B(),[r,l]=a.useState(!1),[u,c]=a.useState(typeof window<"u"?window.innerWidth:1024),s=M(m),{headings:p,activeId:b,scrollToHeading:h}=R(n,s?o:null,s),f=s&&p.length>0,x=f&&(d||u<900);return a.useEffect(()=>{const g=()=>c(window.innerWidth);return g(),window.addEventListener("resize",g),()=>window.removeEventListener("resize",g)},[]),a.useEffect(()=>{x||l(!1)},[x]),e.jsxs(e.Fragment,{children:[e.jsx("style",{children:Q}),e.jsxs("div",{className:v("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card",i),children:[x&&e.jsx("div",{className:"flex shrink-0 justify-end border-b border-border/40 px-3 py-2",children:e.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>l(!0),title:"打开目录","aria-label":"打开目录",children:[e.jsx(_,{className:"size-3.5"}),"目录"]})}),e.jsxs("div",{className:"doc-share-body min-h-0 flex-1",children:[f&&!x&&e.jsx(O,{headings:p,activeId:b,onHeadingClick:h,storageKey:"finclaw.share.tocCollapsed"}),x&&e.jsx(D,{open:r,onOpenChange:l,headings:p,activeId:b,onHeadingClick:h}),e.jsx(S,{ref:n,className:"doc-share-scroll min-h-0 flex-1",children:s?e.jsx("div",{className:"doc-share-article",children:e.jsx(T,{copyableCode:!0,size:d?"sm":"md",className:"doc-reading-prose",children:o})}):e.jsx("pre",{className:"doc-share-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:o})})]})]})]})}function Z({name:o,platform:m,script:i,runs:n,shareToken:d}){var k;const[r,l]=a.useState("code"),[u,c]=a.useState(((k=n[0])==null?void 0:k.id)??null),[s,p]=a.useState(!1),[b,h]=a.useState(!1),f=a.useMemo(()=>n.find(t=>t.id===u)??n[0]??null,[n,u]),x=J(m??""),g=async()=>{if(i.trim())try{await A(i),p(!0),h(!1),window.setTimeout(()=>p(!1),2e3)}catch{p(!1),h(!0),window.setTimeout(()=>h(!1),2e3)}};return e.jsxs("div",{className:"flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card",children:[e.jsxs("div",{className:"flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-2.5",children:[x!=="finclaw"?e.jsx(W,{platform:x}):null,e.jsx("nav",{className:"flex h-full items-stretch gap-0 self-stretch",children:[["code","策略代码"],...n.length?[["runs","回测结果"]]:[]].map(([t,w])=>e.jsx("button",{type:"button",className:v("h-full px-3 text-[12px] transition-colors",r===t?"border-b-2 border-violet-600 font-medium text-violet-700 dark:border-violet-400 dark:text-violet-300":"border-b-2 border-transparent text-muted-foreground hover:text-foreground"),onClick:()=>l(t),children:w},t))}),r==="code"?e.jsxs(z,{type:"button",variant:"ghost",size:"xs",className:"ml-auto",disabled:!i.trim(),title:"复制策略代码到剪贴板","aria-label":"复制策略代码",onClick:()=>void g(),children:[s?e.jsx(F,{className:"size-3.5",stroke:1.75}):e.jsx(U,{className:"size-3.5",stroke:1.75}),b?"复制失败":s?"已复制":"复制"]}):null]}),r==="code"?e.jsx(G,{value:i,readOnly:!0,className:"min-h-0 flex-1"}):f?e.jsxs("div",{className:"flex min-h-0 flex-1 overflow-hidden",children:[e.jsx(S,{className:"w-56 shrink-0 border-r border-border/50",children:e.jsx("div",{className:"p-1.5",children:n.map(t=>{const w=t.id===f.id;return e.jsxs("button",{type:"button",className:v("mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs",w?"bg-violet-500/12 font-medium text-violet-800 dark:text-violet-200":"hover:bg-muted/60"),onClick:()=>c(t.id),children:[e.jsx("span",{className:"block truncate",children:V(t)}),e.jsxs("span",{className:"text-[11px] text-muted-foreground",children:[X[t.status]??t.status," · ",q(t.updated_at||t.created_at)]})]},t.id)})})}),e.jsx("div",{className:"fquant-ui min-h-0 min-w-0 flex-1 overflow-hidden",children:e.jsx(K,{detail:f,readOnly:!0,shareToken:d})})]}):e.jsx("div",{className:"flex flex-1 items-center justify-center text-sm text-muted-foreground",children:"暂无回测结果"}),e.jsx("p",{className:"sr-only",children:o})]})}function C({className:o,...m}){return e.jsx("svg",{viewBox:"0 0 24 24",fill:"currentColor","aria-hidden":!0,className:v("size-4 shrink-0",o),...m,children:e.jsx("path",{d:"M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"})})}const I="https://github.com/dekeky/finclaw",$="https://finclaw.chat/";function ee({children:o}){return e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-x-4 gap-y-2",children:[e.jsxs("a",{href:I,target:"_blank",rel:"noopener noreferrer",className:"group inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground",children:[e.jsx(H,{variant:"mark",size:18,decorative:!0}),e.jsx("span",{className:"font-semibold text-foreground/90",children:"Finclaw"}),e.jsx("span",{className:"hidden text-muted-foreground/70 sm:inline",children:"·"}),e.jsx("span",{className:"hidden text-muted-foreground sm:inline",children:"AI × 金融 × 量化 多 Agent 投研平台"}),e.jsx(C,{className:"size-3.5 opacity-60 transition-opacity group-hover:opacity-100"})]}),o]})}function re(){return e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground",children:[e.jsxs("a",{href:$,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1.5 transition-colors hover:text-foreground hover:underline",children:["在线体验",e.jsx(N,{className:"size-3"})]}),e.jsxs("a",{href:I,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1.5 transition-colors hover:text-foreground hover:underline",children:[e.jsx(C,{className:"size-3"}),"github.com/dekeky/finclaw",e.jsx(N,{className:"size-3"})]})]})}function ue(){const{token:o=""}=E(),[m,i]=a.useState(!0),[n,d]=a.useState(null),[r,l]=a.useState(null);a.useEffect(()=>{if(!o){d("无效的分享链接"),i(!1);return}let c=!1;return i(!0),d(null),L(o).then(s=>{if(!c){if(s.is_dir){d("暂不支持分享文件夹，请分享单个文件。"),l(null);return}l(s)}}).catch(s=>{c||(d(s instanceof Error?s.message:"加载失败"),l(null))}).finally(()=>{c||i(!1)}),()=>{c=!0}},[o]);const u=(r==null?void 0:r.name)||(r==null?void 0:r.path)||"";return e.jsxs("div",{className:"flex h-dvh min-h-0 flex-col bg-background",children:[e.jsx("header",{className:"shrink-0 border-b border-border/50 bg-muted/10 px-3 py-2 sm:px-4 sm:py-2.5",children:e.jsx("div",{className:"mx-auto w-full max-w-7xl",children:e.jsx(ee,{children:r&&e.jsxs("div",{className:"flex min-w-0 items-center gap-2",children:[e.jsx("span",{className:"hidden text-[11px] text-muted-foreground sm:inline",children:r.kind==="strategy"?"分享策略":"分享文件"}),e.jsx("span",{className:"max-w-[10rem] truncate text-xs font-medium text-foreground sm:max-w-[20rem]",title:r.name,children:r.name}),e.jsx("a",{href:j(o),className:"inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",title:"下载原文件","aria-label":"下载原文件",children:e.jsx(y,{className:"size-3.5"})})]})})})}),e.jsx("main",{className:"mx-auto flex min-h-0 w-full max-w-7xl min-w-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4",children:m?e.jsxs("div",{className:"flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground",children:[e.jsx(P,{className:"size-5 animate-spin"}),"加载分享内容…"]}):n?e.jsx("div",{className:"rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive",children:n}):(r==null?void 0:r.kind)==="strategy"&&r.script!=null?e.jsx(Z,{name:r.name,platform:r.platform,script:r.script,shareToken:o,runs:Array.isArray(r.runs)?r.runs:[]}):r!=null&&r.content?e.jsx(Y,{content:r.content,fileName:u,className:"min-h-0 flex-1"}):e.jsxs("div",{className:"rounded-lg border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground",children:[e.jsx("p",{className:"mb-4",children:"该文件无法在线预览，请下载原文件后查看。"}),e.jsx(z,{asChild:!0,variant:"outline",size:"sm",children:e.jsxs("a",{href:j(o),children:[e.jsx(y,{className:"mr-1 size-3.5"}),"下载原文件"]})})]})}),e.jsx("footer",{className:"shrink-0 border-t border-border/40 px-3 py-2 sm:px-4 sm:py-2.5",children:e.jsx("div",{className:"mx-auto w-full max-w-7xl",children:e.jsx(re,{})})})]})}export{ue as default};
