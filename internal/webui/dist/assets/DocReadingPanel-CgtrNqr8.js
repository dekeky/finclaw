import{j as t,p as Je,q as qe,r as Ve,s as Ze,t as Qe,R as et,P as tt,O as ot,C as nt,T as rt,D as at}from"./radix-B5JjEh1k.js";import{a as s,R as fe}from"./react-vendor-DN2CTUzv.js";import{S as it}from"./scroll-area-ByuBSKYr.js";import{a as st,M as dt}from"./MarkdownContent-DSg5vvsW.js";import{u as ct,a as lt,b as ut,c as pt,D as ft,d as ht}from"./useTocHeadings-C7V8mt1H.js";import{c as xt,a6 as mt,J as gt,T as bt,G as vt,a as R,H as wt,B as he,s as kt,a7 as yt,R as xe,a8 as jt,t as Ct,n as zt}from"./index-VwLHWHAy.js";import{a as St,b as Nt}from"./syntax-highlighter-BtGYouv3.js";import{d as Rt,b as De,f as It}from"./ThemeToggle-vvltTq-T.js";import{I as Et,f as Lt}from"./select-DSnm6-Ik.js";import{I as Dt}from"./IconRefresh-Bl4CbkkL.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Tt=[["path",{d:"M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2",key:"svg-0"}],["path",{d:"M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",key:"svg-1"}],["path",{d:"M14 4l0 4l-6 0l0 -4",key:"svg-2"}]],Pt=xt("outline","device-floppy","DeviceFloppy",Tt),K="/api/v1/agents";function Y(){const o=gt();return o?{Authorization:`Bearer ${o}`}:{}}function ae(o){if(o.code!==200)throw new Error(o.errMsg||"request failed");return o.body}async function jo(o,e){const n=e?`?subpath=${encodeURIComponent(e)}`:"",a=await fetch(`${K}/${encodeURIComponent(o)}/docs${n}`,{headers:{...Y()}});return ae(await a.json())}async function At(o,e){const n=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${encodeURIComponent(o)}/docs/${n}`,{headers:{...Y()}});return ae(await a.json())}async function Co(o,e,n){const a=e.split("/").map(encodeURIComponent).join("/"),i=await fetch(`${K}/${encodeURIComponent(o)}/docs/${a}`,{method:"PUT",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify({content:n})});return ae(await i.json())}async function zo(o,e,n=!1){const a=e.split("/").map(encodeURIComponent).join("/"),i=await fetch(`${K}/${encodeURIComponent(o)}/docs/${a}?download=1`,{headers:{...Y()}}),u=e.split("/").pop()??e,l=n?`${u}.zip`:u;await mt(i,l)}async function So(o,e){const n=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${encodeURIComponent(o)}/docs/${n}`,{method:"DELETE",headers:{...Y()}});ae(await a.json())}async function Mt(o,e){const n=await fetch(`${K}/${encodeURIComponent(o)}/docs/polish`,{method:"POST",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify(e)});return ae(await n.json())}var Ot=s.useLayoutEffect,Ht=function(e){var n=fe.useRef(e);return Ot(function(){n.current=e}),n},Ne=function(e,n){if(typeof e=="function"){e(n);return}e.current=n},_t=function(e,n){var a=fe.useRef();return fe.useCallback(function(i){e.current=i,a.current&&Ne(a.current,null),a.current=n,n&&Ne(n,i)},[n])},Re={"min-height":"0","max-height":"none",height:"0",visibility:"hidden",overflow:"hidden",position:"absolute","z-index":"-1000",top:"0",right:"0",display:"block"},Ft=function(e){Object.keys(Re).forEach(function(n){e.style.setProperty(n,Re[n],"important")})},Ie=Ft,w=null,Ee=function(e,n){var a=e.scrollHeight;return n.sizingStyle.boxSizing==="border-box"?a+n.borderSize:a-n.paddingSize};function $t(o,e,n,a){n===void 0&&(n=1),a===void 0&&(a=1/0),w||(w=document.createElement("textarea"),w.setAttribute("tabindex","-1"),w.setAttribute("aria-hidden","true"),Ie(w)),w.parentNode===null&&document.body.appendChild(w);var i=o.paddingSize,u=o.borderSize,l=o.sizingStyle,b=l.boxSizing;Object.keys(l).forEach(function(p){var x=p;w.style[x]=l[x]}),Ie(w),w.value=e;var h=Ee(w,o);w.value=e,h=Ee(w,o),w.value="x";var k=w.scrollHeight-i,v=k*n;b==="border-box"&&(v=v+i+u),h=Math.max(v,h);var c=k*a;return b==="border-box"&&(c=c+i+u),h=Math.min(c,h),[h,k]}var Le=function(){},Ut=function(e,n){return e.reduce(function(a,i){return a[i]=n[i],a},{})},Wt=["borderBottomWidth","borderLeftWidth","borderRightWidth","borderTopWidth","boxSizing","fontFamily","fontSize","fontStyle","fontWeight","letterSpacing","lineHeight","paddingBottom","paddingLeft","paddingRight","paddingTop","tabSize","textIndent","textRendering","textTransform","width","wordBreak","wordSpacing","scrollbarGutter"],Bt=!!document.documentElement.currentStyle,Gt=function(e){var n=window.getComputedStyle(e);if(n===null)return null;var a=Ut(Wt,n),i=a.boxSizing;if(i==="")return null;Bt&&i==="border-box"&&(a.width=parseFloat(a.width)+parseFloat(a.borderRightWidth)+parseFloat(a.borderLeftWidth)+parseFloat(a.paddingRight)+parseFloat(a.paddingLeft)+"px");var u=parseFloat(a.paddingBottom)+parseFloat(a.paddingTop),l=parseFloat(a.borderBottomWidth)+parseFloat(a.borderTopWidth);return{sizingStyle:a,paddingSize:u,borderSize:l}},Kt=Gt;function ge(o,e,n){var a=Ht(n);s.useLayoutEffect(function(){var i=function(l){return a.current(l)};if(o)return o.addEventListener(e,i),function(){return o.removeEventListener(e,i)}},[])}var Yt=function(e,n){ge(document.body,"reset",function(a){e.current.form===a.target&&n(a)})},Xt=function(e){ge(window,"resize",e)},Jt=function(e){ge(document.fonts,"loadingdone",e)},qt=["cacheMeasurements","maxRows","minRows","onChange","onHeightChange"],Vt=function(e,n){var a=e.cacheMeasurements,i=e.maxRows,u=e.minRows,l=e.onChange,b=l===void 0?Le:l,h=e.onHeightChange,k=h===void 0?Le:h,v=St(e,qt),c=v.value!==void 0,p=s.useRef(null),x=_t(p,n),j=s.useRef(0),f=s.useRef(),C=function(){var y=p.current,S=a&&f.current?f.current:Kt(y);if(S){f.current=S;var N=$t(S,y.value||y.placeholder||"x",u,i),P=N[0],X=N[1];j.current!==P&&(j.current=P,y.style.setProperty("height",P+"px","important"),k(P,{rowHeight:X}))}},z=function(y){c||C(),b(y)};return s.useLayoutEffect(C),Yt(p,function(){if(!c){var I=p.current.value;requestAnimationFrame(function(){var y=p.current;y&&I!==y.value&&C()})}}),Xt(C),Jt(C),s.createElement("textarea",Nt({},v,{onChange:z,ref:x}))},Zt=s.forwardRef(Vt);function Qt({open:o,onOpenChange:e,prompt:n,onPromptChange:a,onSubmit:i,submitting:u=!1,disabled:l=!1,placeholder:b="翻译为中文",triggerClassName:h,side:k="bottom",align:v="center"}){const c=u||l;return t.jsxs(Je,{open:o,onOpenChange:e,modal:!1,children:[t.jsxs(bt,{children:[t.jsx(vt,{asChild:!0,children:t.jsx(qe,{asChild:!0,children:t.jsx("button",{type:"button",className:R("flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90",c&&"opacity-80",h),disabled:c,"aria-label":o?"收起润色输入":"AI 润色","aria-expanded":o,children:t.jsx("span",{className:R("flex size-6 items-center justify-center rounded-md",Rt),children:t.jsx(Et,{className:"size-3.5",stroke:1.75,"aria-hidden":!0})})})})}),t.jsx(wt,{side:"bottom",sideOffset:6,className:"z-[1220]",children:o?"收起润色输入":"AI 润色"})]}),t.jsx(Ve,{children:t.jsxs(Ze,{side:k,align:v,sideOffset:10,collisionPadding:12,className:R("z-[1220] w-[min(92vw,22rem)] rounded-xl p-3 shadow-xl outline-none","border border-violet-500/30 bg-background/72 backdrop-blur-xl","supports-backdrop-filter:bg-background/55",It,"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95","data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"),onOpenAutoFocus:p=>{const x=p.currentTarget.querySelector("textarea");x instanceof HTMLTextAreaElement&&(p.preventDefault(),x.focus())},children:[t.jsx(Qe,{className:"fill-background/80"}),t.jsx("p",{className:"text-xs font-medium text-violet-800 dark:text-violet-200",children:"AI 润色"}),t.jsx("p",{className:"mt-0.5 text-[11px] leading-relaxed text-muted-foreground",children:"输入润色要求，下方文档仍可浏览与滚动"}),t.jsxs("div",{className:"mt-2.5 flex flex-col gap-2",children:[t.jsx(Zt,{value:n,onChange:p=>a(p.target.value),placeholder:b,disabled:c,minRows:2,maxRows:8,className:R("w-full min-w-0 resize-none rounded-md border border-violet-500/20 bg-background/80 px-2.5 py-1.5 text-xs","break-words whitespace-pre-wrap leading-relaxed","placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet-500/30","disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"),onKeyDown:p=>{p.key==="Enter"&&(p.ctrlKey||p.metaKey)&&(p.preventDefault(),n.trim()&&!c&&i())}}),t.jsx("p",{className:"text-[10px] text-muted-foreground/80",children:"Ctrl+Enter 开始润色"}),t.jsx(he,{type:"button",size:"sm",className:R("h-8 w-full text-xs",De),disabled:!n.trim()||c,onClick:()=>i(),children:u?"润色中…":"开始润色"})]})]})})]})}function eo({status:o}){return o==="done"?t.jsx(yt,{className:"size-4 text-emerald-600","aria-hidden":!0}):o==="active"?t.jsx(xe,{className:"size-4 animate-spin text-primary","aria-hidden":!0}):o==="error"?t.jsx("span",{className:"size-4 text-center text-xs text-destructive",children:"!"}):t.jsx("span",{className:"size-4 rounded-full border border-border/80 bg-muted/40","aria-hidden":!0})}function to({open:o,fileName:e,prompt:n,subject:a,subjectLabel:i="提示词",title:u,description:l,successMessage:b,steps:h,error:k,phase:v}){const c=e?kt[e].title:"",p=u??(c?`AI 润色 ${c}`:"AI 处理中"),x=l??"正在根据你的描述润色内容…",j=a??n??"";return t.jsx(et,{open:o,children:t.jsxs(tt,{children:[t.jsx(ot,{className:"fixed inset-0 z-[1210] bg-black/40 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0"}),t.jsxs(nt,{className:R("fixed left-1/2 top-1/2 z-[1211] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2","rounded-xl border border-border bg-background p-5 shadow-xl","data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"),onPointerDownOutside:f=>f.preventDefault(),onEscapeKeyDown:f=>f.preventDefault(),children:[t.jsx(rt,{className:"text-sm font-semibold text-foreground",children:p}),t.jsx(at,{className:"mt-1 text-xs text-muted-foreground",children:x}),t.jsxs("div",{className:"mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2",children:[t.jsx("p",{className:"text-[10px] font-medium uppercase tracking-wide text-muted-foreground",children:i}),t.jsx("p",{className:"mt-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",children:j})]}),t.jsx("ol",{className:"mt-4 space-y-2.5",children:h.map(f=>t.jsxs("li",{className:"flex items-start gap-2.5",children:[t.jsx("span",{className:"mt-0.5 flex size-5 shrink-0 items-center justify-center",children:t.jsx(eo,{status:f.status})}),t.jsx("span",{className:R("text-xs leading-relaxed",f.status==="active"&&"font-medium text-foreground",f.status==="done"&&"text-muted-foreground",f.status==="pending"&&"text-muted-foreground/70",f.status==="error"&&"text-destructive"),children:f.label})]},f.id))}),v==="success"&&t.jsx("p",{className:"mt-4 text-xs text-emerald-600",children:b??"润色完成，正在关闭…"}),v==="error"&&k&&t.jsx("p",{className:"mt-4 text-xs text-destructive",children:k})]})]})})}const oo=[{id:"validate",label:"校验输入"},{id:"call",label:"正在润色"},{id:"finalize",label:"写入编辑器"}];function W(){return oo.map(o=>({id:o.id,label:o.label,status:"pending"}))}function te(o,e,n,a){return o.map(i=>a&&i.id===a?{...i,status:"error"}:n.includes(i.id)?{...i,status:"done"}:i.id===e?{...i,status:"active"}:{...i,status:"pending"})}const ne=480,re=400,Te="finclaw.docDock.position",no=768,ro=900;function oe(){return typeof window<"u"&&window.innerWidth<no}function B(o,e,n){return Math.min(n,Math.max(e,o))}function me(){return{left:0,top:0,width:window.innerWidth,height:window.innerHeight}}function Pe(){const o=window.innerWidth,e=window.innerHeight;if(oe())return{width:o,height:e};const n=24,a=Math.round(o*.85),i=Math.round(e*.8);return{width:B(a,ne,Math.max(ne,o-n*2)),height:B(i,re,Math.max(re,e-n*2))}}function G(o,e=8){if(oe())return me();const n=window.innerWidth,a=window.innerHeight;let{left:i,top:u,width:l,height:b}=o;const h=Math.max(ne,n-e*2),k=Math.max(re,a-e*2);return l=B(l,ne,h),b=B(b,re,k),i=B(i,e,n-l-e),u=B(u,e,a-b-e),{left:i,top:u,width:l,height:b}}function ao(){const{width:o,height:e}=Pe(),n=Math.round((window.innerWidth-o)/2),a=Math.round((window.innerHeight-e)/2);return G({left:n,top:a,width:o,height:e})}function io(o){if(!o||typeof o!="object")return null;const e=o;if(typeof e.left!="number"||typeof e.top!="number")return null;const n=Pe(),a=typeof e.width=="number"?e.width:n.width,i=typeof e.height=="number"?e.height:n.height;return G({left:e.left,top:e.top,width:a,height:i})}function so(){try{const o=localStorage.getItem(Te);if(!o)return null;const e=JSON.parse(o);return e.dock!=null?io(e.dock):null}catch{return null}}function co(o){try{localStorage.setItem(Te,JSON.stringify({dock:o}))}catch{}}function lo(o,e,n,a,i=8){const u=Math.max(i,window.innerWidth-n-i),l=Math.max(i,window.innerHeight-a-i);return{left:Math.min(u,Math.max(i,o)),top:Math.min(l,Math.max(i,e))}}function uo(o){const e=o.toLowerCase();return e.endsWith(".md")||e.endsWith(".markdown")}const po=`
.doc-dock-backdrop {
  position: fixed; inset: 0; z-index: 1090;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: docDockFadeIn 0.15s ease-out;
}
.doc-dock {
  position: fixed; z-index: 1100;
  display: flex; flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  min-width: 0;
  max-width: 100vw;
  animation: docDockIn 0.2s ease-out;
}
.doc-dock-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 42px;
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 60%, var(--card));
  user-select: none;
}
.doc-dock-head-left {
  min-width: 0;
  justify-self: start;
}
.doc-dock-head-center {
  justify-self: center;
  min-width: 0;
}
.doc-dock-head-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 4px;
}
.doc-dock-drag {
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.doc-dock-drag:active { cursor: grabbing; }
.doc-dock-title {
  font-size: 13px; font-weight: 600;
  color: var(--foreground);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.doc-dock-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground); font-size: 16px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.doc-dock-close:hover {
  background: var(--muted);
  color: var(--foreground);
}
.doc-dock-resize {
  position: absolute; right: 0; bottom: 0;
  width: 18px; height: 18px;
  cursor: nwse-resize;
  z-index: 2;
}
.doc-dock-resize::after {
  content: '';
  position: absolute; right: 4px; bottom: 4px;
  width: 8px; height: 8px;
  border-right: 2px solid var(--border);
  border-bottom: 2px solid var(--border);
}

@keyframes docDockIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes docDockFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ─── 内容区 flex 容器 ─── */
.doc-dock-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.doc-dock-scroll {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.doc-dock-scroll [data-slot="scroll-area-viewport"] {
  overflow-x: hidden !important;
  max-width: 100%;
}
.doc-dock-scroll [data-slot="scroll-area-viewport"] > div {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* ─── 目录侧边栏 ─── */
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

/* 收起态窄轨 */
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

/* ─── 阅读区：舒适行宽 + 长词换行 ─── */
.doc-dock-article {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
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

/* ─── 浮层目录：覆盖在正文上方，不占横向空间 ─── */
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
  flex-shrink: 0;
}
.doc-dock-toc-trigger:hover {
  background: var(--muted);
  color: var(--foreground);
}

/* ─── 手机：全屏阅读，隐藏拖拽缩放 ─── */
@media (max-width: 767px) {
  .doc-dock-ai-bar--open {
    width: min(18rem, 72vw);
    max-width: 72vw;
  }
  .doc-dock--mobile {
    border-radius: 0;
    box-shadow: none;
    max-width: 100dvw;
  }
  .doc-dock--mobile .doc-dock-resize {
    display: none;
  }
  .doc-dock--mobile .doc-dock-drag {
    cursor: default;
  }
  .doc-dock--mobile .doc-dock-article {
    width: 100%;
    max-width: 100%;
    padding-inline: 12px;
    padding-block: 16px;
    overflow-x: hidden;
    box-sizing: border-box;
  }
  .doc-dock--mobile .doc-reading-prose {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  .doc-dock--mobile .doc-reading-prose :is(th, td) {
    padding-inline: 8px;
    padding-block: 6px;
  }
  .doc-dock--mobile .doc-reading-prose :is(.group\\/code pre, pre) {
    font-size: 12px;
  }
}

/* ─── 平板及以上：居中窄栏，利于长文阅读 ─── */
@media (min-width: 768px) {
  .doc-dock-article {
    max-width: 48rem;
    padding-inline: 24px;
    padding-block: 24px;
  }
}
@media (min-width: 1024px) {
  .doc-dock-article {
    max-width: 52rem;
    padding-inline: 32px;
    padding-block: 28px;
  }
}
@media (min-width: 1280px) {
  .doc-dock-article {
    max-width: 56rem;
  }
}
`;function No({agentName:o,filePath:e,onClose:n,loadContent:a,onSave:i,onShare:u,defaultTocCollapsed:l,tocStorageKey:b}){const h=jt(),[k,v]=s.useState(!1),[c,p]=s.useState(null),[x,j]=s.useState(""),[f,C]=s.useState(!0),[z,I]=s.useState(null),[y,S]=s.useState(!1),[N,P]=s.useState(!1),[X,H]=s.useState(null),[se,_]=s.useState(!1),[de,be]=s.useState(""),[E,ve]=s.useState(!1),[Ae,ce]=s.useState(null),[Me,le]=s.useState(!1),[Oe,ue]=s.useState("running"),[He,J]=s.useState(()=>W()),[_e,Fe]=s.useState(""),we=s.useRef(a);we.current=a;const ie=s.useCallback((r,d)=>(we.current??((g,Q)=>At(g,Q).then(O=>O.content)))(r,d),[]),[L,F]=s.useState(()=>oe()?me():so()??ao()),q=s.useRef(null),D=s.useRef(null),T=s.useRef(null),V=s.useRef(!1),ke=s.useRef(null);s.useEffect(()=>{if(!o||!e)return;let r=!1;return C(!0),I(null),p(null),j(""),S(!1),H(null),_(!1),be(""),ce(null),ie(o,e).then(d=>{r||(p(d),j(d))}).catch(d=>{r||I(d.message||"文件读取失败")}).finally(()=>{r||C(!1)}),()=>{r=!0}},[o,e,ie]),s.useEffect(()=>{const r=d=>{if(d.key==="Escape"){if(se){_(!1);return}n()}};return window.addEventListener("keydown",r),()=>window.removeEventListener("keydown",r)},[n,se]),s.useEffect(()=>{const r=()=>{if(oe()){F(me());return}F(d=>G(d))};return r(),window.addEventListener("resize",r),()=>window.removeEventListener("resize",r)},[h]);const ye=s.useCallback(r=>{oe()||co(r)},[]),$e=s.useCallback(()=>{!o||!e||(C(!0),I(null),ie(o,e).then(r=>{p(r),j(r)}).catch(r=>I(r.message||"文件读取失败")).finally(()=>C(!1)))},[o,e,ie]),A=i!=null&&c!==null&&x!==c;s.useEffect(()=>{const r=d=>{A&&(d.preventDefault(),d.returnValue="")};return window.addEventListener("beforeunload",r),()=>window.removeEventListener("beforeunload",r)},[A]);const Ue=s.useCallback(()=>{H(null),_(!1),S(!0)},[]),We=s.useCallback(()=>{S(!1),H(null)},[]),Be=s.useCallback(async()=>{if(!(!i||!A)){P(!0),H(null);try{await i(x),p(x),S(!1),Ct.success("保存成功")}catch(r){H(r instanceof Error?r.message:"保存失败")}finally{P(!1)}}},[i,x,A]),Ge=s.useCallback(()=>{c!=null&&(j(c),S(!1),H(null))},[c]),Ke=s.useCallback(async()=>{const r=de.trim();if(!r||E)return;_(!1),ve(!0),ce(null),le(!0),ue("running"),Fe(r),J(te(W(),"validate",[]));const d=m=>new Promise(g=>setTimeout(g,m));try{await d(200),J(te(W(),"call",["validate"]));const{content:m}=await Mt(o,{prompt:r,current_content:x});J(te(W(),"finalize",["validate","call"])),await d(150),j(m),J(te(W(),null,["validate","call","finalize"])),ue("success"),await d(700),le(!1),_(!1)}catch(m){const g=m instanceof Error?m.message:"润色失败";ce(g),J(te(W(),null,["validate"],"call")),ue("error"),await d(2200),le(!1)}finally{ve(!1)}},[o,de,x,E]),$=e.split("/").pop()??e,M=uo($),Ye=s.useCallback(()=>{if(c===null)return;const r=M?"text/markdown;charset=utf-8":"text/plain;charset=utf-8",d=new Blob([x],{type:r}),m=URL.createObjectURL(d),g=document.createElement("a");g.href=m,g.download=$,g.style.display="none",document.body.appendChild(g),g.click(),g.remove(),URL.revokeObjectURL(m)},[x,$,M,c]),{headings:pe,activeId:je,scrollToHeading:Ce}=ct(ke,y?null:x,M),ze=M&&!f&&!z&&c!=null&&pe.length>0,Z=ze&&(h||L.width<ro),Xe=M&&!f&&!z&&c!==null&&!y;return s.useEffect(()=>{Z||v(!1)},[Z]),t.jsxs(t.Fragment,{children:[t.jsx("style",{children:po}),t.jsx(to,{open:Me,title:`AI 润色 ${$}`,description:"正在根据你的描述润色文档…",prompt:_e,steps:He,error:Ae,phase:Oe}),t.jsx("button",{type:"button",className:"doc-dock-backdrop","aria-label":"关闭文档",onClick:n}),t.jsxs("aside",{ref:q,className:R("doc-dock",h&&"doc-dock--mobile"),style:{left:L.left,top:L.top,width:L.width,height:L.height},"aria-label":`文档: ${$}`,children:[t.jsxs("div",{className:"doc-dock-head",children:[t.jsx("div",{className:"doc-dock-head-left",children:t.jsxs("div",{className:"doc-dock-drag",role:"presentation",title:"拖拽移动浮窗 · 右下角可调整大小",onPointerDown:r=>{h||r.button===0&&(r.target.closest("button, input")||(r.currentTarget.setPointerCapture(r.pointerId),V.current=!1,D.current={pointerId:r.pointerId,sx:r.clientX,sy:r.clientY,ox:L.left,oy:L.top}))},onPointerMove:r=>{if(!D.current||r.pointerId!==D.current.pointerId)return;const{sx:d,sy:m,ox:g,oy:Q}=D.current,O=r.clientX-d,U=r.clientY-m;O*O+U*U>16&&(V.current=!0),F(ee=>{if(!ee)return ee;const Se=lo(g+O,Q+U,ee.width,ee.height);return{...ee,left:Se.left,top:Se.top}})},onPointerUp:r=>{if(!(!D.current||r.pointerId!==D.current.pointerId)){try{r.currentTarget.releasePointerCapture(r.pointerId)}catch{}if(D.current=null,V.current&&q.current){const d=q.current.getBoundingClientRect(),m=G({left:d.left,top:d.top,width:d.width,height:d.height});F(m),ye(m)}V.current=!1}},onPointerCancel:r=>{D.current=null,V.current=!1;try{r.currentTarget.releasePointerCapture(r.pointerId)}catch{}},children:[t.jsx(lt,{className:R("size-4 shrink-0",M?"text-violet-500/70":"text-muted-foreground")}),t.jsxs("span",{className:"doc-dock-title",children:[$,A&&t.jsx("span",{className:"ml-1 text-violet-600",children:"•"})]})]})}),t.jsx("div",{className:"doc-dock-head-center",children:Xe&&t.jsx(Qt,{open:se,onOpenChange:_,prompt:de,onPromptChange:be,onSubmit:()=>void Ke(),submitting:E,disabled:N,side:"bottom",align:"center"})}),t.jsxs("div",{className:"doc-dock-head-right",children:[Z&&t.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>v(!0),title:"打开目录","aria-label":"打开目录",children:[t.jsx(ut,{className:"size-3.5"}),"目录"]}),!f&&!z&&c!==null&&u&&t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:u,title:"复制分享链接","aria-label":"复制分享链接",children:t.jsx(pt,{className:"size-3.5"})}),!f&&!z&&c!==null&&t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:Ye,title:"下载","aria-label":"下载文档",children:t.jsx(st,{className:"size-3.5"})}),i&&!f&&!z&&c!==null&&(y?t.jsx("button",{type:"button",className:"rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:We,disabled:N||E,children:"完成编辑"}):t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",onClick:Ue,title:"编辑","aria-label":"编辑文档",disabled:E,children:t.jsx(Lt,{className:"size-3.5"})})),t.jsx("button",{type:"button",className:"doc-dock-close",onClick:n,"aria-label":"关闭",children:t.jsx(zt,{className:"size-4"})})]})]}),t.jsxs("div",{className:"doc-dock-body flex min-h-0 min-w-0 flex-col",children:[y?t.jsx("div",{className:"flex min-h-0 flex-1 flex-col p-3",children:t.jsx("textarea",{value:x,onChange:r=>j(r.target.value),spellCheck:!1,disabled:N||E,className:"min-h-0 flex-1 w-full resize-none rounded-md border border-border/60 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-violet-500/60",placeholder:"输入文件内容…"})}):t.jsxs("div",{className:"flex min-h-0 min-w-0 flex-1",children:[ze&&!Z&&t.jsx(ft,{headings:pe,activeId:je,onHeadingClick:Ce,defaultCollapsed:l,storageKey:b}),Z&&t.jsx(ht,{open:k,onOpenChange:v,headings:pe,activeId:je,onHeadingClick:Ce}),t.jsx(it,{ref:ke,className:"doc-dock-scroll min-h-0 min-w-0 flex-1",children:f?t.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[t.jsx(xe,{className:"size-5 animate-spin text-muted-foreground/50"}),t.jsx("span",{className:"text-xs text-muted-foreground",children:"加载文档中..."})]}):z?t.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[t.jsx("p",{className:"text-sm text-destructive",children:z}),t.jsxs("button",{type:"button",className:"flex items-center gap-1 text-xs text-violet-500 hover:underline",onClick:$e,children:[t.jsx(Dt,{className:"size-3"}),"重试"]})]}):c===null?t.jsx("div",{className:"px-8 py-16 text-center text-sm text-muted-foreground",children:"文件内容为空"}):M?t.jsx("div",{className:"doc-dock-article",children:t.jsx(dt,{copyableCode:!0,size:h?"sm":"md",className:"doc-reading-prose",children:x})}):t.jsx("pre",{className:"doc-dock-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:x})})]}),i&&!f&&!z&&c!==null&&t.jsxs("div",{className:"flex shrink-0 items-center justify-end gap-2 border-t border-border/40 px-3 py-2",children:[X&&t.jsx("span",{className:"mr-auto max-w-[50%] truncate text-[11px] text-destructive",title:X,children:X}),t.jsx(he,{type:"button",variant:"ghost",size:"sm",disabled:!A||N||E,onClick:Ge,children:"撤销"}),t.jsx(he,{type:"button",size:"sm",className:De,disabled:!A||N||E,onClick:()=>void Be(),children:N?t.jsxs(t.Fragment,{children:[t.jsx(xe,{className:"mr-1 size-3.5 animate-spin"}),"保存中…"]}):t.jsxs(t.Fragment,{children:[t.jsx(Pt,{className:"mr-1 size-3.5"}),"保存"]})})]})]}),t.jsx("div",{className:"doc-dock-resize",role:"presentation",onPointerDown:r=>{h||r.button===0&&(r.currentTarget.setPointerCapture(r.pointerId),T.current={pointerId:r.pointerId,sx:r.clientX,sy:r.clientY,orig:{...L}})},onPointerMove:r=>{if(!T.current||r.pointerId!==T.current.pointerId)return;const{sx:d,sy:m,orig:g}=T.current,Q=r.clientX-d,O=r.clientY-m;F(U=>U&&G({left:g.left,top:g.top,width:Math.max(ne,g.width+Q),height:Math.max(re,g.height+O)}))},onPointerUp:r=>{if(!(!T.current||r.pointerId!==T.current.pointerId)){try{r.currentTarget.releasePointerCapture(r.pointerId)}catch{}if(T.current=null,q.current){const d=q.current.getBoundingClientRect(),m=G({left:d.left,top:d.top,width:d.width,height:d.height});F(m),ye(m)}}},onPointerCancel:r=>{T.current=null;try{r.currentTarget.releasePointerCapture(r.pointerId)}catch{}}})]})]})}export{Qt as A,No as D,to as P,So as a,zo as d,W as i,jo as l,te as s,Co as w};
