import{j as o,m as Je,n as Ve,o as Ze,p as Qe,q as et,R as tt,P as ot,O as rt,C as nt,T as at,D as it,r as st,s as dt,t as ct}from"./radix-CxiPtrkn.js";import{a as s,R as he}from"./react-vendor-DN2CTUzv.js";import{S as lt}from"./scroll-area-DwnJiQo2.js";import{a as ut,M as pt}from"./MarkdownContent-DWEnBNYg.js";import{u as ft,a as ht,f as xt,g as mt,D as gt,h as bt}from"./agentAssets-Do3Nmo5X.js";import{c as vt,a9 as wt,n as kt,T as yt,R as jt,a as N,S as Ct,B as xe,v as St,aa as zt,C as me,ab as Nt,t as Rt,X as It}from"./index-CLU3-ula.js";import{u as Et}from"./useRequireAuth-BEh18Lgv.js";import{_ as Lt,a as Tt}from"./syntax-highlighter-DVbdWQ2O.js";import{d as Dt,b as De,f as At}from"./ThemeToggle-CMC10RT8.js";import{f as Pt,h as Mt}from"./agentLLMSettings-DnVdKIvI.js";import{I as Ot}from"./AgentAvatar-B50wHINt.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const _t=[["path",{d:"M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2",key:"svg-0"}],["path",{d:"M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",key:"svg-1"}],["path",{d:"M14 4l0 4l-6 0l0 -4",key:"svg-2"}]],Ht=vt("outline","device-floppy","DeviceFloppy",_t),K="/api/v1/account/docs";function Y(){const e=kt();return e?{Authorization:`Bearer ${e}`}:{}}function ne(e){if(e.code!==200)throw new Error(e.errMsg||"request failed");return e.body}async function Io(e){const t=e?`?subpath=${encodeURIComponent(e)}`:"",r=await fetch(`${K}${t}`,{headers:{...Y()}});return ne(await r.json())}async function Ft(e){const t=e.split("/").map(encodeURIComponent).join("/"),r=await fetch(`${K}/${t}`,{headers:{...Y()}});return ne(await r.json())}async function Eo(e,t){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${r}`,{method:"PUT",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify({content:t})});return ne(await a.json())}async function Lo(e,t=!1){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${K}/${r}?download=1`,{headers:{...Y()}}),i=e.split("/").pop()??e,l=t?`${i}.zip`:i;await wt(a,l)}async function To(e){const t=e.split("/").map(encodeURIComponent).join("/"),r=await fetch(`${K}/${t}`,{method:"DELETE",headers:{...Y()}});ne(await r.json())}async function $t(e,t){const r=await fetch(`${K}/polish`,{method:"POST",headers:{"Content-Type":"application/json",...Y()},body:JSON.stringify({...t,agent:e})});return ne(await r.json())}var Wt=s.useLayoutEffect,Bt=function(t){var r=he.useRef(t);return Wt(function(){r.current=t}),r},Re=function(t,r){if(typeof t=="function"){t(r);return}t.current=r},Ut=function(t,r){var a=he.useRef();return he.useCallback(function(i){t.current=i,a.current&&Re(a.current,null),a.current=r,r&&Re(r,i)},[r])},Ie={"min-height":"0","max-height":"none",height:"0",visibility:"hidden",overflow:"hidden",position:"absolute","z-index":"-1000",top:"0",right:"0",display:"block"},Gt=function(t){Object.keys(Ie).forEach(function(r){t.style.setProperty(r,Ie[r],"important")})},Ee=Gt,w=null,Le=function(t,r){var a=t.scrollHeight;return r.sizingStyle.boxSizing==="border-box"?a+r.borderSize:a-r.paddingSize};function Kt(e,t,r,a){r===void 0&&(r=1),a===void 0&&(a=1/0),w||(w=document.createElement("textarea"),w.setAttribute("tabindex","-1"),w.setAttribute("aria-hidden","true"),Ee(w)),w.parentNode===null&&document.body.appendChild(w);var i=e.paddingSize,l=e.borderSize,u=e.sizingStyle,v=u.boxSizing;Object.keys(u).forEach(function(d){var k=d;w.style[k]=u[k]}),Ee(w),w.value=t;var f=Le(w,e);w.value=t,f=Le(w,e),w.value="x";var x=w.scrollHeight-i,j=x*r;v==="border-box"&&(j=j+i+l),f=Math.max(j,f);var m=x*a;return v==="border-box"&&(m=m+i+l),f=Math.min(m,f),[f,x]}var Te=function(){},Yt=function(t,r){return t.reduce(function(a,i){return a[i]=r[i],a},{})},Xt=["borderBottomWidth","borderLeftWidth","borderRightWidth","borderTopWidth","boxSizing","fontFamily","fontSize","fontStyle","fontWeight","letterSpacing","lineHeight","paddingBottom","paddingLeft","paddingRight","paddingTop","tabSize","textIndent","textRendering","textTransform","width","wordBreak","wordSpacing","scrollbarGutter"],qt=!!document.documentElement.currentStyle,Jt=function(t){var r=window.getComputedStyle(t);if(r===null)return null;var a=Yt(Xt,r),i=a.boxSizing;if(i==="")return null;qt&&i==="border-box"&&(a.width=parseFloat(a.width)+parseFloat(a.borderRightWidth)+parseFloat(a.borderLeftWidth)+parseFloat(a.paddingRight)+parseFloat(a.paddingLeft)+"px");var l=parseFloat(a.paddingBottom)+parseFloat(a.paddingTop),u=parseFloat(a.borderBottomWidth)+parseFloat(a.borderTopWidth);return{sizingStyle:a,paddingSize:l,borderSize:u}},Vt=Jt;function be(e,t,r){var a=Bt(r);s.useLayoutEffect(function(){var i=function(u){return a.current(u)};if(e)return e.addEventListener(t,i),function(){return e.removeEventListener(t,i)}},[])}var Zt=function(t,r){be(document.body,"reset",function(a){t.current.form===a.target&&r(a)})},Qt=function(t){be(window,"resize",t)},eo=function(t){be(document.fonts,"loadingdone",t)},to=["cacheMeasurements","maxRows","minRows","onChange","onHeightChange"],oo=function(t,r){var a=t.cacheMeasurements,i=t.maxRows,l=t.minRows,u=t.onChange,v=u===void 0?Te:u,f=t.onHeightChange,x=f===void 0?Te:f,j=Lt(t,to),m=j.value!==void 0,d=s.useRef(null),k=Ut(d,r),b=s.useRef(0),p=s.useRef(),C=function(){var y=d.current,R=a&&p.current?p.current:Vt(y);if(R){p.current=R;var I=Kt(R,y.value||y.placeholder||"x",l,i),z=I[0],ae=I[1];b.current!==z&&(b.current=z,y.style.setProperty("height",z+"px","important"),x(z,{rowHeight:ae}))}},O=function(y){m||C(),v(y)};return s.useLayoutEffect(C),Zt(d,function(){if(!m){var S=d.current.value;requestAnimationFrame(function(){var y=d.current;y&&S!==y.value&&C()})}}),Qt(C),eo(C),s.createElement("textarea",Tt({},j,{onChange:O,ref:k}))},ro=s.forwardRef(oo);function no({open:e,onOpenChange:t,prompt:r,onPromptChange:a,onSubmit:i,submitting:l=!1,disabled:u=!1,placeholder:v="翻译为中文",triggerClassName:f,side:x="bottom",align:j="center"}){const m=l||u;return o.jsxs(Je,{open:e,onOpenChange:t,modal:!1,children:[o.jsxs(yt,{children:[o.jsx(jt,{asChild:!0,children:o.jsx(Ve,{asChild:!0,children:o.jsx("button",{type:"button",className:N("flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90",m&&"opacity-80",f),disabled:m,"aria-label":e?"收起润色输入":"AI 润色","aria-expanded":e,children:o.jsx("span",{className:N("flex size-6 items-center justify-center rounded-md",Dt),children:o.jsx(Pt,{className:"size-3.5",stroke:1.75,"aria-hidden":!0})})})})}),o.jsx(Ct,{side:"bottom",sideOffset:6,className:"z-[1220]",children:e?"收起润色输入":"AI 润色"})]}),o.jsx(Ze,{children:o.jsxs(Qe,{side:x,align:j,sideOffset:10,collisionPadding:12,className:N("z-[1220] w-[min(92vw,22rem)] rounded-xl p-3 shadow-xl outline-none","border border-violet-500/30 bg-background/72 backdrop-blur-xl","supports-backdrop-filter:bg-background/55",At,"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95","data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"),onOpenAutoFocus:d=>{const k=d.currentTarget.querySelector("textarea");k instanceof HTMLTextAreaElement&&(d.preventDefault(),k.focus())},children:[o.jsx(et,{className:"fill-background/80"}),o.jsx("p",{className:"text-xs font-medium text-violet-800 dark:text-violet-200",children:"AI 润色"}),o.jsx("p",{className:"mt-0.5 text-[11px] leading-relaxed text-muted-foreground",children:"输入润色要求，下方文档仍可浏览与滚动"}),o.jsxs("div",{className:"mt-2.5 flex flex-col gap-2",children:[o.jsx(ro,{value:r,onChange:d=>a(d.target.value),placeholder:v,disabled:m,minRows:2,maxRows:8,className:N("w-full min-w-0 resize-none rounded-md border border-violet-500/20 bg-background/80 px-2.5 py-1.5 text-xs","break-words whitespace-pre-wrap leading-relaxed","placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet-500/30","disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"),onKeyDown:d=>{d.key==="Enter"&&(d.ctrlKey||d.metaKey)&&(d.preventDefault(),r.trim()&&!m&&i())}}),o.jsx("p",{className:"text-[10px] text-muted-foreground/80",children:"Ctrl+Enter 开始润色"}),o.jsx(xe,{type:"button",size:"sm",className:N("h-8 w-full text-xs",De),disabled:!r.trim()||m,onClick:()=>i(),children:l?"润色中…":"开始润色"})]})]})})]})}function ao({status:e}){return e==="done"?o.jsx(zt,{className:"size-4 text-emerald-600","aria-hidden":!0}):e==="active"?o.jsx(me,{className:"size-4 animate-spin text-primary","aria-hidden":!0}):e==="error"?o.jsx("span",{className:"size-4 text-center text-xs text-destructive",children:"!"}):o.jsx("span",{className:"size-4 rounded-full border border-border/80 bg-muted/40","aria-hidden":!0})}function io({open:e,fileName:t,prompt:r,subject:a,subjectLabel:i="提示词",title:l,description:u,successMessage:v,steps:f,error:x,phase:j}){const m=t?St[t].title:"",d=l??(m?`AI 润色 ${m}`:"AI 处理中"),k=u??"正在根据你的描述润色内容…",b=a??r??"";return o.jsx(tt,{open:e,children:o.jsxs(ot,{children:[o.jsx(rt,{className:"fixed inset-0 z-[1210] bg-black/40 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0"}),o.jsxs(nt,{className:N("fixed left-1/2 top-1/2 z-[1211] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2","rounded-xl border border-border bg-background p-5 shadow-xl","data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"),onPointerDownOutside:p=>p.preventDefault(),onEscapeKeyDown:p=>p.preventDefault(),children:[o.jsx(at,{className:"text-sm font-semibold text-foreground",children:d}),o.jsx(it,{className:"mt-1 text-xs text-muted-foreground",children:k}),o.jsxs("div",{className:"mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2",children:[o.jsx("p",{className:"text-[10px] font-medium uppercase tracking-wide text-muted-foreground",children:i}),o.jsx("p",{className:"mt-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",children:b})]}),o.jsx("ol",{className:"mt-4 space-y-2.5",children:f.map(p=>o.jsxs("li",{className:"flex items-start gap-2.5",children:[o.jsx("span",{className:"mt-0.5 flex size-5 shrink-0 items-center justify-center",children:o.jsx(ao,{status:p.status})}),o.jsx("span",{className:N("text-xs leading-relaxed",p.status==="active"&&"font-medium text-foreground",p.status==="done"&&"text-muted-foreground",p.status==="pending"&&"text-muted-foreground/70",p.status==="error"&&"text-destructive"),children:p.label})]},p.id))}),j==="success"&&o.jsx("p",{className:"mt-4 text-xs text-emerald-600",children:v??"润色完成，正在关闭…"}),j==="error"&&x&&o.jsx("p",{className:"mt-4 text-xs text-destructive",children:x})]})]})})}const so=[{id:"validate",label:"校验输入"},{id:"call",label:"正在润色"},{id:"finalize",label:"写入编辑器"}];function B(){return so.map(e=>({id:e.id,label:e.label,status:"pending"}))}function ee(e,t,r,a){return e.map(i=>a&&i.id===a?{...i,status:"error"}:r.includes(i.id)?{...i,status:"done"}:i.id===t?{...i,status:"active"}:{...i,status:"pending"})}const oe=480,re=400,Ae="finclaw.docDock.position",co=768,lo=900;function te(){return typeof window<"u"&&window.innerWidth<co}function U(e,t,r){return Math.min(r,Math.max(t,e))}function ge(){return{left:0,top:0,width:window.innerWidth,height:window.innerHeight}}function Pe(){const e=window.innerWidth,t=window.innerHeight;if(te())return{width:e,height:t};const r=24,a=Math.round(e*.85),i=Math.round(t*.8);return{width:U(a,oe,Math.max(oe,e-r*2)),height:U(i,re,Math.max(re,t-r*2))}}function G(e,t=8){if(te())return ge();const r=window.innerWidth,a=window.innerHeight;let{left:i,top:l,width:u,height:v}=e;const f=Math.max(oe,r-t*2),x=Math.max(re,a-t*2);return u=U(u,oe,f),v=U(v,re,x),i=U(i,t,r-u-t),l=U(l,t,a-v-t),{left:i,top:l,width:u,height:v}}function uo(){const{width:e,height:t}=Pe(),r=Math.round((window.innerWidth-e)/2),a=Math.round((window.innerHeight-t)/2);return G({left:r,top:a,width:e,height:t})}function po(e){if(!e||typeof e!="object")return null;const t=e;if(typeof t.left!="number"||typeof t.top!="number")return null;const r=Pe(),a=typeof t.width=="number"?t.width:r.width,i=typeof t.height=="number"?t.height:r.height;return G({left:t.left,top:t.top,width:a,height:i})}function fo(){try{const e=localStorage.getItem(Ae);if(!e)return null;const t=JSON.parse(e);return t.dock!=null?po(t.dock):null}catch{return null}}function ho(e){try{localStorage.setItem(Ae,JSON.stringify({dock:e}))}catch{}}function xo(e,t,r,a,i=8){const l=Math.max(i,window.innerWidth-r-i),u=Math.max(i,window.innerHeight-a-i);return{left:Math.min(l,Math.max(i,e)),top:Math.min(u,Math.max(i,t))}}function mo(e){const t=e.toLowerCase();return t.endsWith(".md")||t.endsWith(".markdown")}const go=`
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
`;function Do({agentName:e,filePath:t,onClose:r,loadContent:a,onSave:i,onShare:l,defaultTocCollapsed:u,tocStorageKey:v}){const{requireAuth:f}=Et(),x=Nt(),[j,m]=s.useState(!1),[d,k]=s.useState(null),[b,p]=s.useState(""),[C,O]=s.useState(!0),[S,y]=s.useState(null),[R,I]=s.useState(!1),[z,ae]=s.useState(!1),[se,_]=s.useState(null),[de,H]=s.useState(!1),[ce,ve]=s.useState(""),[E,we]=s.useState(!1),[Me,le]=s.useState(null),[Oe,ue]=s.useState(!1),[_e,pe]=s.useState("running"),[He,X]=s.useState(()=>B()),[Fe,$e]=s.useState(""),ke=s.useRef(a);ke.current=a;const ie=s.useCallback((n,c)=>(ke.current??((g,Z)=>Ft(Z).then(M=>M.content)))(n,c),[]),[L,F]=s.useState(()=>te()?ge():fo()??uo()),q=s.useRef(null),T=s.useRef(null),D=s.useRef(null),J=s.useRef(!1),ye=s.useRef(null);s.useEffect(()=>{if(!e||!t)return;let n=!1;return O(!0),y(null),k(null),p(""),I(!1),_(null),H(!1),ve(""),le(null),ie(e,t).then(c=>{n||(k(c),p(c))}).catch(c=>{n||y(c.message||"文件读取失败")}).finally(()=>{n||O(!1)}),()=>{n=!0}},[e,t,ie]),s.useEffect(()=>{const n=c=>{if(c.key==="Escape"){if(de){H(!1);return}r()}};return window.addEventListener("keydown",n),()=>window.removeEventListener("keydown",n)},[r,de]),s.useEffect(()=>{const n=()=>{if(te()){F(ge());return}F(c=>G(c))};return n(),window.addEventListener("resize",n),()=>window.removeEventListener("resize",n)},[x]);const je=s.useCallback(n=>{te()||ho(n)},[]),We=s.useCallback(()=>{!e||!t||(O(!0),y(null),ie(e,t).then(n=>{k(n),p(n)}).catch(n=>y(n.message||"文件读取失败")).finally(()=>O(!1)))},[e,t,ie]),A=i!=null&&d!==null&&b!==d;s.useEffect(()=>{const n=c=>{A&&(c.preventDefault(),c.returnValue="")};return window.addEventListener("beforeunload",n),()=>window.removeEventListener("beforeunload",n)},[A]);const Be=s.useCallback(()=>{_(null),H(!1),I(!0)},[]),Ue=s.useCallback(()=>{I(!1),_(null)},[]),Ge=s.useCallback(async()=>{if(!(!f()||!i||!A)){ae(!0),_(null);try{await i(b),k(b),I(!1),Rt.success("保存成功")}catch(n){_(n instanceof Error?n.message:"保存失败")}finally{ae(!1)}}},[f,i,b,A]),Ke=s.useCallback(()=>{d!=null&&(p(d),I(!1),_(null))},[d]),Ye=s.useCallback(async()=>{if(!f())return;const n=ce.trim();if(!n||E)return;H(!1),we(!0),le(null),ue(!0),pe("running"),$e(n),X(ee(B(),"validate",[]));const c=h=>new Promise(g=>setTimeout(g,h));try{await c(200),X(ee(B(),"call",["validate"]));const{content:h}=await $t(e,{prompt:n,current_content:b});X(ee(B(),"finalize",["validate","call"])),await c(150),p(h),X(ee(B(),null,["validate","call","finalize"])),pe("success"),await c(700),ue(!1),H(!1)}catch(h){const g=h instanceof Error?h.message:"润色失败";le(g),X(ee(B(),null,["validate"],"call")),pe("error"),await c(2200),ue(!1)}finally{we(!1)}},[f,e,ce,b,E]),$=t.split("/").pop()??t,P=mo($),Xe=s.useCallback(()=>{if(d===null)return;const n=P?"text/markdown;charset=utf-8":"text/plain;charset=utf-8",c=new Blob([b],{type:n}),h=URL.createObjectURL(c),g=document.createElement("a");g.href=h,g.download=$,g.style.display="none",document.body.appendChild(g),g.click(),g.remove(),URL.revokeObjectURL(h)},[b,$,P,d]),{headings:fe,activeId:Ce,scrollToHeading:Se}=ft(ye,R?null:b,P),ze=P&&!C&&!S&&d!=null&&fe.length>0,V=ze&&(x||L.width<lo),qe=P&&!C&&!S&&d!==null&&!R;return s.useEffect(()=>{V||m(!1)},[V]),o.jsxs(o.Fragment,{children:[o.jsx("style",{children:go}),o.jsx(io,{open:Oe,title:`AI 润色 ${$}`,description:"正在根据你的描述润色文档…",prompt:Fe,steps:He,error:Me,phase:_e}),o.jsx("button",{type:"button",className:"doc-dock-backdrop","aria-label":"关闭文档",onClick:r}),o.jsxs("aside",{ref:q,className:N("doc-dock",x&&"doc-dock--mobile"),style:{left:L.left,top:L.top,width:L.width,height:L.height},"aria-label":`文档: ${$}`,children:[o.jsxs("div",{className:"doc-dock-head",children:[o.jsx("div",{className:"doc-dock-head-left",children:o.jsxs("div",{className:"doc-dock-drag",role:"presentation",title:"拖拽移动浮窗 · 右下角可调整大小",onPointerDown:n=>{x||n.button===0&&(n.target.closest("button, input")||(n.currentTarget.setPointerCapture(n.pointerId),J.current=!1,T.current={pointerId:n.pointerId,sx:n.clientX,sy:n.clientY,ox:L.left,oy:L.top}))},onPointerMove:n=>{if(!T.current||n.pointerId!==T.current.pointerId)return;const{sx:c,sy:h,ox:g,oy:Z}=T.current,M=n.clientX-c,W=n.clientY-h;M*M+W*W>16&&(J.current=!0),F(Q=>{if(!Q)return Q;const Ne=xo(g+M,Z+W,Q.width,Q.height);return{...Q,left:Ne.left,top:Ne.top}})},onPointerUp:n=>{if(!(!T.current||n.pointerId!==T.current.pointerId)){try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}if(T.current=null,J.current&&q.current){const c=q.current.getBoundingClientRect(),h=G({left:c.left,top:c.top,width:c.width,height:c.height});F(h),je(h)}J.current=!1}},onPointerCancel:n=>{T.current=null,J.current=!1;try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}},children:[o.jsx(ht,{className:N("size-4 shrink-0",P?"text-violet-500/70":"text-muted-foreground")}),o.jsxs("span",{className:"doc-dock-title",children:[$,A&&o.jsx("span",{className:"ml-1 text-violet-600",children:"•"})]})]})}),o.jsx("div",{className:"doc-dock-head-center",children:qe&&o.jsx(no,{open:de,onOpenChange:H,prompt:ce,onPromptChange:ve,onSubmit:()=>void Ye(),submitting:E,disabled:z,side:"bottom",align:"center"})}),o.jsxs("div",{className:"doc-dock-head-right",children:[V&&o.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>m(!0),title:"打开目录","aria-label":"打开目录",children:[o.jsx(xt,{className:"size-3.5"}),"目录"]}),!C&&!S&&d!==null&&l&&o.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:l,title:"复制分享链接","aria-label":"复制分享链接",children:o.jsx(mt,{className:"size-3.5"})}),!C&&!S&&d!==null&&o.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:Xe,title:"下载","aria-label":"下载文档",children:o.jsx(ut,{className:"size-3.5"})}),i&&!C&&!S&&d!==null&&(R?o.jsx("button",{type:"button",className:"rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:Ue,disabled:z||E,children:"完成编辑"}):o.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",onClick:Be,title:"编辑","aria-label":"编辑文档",disabled:E,children:o.jsx(Mt,{className:"size-3.5"})})),o.jsx("button",{type:"button",className:"doc-dock-close",onClick:r,"aria-label":"关闭",children:o.jsx(It,{className:"size-4"})})]})]}),o.jsxs("div",{className:"doc-dock-body flex min-h-0 min-w-0 flex-col",children:[R?o.jsx("div",{className:"flex min-h-0 flex-1 flex-col p-3",children:o.jsx("textarea",{value:b,onChange:n=>p(n.target.value),spellCheck:!1,disabled:z||E,className:"min-h-0 flex-1 w-full resize-none rounded-md border border-border/60 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-violet-500/60",placeholder:"输入文件内容…"})}):o.jsxs("div",{className:"flex min-h-0 min-w-0 flex-1",children:[ze&&!V&&o.jsx(gt,{headings:fe,activeId:Ce,onHeadingClick:Se,defaultCollapsed:u,storageKey:v}),V&&o.jsx(bt,{open:j,onOpenChange:m,headings:fe,activeId:Ce,onHeadingClick:Se}),o.jsx(lt,{ref:ye,className:"doc-dock-scroll min-h-0 min-w-0 flex-1",children:C?o.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[o.jsx(me,{className:"size-5 animate-spin text-muted-foreground/50"}),o.jsx("span",{className:"text-xs text-muted-foreground",children:"加载文档中..."})]}):S?o.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[o.jsx("p",{className:"text-sm text-destructive",children:S}),o.jsxs("button",{type:"button",className:"flex items-center gap-1 text-xs text-violet-500 hover:underline",onClick:We,children:[o.jsx(Ot,{className:"size-3"}),"重试"]})]}):d===null?o.jsx("div",{className:"px-8 py-16 text-center text-sm text-muted-foreground",children:"文件内容为空"}):P?o.jsx("div",{className:"doc-dock-article",children:o.jsx(pt,{copyableCode:!0,size:x?"sm":"md",className:"doc-reading-prose",children:b})}):o.jsx("pre",{className:"doc-dock-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:b})})]}),i&&!C&&!S&&d!==null&&o.jsxs("div",{className:"flex shrink-0 items-center justify-end gap-2 border-t border-border/40 px-3 py-2",children:[se&&o.jsx("span",{className:"mr-auto max-w-[50%] truncate text-[11px] text-destructive",title:se,children:se}),o.jsx(xe,{type:"button",variant:"ghost",size:"sm",disabled:!A||z||E,onClick:Ke,children:"撤销"}),o.jsx(xe,{type:"button",size:"sm",className:De,disabled:!A||z||E,onClick:()=>void Ge(),children:z?o.jsxs(o.Fragment,{children:[o.jsx(me,{className:"mr-1 size-3.5 animate-spin"}),"保存中…"]}):o.jsxs(o.Fragment,{children:[o.jsx(Ht,{className:"mr-1 size-3.5"}),"保存"]})})]})]}),o.jsx("div",{className:"doc-dock-resize",role:"presentation",onPointerDown:n=>{x||n.button===0&&(n.currentTarget.setPointerCapture(n.pointerId),D.current={pointerId:n.pointerId,sx:n.clientX,sy:n.clientY,orig:{...L}})},onPointerMove:n=>{if(!D.current||n.pointerId!==D.current.pointerId)return;const{sx:c,sy:h,orig:g}=D.current,Z=n.clientX-c,M=n.clientY-h;F(W=>W&&G({left:g.left,top:g.top,width:Math.max(oe,g.width+Z),height:Math.max(re,g.height+M)}))},onPointerUp:n=>{if(!(!D.current||n.pointerId!==D.current.pointerId)){try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}if(D.current=null,q.current){const c=q.current.getBoundingClientRect(),h=G({left:c.left,top:c.top,width:c.width,height:c.height});F(h),je(h)}}},onPointerCancel:n=>{D.current=null;try{n.currentTarget.releasePointerCapture(n.pointerId)}catch{}}})]})]})}function Ao({...e}){return o.jsx(st,{"data-slot":"collapsible",...e})}function Po({...e}){return o.jsx(dt,{"data-slot":"collapsible-trigger",...e})}function Mo({...e}){return o.jsx(ct,{"data-slot":"collapsible-content",...e})}export{no as A,Ao as C,Do as D,io as P,Po as a,Mo as b,To as c,Lo as d,ro as e,B as i,Io as l,ee as s,Eo as w};
