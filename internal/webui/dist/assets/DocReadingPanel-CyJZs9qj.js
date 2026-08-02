import{j as t,p as Je,q as Ve,r as Ze,s as Qe,t as et,R as tt,P as ot,O as rt,C as nt,T as at,D as it}from"./radix-B5JjEh1k.js";import{a as s,R as he}from"./react-vendor-DN2CTUzv.js";import{S as st}from"./scroll-area-6ypace90.js";import{a as dt,M as ct}from"./MarkdownContent-XHCRqCEK.js";import{u as lt,a as ut,b as pt,c as ft,D as ht,d as xt}from"./useTocHeadings-DroIdvUo.js";import{c as mt,a7 as gt,K as bt,T as vt,H as wt,a as N,J as kt,B as xe,v as yt,a8 as jt,S as me,a9 as Ct,t as St,o as zt}from"./index-MhaggNvf.js";import{u as Nt}from"./useRequireAuth-NIJY9s6L.js";import{a as Rt,b as It}from"./syntax-highlighter-BHmkQKrJ.js";import{d as Et,b as Te,f as Lt}from"./ThemeToggle-DPXLFxkN.js";import{I as Dt,f as Tt}from"./select-BumyO1Bi.js";import{I as At}from"./IconRefresh-Bnai5jya.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pt=[["path",{d:"M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2",key:"svg-0"}],["path",{d:"M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",key:"svg-1"}],["path",{d:"M14 4l0 4l-6 0l0 -4",key:"svg-2"}]],Mt=mt("outline","device-floppy","DeviceFloppy",Pt),K="/api/v1/agents";function Y(){const o=bt();return o?{Authorization:`Bearer ${o}`}:{}}function ne(o){if(o.code!==200)throw new Error(o.errMsg||"request failed");return o.body}async function zo(o,e){const r=e?`?subpath=${encodeURIComponent(e)}`:"",a=await fetch(`${K}/${encodeURIComponent(o)}/docs${r}`,{headers:{...Y()}});return ne(await a.json())}async function Ot(o,e){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${encodeURIComponent(o)}/docs/${r}`,{headers:{...Y()}});return ne(await a.json())}async function No(o,e,r){const a=e.split("/").map(encodeURIComponent).join("/"),i=await fetch(`${K}/${encodeURIComponent(o)}/docs/${a}`,{method:"PUT",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify({content:r})});return ne(await i.json())}async function Ro(o,e,r=!1){const a=e.split("/").map(encodeURIComponent).join("/"),i=await fetch(`${K}/${encodeURIComponent(o)}/docs/${a}?download=1`,{headers:{...Y()}}),u=e.split("/").pop()??e,l=r?`${u}.zip`:u;await gt(i,l)}async function Io(o,e){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${encodeURIComponent(o)}/docs/${r}`,{method:"DELETE",headers:{...Y()}});ne(await a.json())}async function Ht(o,e){const r=await fetch(`${K}/${encodeURIComponent(o)}/docs/polish`,{method:"POST",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify(e)});return ne(await r.json())}var _t=s.useLayoutEffect,Ft=function(e){var r=he.useRef(e);return _t(function(){r.current=e}),r},Re=function(e,r){if(typeof e=="function"){e(r);return}e.current=r},$t=function(e,r){var a=he.useRef();return he.useCallback(function(i){e.current=i,a.current&&Re(a.current,null),a.current=r,r&&Re(r,i)},[r])},Ie={"min-height":"0","max-height":"none",height:"0",visibility:"hidden",overflow:"hidden",position:"absolute","z-index":"-1000",top:"0",right:"0",display:"block"},Ut=function(e){Object.keys(Ie).forEach(function(r){e.style.setProperty(r,Ie[r],"important")})},Ee=Ut,w=null,Le=function(e,r){var a=e.scrollHeight;return r.sizingStyle.boxSizing==="border-box"?a+r.borderSize:a-r.paddingSize};function Wt(o,e,r,a){r===void 0&&(r=1),a===void 0&&(a=1/0),w||(w=document.createElement("textarea"),w.setAttribute("tabindex","-1"),w.setAttribute("aria-hidden","true"),Ee(w)),w.parentNode===null&&document.body.appendChild(w);var i=o.paddingSize,u=o.borderSize,l=o.sizingStyle,v=l.boxSizing;Object.keys(l).forEach(function(d){var k=d;w.style[k]=l[k]}),Ee(w),w.value=e;var f=Le(w,o);w.value=e,f=Le(w,o),w.value="x";var x=w.scrollHeight-i,j=x*r;v==="border-box"&&(j=j+i+u),f=Math.max(j,f);var m=x*a;return v==="border-box"&&(m=m+i+u),f=Math.min(m,f),[f,x]}var De=function(){},Bt=function(e,r){return e.reduce(function(a,i){return a[i]=r[i],a},{})},Gt=["borderBottomWidth","borderLeftWidth","borderRightWidth","borderTopWidth","boxSizing","fontFamily","fontSize","fontStyle","fontWeight","letterSpacing","lineHeight","paddingBottom","paddingLeft","paddingRight","paddingTop","tabSize","textIndent","textRendering","textTransform","width","wordBreak","wordSpacing","scrollbarGutter"],Kt=!!document.documentElement.currentStyle,Yt=function(e){var r=window.getComputedStyle(e);if(r===null)return null;var a=Bt(Gt,r),i=a.boxSizing;if(i==="")return null;Kt&&i==="border-box"&&(a.width=parseFloat(a.width)+parseFloat(a.borderRightWidth)+parseFloat(a.borderLeftWidth)+parseFloat(a.paddingRight)+parseFloat(a.paddingLeft)+"px");var u=parseFloat(a.paddingBottom)+parseFloat(a.paddingTop),l=parseFloat(a.borderBottomWidth)+parseFloat(a.borderTopWidth);return{sizingStyle:a,paddingSize:u,borderSize:l}},Xt=Yt;function be(o,e,r){var a=Ft(r);s.useLayoutEffect(function(){var i=function(l){return a.current(l)};if(o)return o.addEventListener(e,i),function(){return o.removeEventListener(e,i)}},[])}var qt=function(e,r){be(document.body,"reset",function(a){e.current.form===a.target&&r(a)})},Jt=function(e){be(window,"resize",e)},Vt=function(e){be(document.fonts,"loadingdone",e)},Zt=["cacheMeasurements","maxRows","minRows","onChange","onHeightChange"],Qt=function(e,r){var a=e.cacheMeasurements,i=e.maxRows,u=e.minRows,l=e.onChange,v=l===void 0?De:l,f=e.onHeightChange,x=f===void 0?De:f,j=Rt(e,Zt),m=j.value!==void 0,d=s.useRef(null),k=$t(d,r),b=s.useRef(0),p=s.useRef(),C=function(){var y=d.current,R=a&&p.current?p.current:Xt(y);if(R){p.current=R;var I=Wt(R,y.value||y.placeholder||"x",u,i),z=I[0],ae=I[1];b.current!==z&&(b.current=z,y.style.setProperty("height",z+"px","important"),x(z,{rowHeight:ae}))}},O=function(y){m||C(),v(y)};return s.useLayoutEffect(C),qt(d,function(){if(!m){var S=d.current.value;requestAnimationFrame(function(){var y=d.current;y&&S!==y.value&&C()})}}),Jt(C),Vt(C),s.createElement("textarea",It({},j,{onChange:O,ref:k}))},eo=s.forwardRef(Qt);function to({open:o,onOpenChange:e,prompt:r,onPromptChange:a,onSubmit:i,submitting:u=!1,disabled:l=!1,placeholder:v="翻译为中文",triggerClassName:f,side:x="bottom",align:j="center"}){const m=u||l;return t.jsxs(Je,{open:o,onOpenChange:e,modal:!1,children:[t.jsxs(vt,{children:[t.jsx(wt,{asChild:!0,children:t.jsx(Ve,{asChild:!0,children:t.jsx("button",{type:"button",className:N("flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90",m&&"opacity-80",f),disabled:m,"aria-label":o?"收起润色输入":"AI 润色","aria-expanded":o,children:t.jsx("span",{className:N("flex size-6 items-center justify-center rounded-md",Et),children:t.jsx(Dt,{className:"size-3.5",stroke:1.75,"aria-hidden":!0})})})})}),t.jsx(kt,{side:"bottom",sideOffset:6,className:"z-[1220]",children:o?"收起润色输入":"AI 润色"})]}),t.jsx(Ze,{children:t.jsxs(Qe,{side:x,align:j,sideOffset:10,collisionPadding:12,className:N("z-[1220] w-[min(92vw,22rem)] rounded-xl p-3 shadow-xl outline-none","border border-violet-500/30 bg-background/72 backdrop-blur-xl","supports-backdrop-filter:bg-background/55",Lt,"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95","data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"),onOpenAutoFocus:d=>{const k=d.currentTarget.querySelector("textarea");k instanceof HTMLTextAreaElement&&(d.preventDefault(),k.focus())},children:[t.jsx(et,{className:"fill-background/80"}),t.jsx("p",{className:"text-xs font-medium text-violet-800 dark:text-violet-200",children:"AI 润色"}),t.jsx("p",{className:"mt-0.5 text-[11px] leading-relaxed text-muted-foreground",children:"输入润色要求，下方文档仍可浏览与滚动"}),t.jsxs("div",{className:"mt-2.5 flex flex-col gap-2",children:[t.jsx(eo,{value:r,onChange:d=>a(d.target.value),placeholder:v,disabled:m,minRows:2,maxRows:8,className:N("w-full min-w-0 resize-none rounded-md border border-violet-500/20 bg-background/80 px-2.5 py-1.5 text-xs","break-words whitespace-pre-wrap leading-relaxed","placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet-500/30","disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"),onKeyDown:d=>{d.key==="Enter"&&(d.ctrlKey||d.metaKey)&&(d.preventDefault(),r.trim()&&!m&&i())}}),t.jsx("p",{className:"text-[10px] text-muted-foreground/80",children:"Ctrl+Enter 开始润色"}),t.jsx(xe,{type:"button",size:"sm",className:N("h-8 w-full text-xs",Te),disabled:!r.trim()||m,onClick:()=>i(),children:u?"润色中…":"开始润色"})]})]})})]})}function oo({status:o}){return o==="done"?t.jsx(jt,{className:"size-4 text-emerald-600","aria-hidden":!0}):o==="active"?t.jsx(me,{className:"size-4 animate-spin text-primary","aria-hidden":!0}):o==="error"?t.jsx("span",{className:"size-4 text-center text-xs text-destructive",children:"!"}):t.jsx("span",{className:"size-4 rounded-full border border-border/80 bg-muted/40","aria-hidden":!0})}function ro({open:o,fileName:e,prompt:r,subject:a,subjectLabel:i="提示词",title:u,description:l,successMessage:v,steps:f,error:x,phase:j}){const m=e?yt[e].title:"",d=u??(m?`AI 润色 ${m}`:"AI 处理中"),k=l??"正在根据你的描述润色内容…",b=a??r??"";return t.jsx(tt,{open:o,children:t.jsxs(ot,{children:[t.jsx(rt,{className:"fixed inset-0 z-[1210] bg-black/40 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0"}),t.jsxs(nt,{className:N("fixed left-1/2 top-1/2 z-[1211] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2","rounded-xl border border-border bg-background p-5 shadow-xl","data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"),onPointerDownOutside:p=>p.preventDefault(),onEscapeKeyDown:p=>p.preventDefault(),children:[t.jsx(at,{className:"text-sm font-semibold text-foreground",children:d}),t.jsx(it,{className:"mt-1 text-xs text-muted-foreground",children:k}),t.jsxs("div",{className:"mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2",children:[t.jsx("p",{className:"text-[10px] font-medium uppercase tracking-wide text-muted-foreground",children:i}),t.jsx("p",{className:"mt-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",children:b})]}),t.jsx("ol",{className:"mt-4 space-y-2.5",children:f.map(p=>t.jsxs("li",{className:"flex items-start gap-2.5",children:[t.jsx("span",{className:"mt-0.5 flex size-5 shrink-0 items-center justify-center",children:t.jsx(oo,{status:p.status})}),t.jsx("span",{className:N("text-xs leading-relaxed",p.status==="active"&&"font-medium text-foreground",p.status==="done"&&"text-muted-foreground",p.status==="pending"&&"text-muted-foreground/70",p.status==="error"&&"text-destructive"),children:p.label})]},p.id))}),j==="success"&&t.jsx("p",{className:"mt-4 text-xs text-emerald-600",children:v??"润色完成，正在关闭…"}),j==="error"&&x&&t.jsx("p",{className:"mt-4 text-xs text-destructive",children:x})]})]})})}const no=[{id:"validate",label:"校验输入"},{id:"call",label:"正在润色"},{id:"finalize",label:"写入编辑器"}];function W(){return no.map(o=>({id:o.id,label:o.label,status:"pending"}))}function ee(o,e,r,a){return o.map(i=>a&&i.id===a?{...i,status:"error"}:r.includes(i.id)?{...i,status:"done"}:i.id===e?{...i,status:"active"}:{...i,status:"pending"})}const oe=480,re=400,Ae="finclaw.docDock.position",ao=768,io=900;function te(){return typeof window<"u"&&window.innerWidth<ao}function B(o,e,r){return Math.min(r,Math.max(e,o))}function ge(){return{left:0,top:0,width:window.innerWidth,height:window.innerHeight}}function Pe(){const o=window.innerWidth,e=window.innerHeight;if(te())return{width:o,height:e};const r=24,a=Math.round(o*.85),i=Math.round(e*.8);return{width:B(a,oe,Math.max(oe,o-r*2)),height:B(i,re,Math.max(re,e-r*2))}}function G(o,e=8){if(te())return ge();const r=window.innerWidth,a=window.innerHeight;let{left:i,top:u,width:l,height:v}=o;const f=Math.max(oe,r-e*2),x=Math.max(re,a-e*2);return l=B(l,oe,f),v=B(v,re,x),i=B(i,e,r-l-e),u=B(u,e,a-v-e),{left:i,top:u,width:l,height:v}}function so(){const{width:o,height:e}=Pe(),r=Math.round((window.innerWidth-o)/2),a=Math.round((window.innerHeight-e)/2);return G({left:r,top:a,width:o,height:e})}function co(o){if(!o||typeof o!="object")return null;const e=o;if(typeof e.left!="number"||typeof e.top!="number")return null;const r=Pe(),a=typeof e.width=="number"?e.width:r.width,i=typeof e.height=="number"?e.height:r.height;return G({left:e.left,top:e.top,width:a,height:i})}function lo(){try{const o=localStorage.getItem(Ae);if(!o)return null;const e=JSON.parse(o);return e.dock!=null?co(e.dock):null}catch{return null}}function uo(o){try{localStorage.setItem(Ae,JSON.stringify({dock:o}))}catch{}}function po(o,e,r,a,i=8){const u=Math.max(i,window.innerWidth-r-i),l=Math.max(i,window.innerHeight-a-i);return{left:Math.min(u,Math.max(i,o)),top:Math.min(l,Math.max(i,e))}}function fo(o){const e=o.toLowerCase();return e.endsWith(".md")||e.endsWith(".markdown")}const ho=`
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
`;function Eo({agentName:o,filePath:e,onClose:r,loadContent:a,onSave:i,onShare:u,defaultTocCollapsed:l,tocStorageKey:v}){const{requireAuth:f}=Nt(),x=Ct(),[j,m]=s.useState(!1),[d,k]=s.useState(null),[b,p]=s.useState(""),[C,O]=s.useState(!0),[S,y]=s.useState(null),[R,I]=s.useState(!1),[z,ae]=s.useState(!1),[se,H]=s.useState(null),[de,_]=s.useState(!1),[ce,ve]=s.useState(""),[E,we]=s.useState(!1),[Me,le]=s.useState(null),[Oe,ue]=s.useState(!1),[He,pe]=s.useState("running"),[_e,X]=s.useState(()=>W()),[Fe,$e]=s.useState(""),ke=s.useRef(a);ke.current=a;const ie=s.useCallback((n,c)=>(ke.current??((g,Z)=>Ot(g,Z).then(M=>M.content)))(n,c),[]),[L,F]=s.useState(()=>te()?ge():lo()??so()),q=s.useRef(null),D=s.useRef(null),T=s.useRef(null),J=s.useRef(!1),ye=s.useRef(null);s.useEffect(()=>{if(!o||!e)return;let n=!1;return O(!0),y(null),k(null),p(""),I(!1),H(null),_(!1),ve(""),le(null),ie(o,e).then(c=>{n||(k(c),p(c))}).catch(c=>{n||y(c.message||"文件读取失败")}).finally(()=>{n||O(!1)}),()=>{n=!0}},[o,e,ie]),s.useEffect(()=>{const n=c=>{if(c.key==="Escape"){if(de){_(!1);return}r()}};return window.addEventListener("keydown",n),()=>window.removeEventListener("keydown",n)},[r,de]),s.useEffect(()=>{const n=()=>{if(te()){F(ge());return}F(c=>G(c))};return n(),window.addEventListener("resize",n),()=>window.removeEventListener("resize",n)},[x]);const je=s.useCallback(n=>{te()||uo(n)},[]),Ue=s.useCallback(()=>{!o||!e||(O(!0),y(null),ie(o,e).then(n=>{k(n),p(n)}).catch(n=>y(n.message||"文件读取失败")).finally(()=>O(!1)))},[o,e,ie]),A=i!=null&&d!==null&&b!==d;s.useEffect(()=>{const n=c=>{A&&(c.preventDefault(),c.returnValue="")};return window.addEventListener("beforeunload",n),()=>window.removeEventListener("beforeunload",n)},[A]);const We=s.useCallback(()=>{H(null),_(!1),I(!0)},[]),Be=s.useCallback(()=>{I(!1),H(null)},[]),Ge=s.useCallback(async()=>{if(!(!f()||!i||!A)){ae(!0),H(null);try{await i(b),k(b),I(!1),St.success("保存成功")}catch(n){H(n instanceof Error?n.message:"保存失败")}finally{ae(!1)}}},[f,i,b,A]),Ke=s.useCallback(()=>{d!=null&&(p(d),I(!1),H(null))},[d]),Ye=s.useCallback(async()=>{if(!f())return;const n=ce.trim();if(!n||E)return;_(!1),we(!0),le(null),ue(!0),pe("running"),$e(n),X(ee(W(),"validate",[]));const c=h=>new Promise(g=>setTimeout(g,h));try{await c(200),X(ee(W(),"call",["validate"]));const{content:h}=await Ht(o,{prompt:n,current_content:b});X(ee(W(),"finalize",["validate","call"])),await c(150),p(h),X(ee(W(),null,["validate","call","finalize"])),pe("success"),await c(700),ue(!1),_(!1)}catch(h){const g=h instanceof Error?h.message:"润色失败";le(g),X(ee(W(),null,["validate"],"call")),pe("error"),await c(2200),ue(!1)}finally{we(!1)}},[f,o,ce,b,E]),$=e.split("/").pop()??e,P=fo($),Xe=s.useCallback(()=>{if(d===null)return;const n=P?"text/markdown;charset=utf-8":"text/plain;charset=utf-8",c=new Blob([b],{type:n}),h=URL.createObjectURL(c),g=document.createElement("a");g.href=h,g.download=$,g.style.display="none",document.body.appendChild(g),g.click(),g.remove(),URL.revokeObjectURL(h)},[b,$,P,d]),{headings:fe,activeId:Ce,scrollToHeading:Se}=lt(ye,R?null:b,P),ze=P&&!C&&!S&&d!=null&&fe.length>0,V=ze&&(x||L.width<io),qe=P&&!C&&!S&&d!==null&&!R;return s.useEffect(()=>{V||m(!1)},[V]),t.jsxs(t.Fragment,{children:[t.jsx("style",{children:ho}),t.jsx(ro,{open:Oe,title:`AI 润色 ${$}`,description:"正在根据你的描述润色文档…",prompt:Fe,steps:_e,error:Me,phase:He}),t.jsx("button",{type:"button",className:"doc-dock-backdrop","aria-label":"关闭文档",onClick:r}),t.jsxs("aside",{ref:q,className:N("doc-dock",x&&"doc-dock--mobile"),style:{left:L.left,top:L.top,width:L.width,height:L.height},"aria-label":`文档: ${$}`,children:[t.jsxs("div",{className:"doc-dock-head",children:[t.jsx("div",{className:"doc-dock-head-left",children:t.jsxs("div",{className:"doc-dock-drag",role:"presentation",title:"拖拽移动浮窗 · 右下角可调整大小",onPointerDown:n=>{x||n.button===0&&(n.target.closest("button, input")||(n.currentTarget.setPointerCapture(n.pointerId),J.current=!1,D.current={pointerId:n.pointerId,sx:n.clientX,sy:n.clientY,ox:L.left,oy:L.top}))},onPointerMove:n=>{if(!D.current||n.pointerId!==D.current.pointerId)return;const{sx:c,sy:h,ox:g,oy:Z}=D.current,M=n.clientX-c,U=n.clientY-h;M*M+U*U>16&&(J.current=!0),F(Q=>{if(!Q)return Q;const Ne=po(g+M,Z+U,Q.width,Q.height);return{...Q,left:Ne.left,top:Ne.top}})},onPointerUp:n=>{if(!(!D.current||n.pointerId!==D.current.pointerId)){try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}if(D.current=null,J.current&&q.current){const c=q.current.getBoundingClientRect(),h=G({left:c.left,top:c.top,width:c.width,height:c.height});F(h),je(h)}J.current=!1}},onPointerCancel:n=>{D.current=null,J.current=!1;try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}},children:[t.jsx(ut,{className:N("size-4 shrink-0",P?"text-violet-500/70":"text-muted-foreground")}),t.jsxs("span",{className:"doc-dock-title",children:[$,A&&t.jsx("span",{className:"ml-1 text-violet-600",children:"•"})]})]})}),t.jsx("div",{className:"doc-dock-head-center",children:qe&&t.jsx(to,{open:de,onOpenChange:_,prompt:ce,onPromptChange:ve,onSubmit:()=>void Ye(),submitting:E,disabled:z,side:"bottom",align:"center"})}),t.jsxs("div",{className:"doc-dock-head-right",children:[V&&t.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>m(!0),title:"打开目录","aria-label":"打开目录",children:[t.jsx(pt,{className:"size-3.5"}),"目录"]}),!C&&!S&&d!==null&&u&&t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:u,title:"复制分享链接","aria-label":"复制分享链接",children:t.jsx(ft,{className:"size-3.5"})}),!C&&!S&&d!==null&&t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:Xe,title:"下载","aria-label":"下载文档",children:t.jsx(dt,{className:"size-3.5"})}),i&&!C&&!S&&d!==null&&(R?t.jsx("button",{type:"button",className:"rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:Be,disabled:z||E,children:"完成编辑"}):t.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",onClick:We,title:"编辑","aria-label":"编辑文档",disabled:E,children:t.jsx(Tt,{className:"size-3.5"})})),t.jsx("button",{type:"button",className:"doc-dock-close",onClick:r,"aria-label":"关闭",children:t.jsx(zt,{className:"size-4"})})]})]}),t.jsxs("div",{className:"doc-dock-body flex min-h-0 min-w-0 flex-col",children:[R?t.jsx("div",{className:"flex min-h-0 flex-1 flex-col p-3",children:t.jsx("textarea",{value:b,onChange:n=>p(n.target.value),spellCheck:!1,disabled:z||E,className:"min-h-0 flex-1 w-full resize-none rounded-md border border-border/60 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-violet-500/60",placeholder:"输入文件内容…"})}):t.jsxs("div",{className:"flex min-h-0 min-w-0 flex-1",children:[ze&&!V&&t.jsx(ht,{headings:fe,activeId:Ce,onHeadingClick:Se,defaultCollapsed:l,storageKey:v}),V&&t.jsx(xt,{open:j,onOpenChange:m,headings:fe,activeId:Ce,onHeadingClick:Se}),t.jsx(st,{ref:ye,className:"doc-dock-scroll min-h-0 min-w-0 flex-1",children:C?t.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[t.jsx(me,{className:"size-5 animate-spin text-muted-foreground/50"}),t.jsx("span",{className:"text-xs text-muted-foreground",children:"加载文档中..."})]}):S?t.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[t.jsx("p",{className:"text-sm text-destructive",children:S}),t.jsxs("button",{type:"button",className:"flex items-center gap-1 text-xs text-violet-500 hover:underline",onClick:Ue,children:[t.jsx(At,{className:"size-3"}),"重试"]})]}):d===null?t.jsx("div",{className:"px-8 py-16 text-center text-sm text-muted-foreground",children:"文件内容为空"}):P?t.jsx("div",{className:"doc-dock-article",children:t.jsx(ct,{copyableCode:!0,size:x?"sm":"md",className:"doc-reading-prose",children:b})}):t.jsx("pre",{className:"doc-dock-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:b})})]}),i&&!C&&!S&&d!==null&&t.jsxs("div",{className:"flex shrink-0 items-center justify-end gap-2 border-t border-border/40 px-3 py-2",children:[se&&t.jsx("span",{className:"mr-auto max-w-[50%] truncate text-[11px] text-destructive",title:se,children:se}),t.jsx(xe,{type:"button",variant:"ghost",size:"sm",disabled:!A||z||E,onClick:Ke,children:"撤销"}),t.jsx(xe,{type:"button",size:"sm",className:Te,disabled:!A||z||E,onClick:()=>void Ge(),children:z?t.jsxs(t.Fragment,{children:[t.jsx(me,{className:"mr-1 size-3.5 animate-spin"}),"保存中…"]}):t.jsxs(t.Fragment,{children:[t.jsx(Mt,{className:"mr-1 size-3.5"}),"保存"]})})]})]}),t.jsx("div",{className:"doc-dock-resize",role:"presentation",onPointerDown:n=>{x||n.button===0&&(n.currentTarget.setPointerCapture(n.pointerId),T.current={pointerId:n.pointerId,sx:n.clientX,sy:n.clientY,orig:{...L}})},onPointerMove:n=>{if(!T.current||n.pointerId!==T.current.pointerId)return;const{sx:c,sy:h,orig:g}=T.current,Z=n.clientX-c,M=n.clientY-h;F(U=>U&&G({left:g.left,top:g.top,width:Math.max(oe,g.width+Z),height:Math.max(re,g.height+M)}))},onPointerUp:n=>{if(!(!T.current||n.pointerId!==T.current.pointerId)){try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}if(T.current=null,q.current){const c=q.current.getBoundingClientRect(),h=G({left:c.left,top:c.top,width:c.width,height:c.height});F(h),je(h)}}},onPointerCancel:n=>{T.current=null;try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}}})]})]})}export{to as A,Eo as D,ro as P,Io as a,eo as b,Ro as d,W as i,zo as l,ee as s,No as w};
