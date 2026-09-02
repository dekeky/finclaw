import{j as n,m as ut,n as pt,o as ft,p as mt,q as xt,R as ht,P as gt,O as bt,C as wt,T as vt,D as kt,r as yt,s as jt,t as St}from"./radix-CxiPtrkn.js";import{a as s,R as he}from"./react-vendor-DN2CTUzv.js";import{S as Fe}from"./scroll-area-BoNgW-Wo.js";import{a as Ct,M as Nt}from"./MarkdownContent-DEx_7pct.js";import{u as Rt,a as zt,e as It,f as Et,D as Dt,g as Tt,b as ve,d as ke,T as Ue,r as We,A as Lt}from"./agentAssets-uOsJ3hRC.js";import{c as Be,a5 as Pt,n as Mt,T as $t,L as At,a as $,M as Ot,B as ge,v as _t,a6 as Ht,R as V,a7 as Ft,t as be,S as Ut,a8 as Wt,a9 as Bt,aa as Gt}from"./index-cwhP_lf6.js";import{u as Yt}from"./useRequireAuth-Bsr7VV3o.js";import{_ as Xt,a as qt}from"./syntax-highlighter-DVbdWQ2O.js";import{d as Kt,b as Ge,f as Jt}from"./ThemeToggle-D7VSWTxu.js";import{f as Vt,h as Zt}from"./agentLLMSettings-DPeseGhr.js";import{I as Qt}from"./AgentAvatar-BDr5WbJ1.js";import{H as en}from"./HintTooltip-4-Yvut5n.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const tn=[["path",{d:"M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2",key:"svg-0"}],["path",{d:"M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",key:"svg-1"}],["path",{d:"M14 4l0 4l-6 0l0 -4",key:"svg-2"}]],nn=Be("outline","device-floppy","DeviceFloppy",tn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const on=[["path",{d:"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",key:"svg-0"}],["path",{d:"M7 9l5 -5l5 5",key:"svg-1"}],["path",{d:"M12 4l0 12",key:"svg-2"}]],rn=Be("outline","upload","Upload",on),Z="/api/v1/agents";function Q(){const t=Mt();return t?{Authorization:`Bearer ${t}`}:{}}function le(t){if(t.code!==200)throw new Error(t.errMsg||"request failed");return t.body}async function so(t,e){const o=e?`?subpath=${encodeURIComponent(e)}`:"",r=await fetch(`${Z}/${encodeURIComponent(t)}/docs${o}`,{headers:{...Q()}});return le(await r.json())}async function an(t,e){const o=e.split("/").map(encodeURIComponent).join("/"),r=await fetch(`${Z}/${encodeURIComponent(t)}/docs/${o}`,{headers:{...Q()}});return le(await r.json())}async function co(t,e,o){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${Z}/${encodeURIComponent(t)}/docs/${r}`,{method:"PUT",headers:{"Content-Type":"application/json",...Q()},body:JSON.stringify({content:o})});return le(await a.json())}async function lo(t,e,o=!1){const r=e.split("/").map(encodeURIComponent).join("/"),a=await fetch(`${Z}/${encodeURIComponent(t)}/docs/${r}?download=1`,{headers:{...Q()}}),d=e.split("/").pop()??e,u=o?`${d}.zip`:d;await Pt(a,u)}async function uo(t,e){const o=e.split("/").map(encodeURIComponent).join("/"),r=await fetch(`${Z}/${encodeURIComponent(t)}/docs/${o}`,{method:"DELETE",headers:{...Q()}});le(await r.json())}async function sn(t,e){const o=await fetch(`${Z}/${encodeURIComponent(t)}/docs/polish`,{method:"POST",headers:{"Content-Type":"application/json",...Q()},body:JSON.stringify(e)});return le(await o.json())}var dn=s.useLayoutEffect,cn=function(e){var o=he.useRef(e);return dn(function(){o.current=e}),o},Me=function(e,o){if(typeof e=="function"){e(o);return}e.current=o},ln=function(e,o){var r=he.useRef();return he.useCallback(function(a){e.current=a,r.current&&Me(r.current,null),r.current=o,o&&Me(o,a)},[o])},$e={"min-height":"0","max-height":"none",height:"0",visibility:"hidden",overflow:"hidden",position:"absolute","z-index":"-1000",top:"0",right:"0",display:"block"},un=function(e){Object.keys($e).forEach(function(o){e.style.setProperty(o,$e[o],"important")})},Ae=un,T=null,Oe=function(e,o){var r=e.scrollHeight;return o.sizingStyle.boxSizing==="border-box"?r+o.borderSize:r-o.paddingSize};function pn(t,e,o,r){o===void 0&&(o=1),r===void 0&&(r=1/0),T||(T=document.createElement("textarea"),T.setAttribute("tabindex","-1"),T.setAttribute("aria-hidden","true"),Ae(T)),T.parentNode===null&&document.body.appendChild(T);var a=t.paddingSize,d=t.borderSize,u=t.sizingStyle,m=u.boxSizing;Object.keys(u).forEach(function(c){var k=c;T.style[k]=u[k]}),Ae(T),T.value=e;var h=Oe(T,t);T.value=e,h=Oe(T,t),T.value="x";var v=T.scrollHeight-a,j=v*o;m==="border-box"&&(j=j+a+d),h=Math.max(j,h);var g=v*r;return m==="border-box"&&(g=g+a+d),h=Math.min(g,h),[h,v]}var _e=function(){},fn=function(e,o){return e.reduce(function(r,a){return r[a]=o[a],r},{})},mn=["borderBottomWidth","borderLeftWidth","borderRightWidth","borderTopWidth","boxSizing","fontFamily","fontSize","fontStyle","fontWeight","letterSpacing","lineHeight","paddingBottom","paddingLeft","paddingRight","paddingTop","tabSize","textIndent","textRendering","textTransform","width","wordBreak","wordSpacing","scrollbarGutter"],xn=!!document.documentElement.currentStyle,hn=function(e){var o=window.getComputedStyle(e);if(o===null)return null;var r=fn(mn,o),a=r.boxSizing;if(a==="")return null;xn&&a==="border-box"&&(r.width=parseFloat(r.width)+parseFloat(r.borderRightWidth)+parseFloat(r.borderLeftWidth)+parseFloat(r.paddingRight)+parseFloat(r.paddingLeft)+"px");var d=parseFloat(r.paddingBottom)+parseFloat(r.paddingTop),u=parseFloat(r.borderBottomWidth)+parseFloat(r.borderTopWidth);return{sizingStyle:r,paddingSize:d,borderSize:u}},gn=hn;function ye(t,e,o){var r=cn(o);s.useLayoutEffect(function(){var a=function(u){return r.current(u)};if(t)return t.addEventListener(e,a),function(){return t.removeEventListener(e,a)}},[])}var bn=function(e,o){ye(document.body,"reset",function(r){e.current.form===r.target&&o(r)})},wn=function(e){ye(window,"resize",e)},vn=function(e){ye(document.fonts,"loadingdone",e)},kn=["cacheMeasurements","maxRows","minRows","onChange","onHeightChange"],yn=function(e,o){var r=e.cacheMeasurements,a=e.maxRows,d=e.minRows,u=e.onChange,m=u===void 0?_e:u,h=e.onHeightChange,v=h===void 0?_e:h,j=Xt(e,kn),g=j.value!==void 0,c=s.useRef(null),k=ln(c,o),b=s.useRef(0),l=s.useRef(),w=function(){var S=c.current,D=r&&l.current?l.current:gn(S);if(D){l.current=D;var P=pn(D,S.value||S.placeholder||"x",d,a),y=P[0],I=P[1];b.current!==y&&(b.current=y,S.style.setProperty("height",y+"px","important"),v(y,{rowHeight:I}))}},R=function(S){g||w(),m(S)};return s.useLayoutEffect(w),bn(c,function(){if(!g){var x=c.current.value;requestAnimationFrame(function(){var S=c.current;S&&x!==S.value&&w()})}}),wn(w),vn(w),s.createElement("textarea",qt({},j,{onChange:R,ref:k}))},jn=s.forwardRef(yn);function Sn({open:t,onOpenChange:e,prompt:o,onPromptChange:r,onSubmit:a,submitting:d=!1,disabled:u=!1,placeholder:m="翻译为中文",triggerClassName:h,side:v="bottom",align:j="center"}){const g=d||u;return n.jsxs(ut,{open:t,onOpenChange:e,modal:!1,children:[n.jsxs($t,{children:[n.jsx(At,{asChild:!0,children:n.jsx(pt,{asChild:!0,children:n.jsx("button",{type:"button",className:$("flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90",g&&"opacity-80",h),disabled:g,"aria-label":t?"收起润色输入":"AI 润色","aria-expanded":t,children:n.jsx("span",{className:$("flex size-6 items-center justify-center rounded-md",Kt),children:n.jsx(Vt,{className:"size-3.5",stroke:1.75,"aria-hidden":!0})})})})}),n.jsx(Ot,{side:"bottom",sideOffset:6,className:"z-[1220]",children:t?"收起润色输入":"AI 润色"})]}),n.jsx(ft,{children:n.jsxs(mt,{side:v,align:j,sideOffset:10,collisionPadding:12,className:$("z-[1220] w-[min(92vw,22rem)] rounded-xl p-3 shadow-xl outline-none","border border-violet-500/30 bg-background/72 backdrop-blur-xl","supports-backdrop-filter:bg-background/55",Jt,"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95","data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"),onOpenAutoFocus:c=>{const k=c.currentTarget.querySelector("textarea");k instanceof HTMLTextAreaElement&&(c.preventDefault(),k.focus())},children:[n.jsx(xt,{className:"fill-background/80"}),n.jsx("p",{className:"text-xs font-medium text-violet-800 dark:text-violet-200",children:"AI 润色"}),n.jsx("p",{className:"mt-0.5 text-[11px] leading-relaxed text-muted-foreground",children:"输入润色要求，下方文档仍可浏览与滚动"}),n.jsxs("div",{className:"mt-2.5 flex flex-col gap-2",children:[n.jsx(jn,{value:o,onChange:c=>r(c.target.value),placeholder:m,disabled:g,minRows:2,maxRows:8,className:$("w-full min-w-0 resize-none rounded-md border border-violet-500/20 bg-background/80 px-2.5 py-1.5 text-xs","break-words whitespace-pre-wrap leading-relaxed","placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet-500/30","disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"),onKeyDown:c=>{c.key==="Enter"&&(c.ctrlKey||c.metaKey)&&(c.preventDefault(),o.trim()&&!g&&a())}}),n.jsx("p",{className:"text-[10px] text-muted-foreground/80",children:"Ctrl+Enter 开始润色"}),n.jsx(ge,{type:"button",size:"sm",className:$("h-8 w-full text-xs",Ge),disabled:!o.trim()||g,onClick:()=>a(),children:d?"润色中…":"开始润色"})]})]})})]})}function Cn({status:t}){return t==="done"?n.jsx(Ht,{className:"size-4 text-emerald-600","aria-hidden":!0}):t==="active"?n.jsx(V,{className:"size-4 animate-spin text-primary","aria-hidden":!0}):t==="error"?n.jsx("span",{className:"size-4 text-center text-xs text-destructive",children:"!"}):n.jsx("span",{className:"size-4 rounded-full border border-border/80 bg-muted/40","aria-hidden":!0})}function Nn({open:t,fileName:e,prompt:o,subject:r,subjectLabel:a="提示词",title:d,description:u,successMessage:m,steps:h,error:v,phase:j}){const g=e?_t[e].title:"",c=d??(g?`AI 润色 ${g}`:"AI 处理中"),k=u??"正在根据你的描述润色内容…",b=r??o??"";return n.jsx(ht,{open:t,children:n.jsxs(gt,{children:[n.jsx(bt,{className:"fixed inset-0 z-[1210] bg-black/40 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0"}),n.jsxs(wt,{className:$("fixed left-1/2 top-1/2 z-[1211] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2","rounded-xl border border-border bg-background p-5 shadow-xl","data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"),onPointerDownOutside:l=>l.preventDefault(),onEscapeKeyDown:l=>l.preventDefault(),children:[n.jsx(vt,{className:"text-sm font-semibold text-foreground",children:c}),n.jsx(kt,{className:"mt-1 text-xs text-muted-foreground",children:k}),n.jsxs("div",{className:"mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2",children:[n.jsx("p",{className:"text-[10px] font-medium uppercase tracking-wide text-muted-foreground",children:a}),n.jsx("p",{className:"mt-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",children:b})]}),n.jsx("ol",{className:"mt-4 space-y-2.5",children:h.map(l=>n.jsxs("li",{className:"flex items-start gap-2.5",children:[n.jsx("span",{className:"mt-0.5 flex size-5 shrink-0 items-center justify-center",children:n.jsx(Cn,{status:l.status})}),n.jsx("span",{className:$("text-xs leading-relaxed",l.status==="active"&&"font-medium text-foreground",l.status==="done"&&"text-muted-foreground",l.status==="pending"&&"text-muted-foreground/70",l.status==="error"&&"text-destructive"),children:l.label})]},l.id))}),j==="success"&&n.jsx("p",{className:"mt-4 text-xs text-emerald-600",children:m??"润色完成，正在关闭…"}),j==="error"&&v&&n.jsx("p",{className:"mt-4 text-xs text-destructive",children:v})]})]})})}const Rn=[{id:"validate",label:"校验输入"},{id:"call",label:"正在润色"},{id:"finalize",label:"写入编辑器"}];function q(){return Rn.map(t=>({id:t.id,label:t.label,status:"pending"}))}function ie(t,e,o,r){return t.map(a=>r&&a.id===r?{...a,status:"error"}:o.includes(a.id)?{...a,status:"done"}:a.id===e?{...a,status:"active"}:{...a,status:"pending"})}const de=480,ce=400,Ye="finclaw.docDock.position",zn=768,In=900;function se(){return typeof window<"u"&&window.innerWidth<zn}function K(t,e,o){return Math.min(o,Math.max(e,t))}function we(){return{left:0,top:0,width:window.innerWidth,height:window.innerHeight}}function Xe(){const t=window.innerWidth,e=window.innerHeight;if(se())return{width:t,height:e};const o=24,r=Math.round(t*.85),a=Math.round(e*.8);return{width:K(r,de,Math.max(de,t-o*2)),height:K(a,ce,Math.max(ce,e-o*2))}}function J(t,e=8){if(se())return we();const o=window.innerWidth,r=window.innerHeight;let{left:a,top:d,width:u,height:m}=t;const h=Math.max(de,o-e*2),v=Math.max(ce,r-e*2);return u=K(u,de,h),m=K(m,ce,v),a=K(a,e,o-u-e),d=K(d,e,r-m-e),{left:a,top:d,width:u,height:m}}function En(){const{width:t,height:e}=Xe(),o=Math.round((window.innerWidth-t)/2),r=Math.round((window.innerHeight-e)/2);return J({left:o,top:r,width:t,height:e})}function Dn(t){if(!t||typeof t!="object")return null;const e=t;if(typeof e.left!="number"||typeof e.top!="number")return null;const o=Xe(),r=typeof e.width=="number"?e.width:o.width,a=typeof e.height=="number"?e.height:o.height;return J({left:e.left,top:e.top,width:r,height:a})}function Tn(){try{const t=localStorage.getItem(Ye);if(!t)return null;const e=JSON.parse(t);return e.dock!=null?Dn(e.dock):null}catch{return null}}function Ln(t){try{localStorage.setItem(Ye,JSON.stringify({dock:t}))}catch{}}function Pn(t,e,o,r,a=8){const d=Math.max(a,window.innerWidth-o-a),u=Math.max(a,window.innerHeight-r-a);return{left:Math.min(d,Math.max(a,t)),top:Math.min(u,Math.max(a,e))}}function Mn(t){const e=t.toLowerCase();return e.endsWith(".md")||e.endsWith(".markdown")}const $n=`
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
`;function po({agentName:t,filePath:e,onClose:o,loadContent:r,onSave:a,onShare:d,defaultTocCollapsed:u,tocStorageKey:m}){const{requireAuth:h}=Yt(),v=Ft(),[j,g]=s.useState(!1),[c,k]=s.useState(null),[b,l]=s.useState(""),[w,R]=s.useState(!0),[x,S]=s.useState(null),[D,P]=s.useState(!1),[y,I]=s.useState(!1),[A,p]=s.useState(null),[E,z]=s.useState(!1),[L,M]=s.useState(""),[O,Re]=s.useState(!1),[Ve,pe]=s.useState(null),[Ze,fe]=s.useState(!1),[Qe,me]=s.useState("running"),[et,ee]=s.useState(()=>q()),[tt,nt]=s.useState(""),ze=s.useRef(r);ze.current=r;const ue=s.useCallback((i,f)=>(ze.current??((N,re)=>an(N,re).then(B=>B.content)))(i,f),[]),[_,G]=s.useState(()=>se()?we():Tn()??En()),te=s.useRef(null),H=s.useRef(null),F=s.useRef(null),ne=s.useRef(!1),Ie=s.useRef(null);s.useEffect(()=>{if(!t||!e)return;let i=!1;return R(!0),S(null),k(null),l(""),P(!1),p(null),z(!1),M(""),pe(null),ue(t,e).then(f=>{i||(k(f),l(f))}).catch(f=>{i||S(f.message||"文件读取失败")}).finally(()=>{i||R(!1)}),()=>{i=!0}},[t,e,ue]),s.useEffect(()=>{const i=f=>{if(f.key==="Escape"){if(E){z(!1);return}o()}};return window.addEventListener("keydown",i),()=>window.removeEventListener("keydown",i)},[o,E]),s.useEffect(()=>{const i=()=>{if(se()){G(we());return}G(f=>J(f))};return i(),window.addEventListener("resize",i),()=>window.removeEventListener("resize",i)},[v]);const Ee=s.useCallback(i=>{se()||Ln(i)},[]),ot=s.useCallback(()=>{!t||!e||(R(!0),S(null),ue(t,e).then(i=>{k(i),l(i)}).catch(i=>S(i.message||"文件读取失败")).finally(()=>R(!1)))},[t,e,ue]),U=a!=null&&c!==null&&b!==c;s.useEffect(()=>{const i=f=>{U&&(f.preventDefault(),f.returnValue="")};return window.addEventListener("beforeunload",i),()=>window.removeEventListener("beforeunload",i)},[U]);const rt=s.useCallback(()=>{p(null),z(!1),P(!0)},[]),at=s.useCallback(()=>{P(!1),p(null)},[]),it=s.useCallback(async()=>{if(!(!h()||!a||!U)){I(!0),p(null);try{await a(b),k(b),P(!1),be.success("保存成功")}catch(i){p(i instanceof Error?i.message:"保存失败")}finally{I(!1)}}},[h,a,b,U]),st=s.useCallback(()=>{c!=null&&(l(c),P(!1),p(null))},[c]),dt=s.useCallback(async()=>{if(!h())return;const i=L.trim();if(!i||O)return;z(!1),Re(!0),pe(null),fe(!0),me("running"),nt(i),ee(ie(q(),"validate",[]));const f=C=>new Promise(N=>setTimeout(N,C));try{await f(200),ee(ie(q(),"call",["validate"]));const{content:C}=await sn(t,{prompt:i,current_content:b});ee(ie(q(),"finalize",["validate","call"])),await f(150),l(C),ee(ie(q(),null,["validate","call","finalize"])),me("success"),await f(700),fe(!1),z(!1)}catch(C){const N=C instanceof Error?C.message:"润色失败";pe(N),ee(ie(q(),null,["validate"],"call")),me("error"),await f(2200),fe(!1)}finally{Re(!1)}},[h,t,L,b,O]),Y=e.split("/").pop()??e,W=Mn(Y),ct=s.useCallback(()=>{if(c===null)return;const i=W?"text/markdown;charset=utf-8":"text/plain;charset=utf-8",f=new Blob([b],{type:i}),C=URL.createObjectURL(f),N=document.createElement("a");N.href=C,N.download=Y,N.style.display="none",document.body.appendChild(N),N.click(),N.remove(),URL.revokeObjectURL(C)},[b,Y,W,c]),{headings:xe,activeId:De,scrollToHeading:Te}=Rt(Ie,D?null:b,W),Le=W&&!w&&!x&&c!=null&&xe.length>0,oe=Le&&(v||_.width<In),lt=W&&!w&&!x&&c!==null&&!D;return s.useEffect(()=>{oe||g(!1)},[oe]),n.jsxs(n.Fragment,{children:[n.jsx("style",{children:$n}),n.jsx(Nn,{open:Ze,title:`AI 润色 ${Y}`,description:"正在根据你的描述润色文档…",prompt:tt,steps:et,error:Ve,phase:Qe}),n.jsx("button",{type:"button",className:"doc-dock-backdrop","aria-label":"关闭文档",onClick:o}),n.jsxs("aside",{ref:te,className:$("doc-dock",v&&"doc-dock--mobile"),style:{left:_.left,top:_.top,width:_.width,height:_.height},"aria-label":`文档: ${Y}`,children:[n.jsxs("div",{className:"doc-dock-head",children:[n.jsx("div",{className:"doc-dock-head-left",children:n.jsxs("div",{className:"doc-dock-drag",role:"presentation",title:"拖拽移动浮窗 · 右下角可调整大小",onPointerDown:i=>{v||i.button===0&&(i.target.closest("button, input")||(i.currentTarget.setPointerCapture(i.pointerId),ne.current=!1,H.current={pointerId:i.pointerId,sx:i.clientX,sy:i.clientY,ox:_.left,oy:_.top}))},onPointerMove:i=>{if(!H.current||i.pointerId!==H.current.pointerId)return;const{sx:f,sy:C,ox:N,oy:re}=H.current,B=i.clientX-f,X=i.clientY-C;B*B+X*X>16&&(ne.current=!0),G(ae=>{if(!ae)return ae;const Pe=Pn(N+B,re+X,ae.width,ae.height);return{...ae,left:Pe.left,top:Pe.top}})},onPointerUp:i=>{if(!(!H.current||i.pointerId!==H.current.pointerId)){try{i.currentTarget.releasePointerCapture(i.pointerId)}catch{}if(H.current=null,ne.current&&te.current){const f=te.current.getBoundingClientRect(),C=J({left:f.left,top:f.top,width:f.width,height:f.height});G(C),Ee(C)}ne.current=!1}},onPointerCancel:i=>{H.current=null,ne.current=!1;try{i.currentTarget.releasePointerCapture(i.pointerId)}catch{}},children:[n.jsx(zt,{className:$("size-4 shrink-0",W?"text-violet-500/70":"text-muted-foreground")}),n.jsxs("span",{className:"doc-dock-title",children:[Y,U&&n.jsx("span",{className:"ml-1 text-violet-600",children:"•"})]})]})}),n.jsx("div",{className:"doc-dock-head-center",children:lt&&n.jsx(Sn,{open:E,onOpenChange:z,prompt:L,onPromptChange:M,onSubmit:()=>void dt(),submitting:O,disabled:y,side:"bottom",align:"center"})}),n.jsxs("div",{className:"doc-dock-head-right",children:[oe&&n.jsxs("button",{type:"button",className:"doc-dock-toc-trigger",onClick:()=>g(!0),title:"打开目录","aria-label":"打开目录",children:[n.jsx(It,{className:"size-3.5"}),"目录"]}),!w&&!x&&c!==null&&d&&n.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:d,title:"复制分享链接","aria-label":"复制分享链接",children:n.jsx(Et,{className:"size-3.5"})}),!w&&!x&&c!==null&&n.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:ct,title:"下载","aria-label":"下载文档",children:n.jsx(Ct,{className:"size-3.5"})}),a&&!w&&!x&&c!==null&&(D?n.jsx("button",{type:"button",className:"rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",onClick:at,disabled:y||O,children:"完成编辑"}):n.jsx("button",{type:"button",className:"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",onClick:rt,title:"编辑","aria-label":"编辑文档",disabled:O,children:n.jsx(Zt,{className:"size-3.5"})})),n.jsx("button",{type:"button",className:"doc-dock-close",onClick:o,"aria-label":"关闭",children:n.jsx(Ut,{className:"size-4"})})]})]}),n.jsxs("div",{className:"doc-dock-body flex min-h-0 min-w-0 flex-col",children:[D?n.jsx("div",{className:"flex min-h-0 flex-1 flex-col p-3",children:n.jsx("textarea",{value:b,onChange:i=>l(i.target.value),spellCheck:!1,disabled:y||O,className:"min-h-0 flex-1 w-full resize-none rounded-md border border-border/60 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-violet-500/60",placeholder:"输入文件内容…"})}):n.jsxs("div",{className:"flex min-h-0 min-w-0 flex-1",children:[Le&&!oe&&n.jsx(Dt,{headings:xe,activeId:De,onHeadingClick:Te,defaultCollapsed:u,storageKey:m}),oe&&n.jsx(Tt,{open:j,onOpenChange:g,headings:xe,activeId:De,onHeadingClick:Te}),n.jsx(Fe,{ref:Ie,className:"doc-dock-scroll min-h-0 min-w-0 flex-1",children:w?n.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[n.jsx(V,{className:"size-5 animate-spin text-muted-foreground/50"}),n.jsx("span",{className:"text-xs text-muted-foreground",children:"加载文档中..."})]}):x?n.jsxs("div",{className:"flex flex-col items-center gap-2 px-8 py-16 text-center",children:[n.jsx("p",{className:"text-sm text-destructive",children:x}),n.jsxs("button",{type:"button",className:"flex items-center gap-1 text-xs text-violet-500 hover:underline",onClick:ot,children:[n.jsx(Qt,{className:"size-3"}),"重试"]})]}):c===null?n.jsx("div",{className:"px-8 py-16 text-center text-sm text-muted-foreground",children:"文件内容为空"}):W?n.jsx("div",{className:"doc-dock-article",children:n.jsx(Nt,{copyableCode:!0,size:v?"sm":"md",className:"doc-reading-prose",children:b})}):n.jsx("pre",{className:"doc-dock-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90",children:b})})]}),a&&!w&&!x&&c!==null&&n.jsxs("div",{className:"flex shrink-0 items-center justify-end gap-2 border-t border-border/40 px-3 py-2",children:[A&&n.jsx("span",{className:"mr-auto max-w-[50%] truncate text-[11px] text-destructive",title:A,children:A}),n.jsx(ge,{type:"button",variant:"ghost",size:"sm",disabled:!U||y||O,onClick:st,children:"撤销"}),n.jsx(ge,{type:"button",size:"sm",className:Ge,disabled:!U||y||O,onClick:()=>void it(),children:y?n.jsxs(n.Fragment,{children:[n.jsx(V,{className:"mr-1 size-3.5 animate-spin"}),"保存中…"]}):n.jsxs(n.Fragment,{children:[n.jsx(nn,{className:"mr-1 size-3.5"}),"保存"]})})]})]}),n.jsx("div",{className:"doc-dock-resize",role:"presentation",onPointerDown:i=>{v||i.button===0&&(i.currentTarget.setPointerCapture(i.pointerId),F.current={pointerId:i.pointerId,sx:i.clientX,sy:i.clientY,orig:{..._}})},onPointerMove:i=>{if(!F.current||i.pointerId!==F.current.pointerId)return;const{sx:f,sy:C,orig:N}=F.current,re=i.clientX-f,B=i.clientY-C;G(X=>X&&J({left:N.left,top:N.top,width:Math.max(de,N.width+re),height:Math.max(ce,N.height+B)}))},onPointerUp:i=>{if(!(!F.current||i.pointerId!==F.current.pointerId)){try{i.currentTarget.releasePointerCapture(i.pointerId)}catch{}if(F.current=null,te.current){const f=te.current.getBoundingClientRect(),C=J({left:f.left,top:f.top,width:f.width,height:f.height});G(C),Ee(C)}}},onPointerCancel:i=>{F.current=null;try{i.currentTarget.releasePointerCapture(i.pointerId)}catch{}}})]})]})}function je({...t}){return n.jsx(yt,{"data-slot":"collapsible",...t})}function Se({...t}){return n.jsx(jt,{"data-slot":"collapsible-trigger",...t})}function Ce({...t}){return n.jsx(St,{"data-slot":"collapsible-content",...t})}const He=["workspace","global","builtin"];function An(t,e,o){return`${t}::${e}::${o}`}const On={global:"全局",builtin:"内置"},_n={global:"~/.picoclaw/skills/",builtin:"builtin/skills/"};function Hn(t){const e=new Map;for(const r of t){const a=r.source||"unknown",d=e.get(a)??[];d.push(r),e.set(a,d)}for(const r of e.values())r.sort((a,d)=>a.name.localeCompare(d.name));const o=He.filter(r=>e.has(r)).map(r=>({source:r,items:e.get(r)}));for(const[r,a]of e.entries())He.includes(r)||o.push({source:r,items:a});return o}function Fn(t,e,o){if(e.source!=="workspace"||!t.onDeleteSkill)return;const r=e.dir||e.name;return()=>{(async()=>(await t.onDeleteSkill(e.source,r,e.name),await(o==null?void 0:o())))()}}function Ne(t,e,o){if(!t.onDownloadSkillPath)return;const r=e.dir||e.name;return()=>t.onDownloadSkillPath(e.source,r,o)}function Un(t,e,o){if(!t.onShareSkillPath)return;const r=e.dir||e.name;return()=>t.onShareSkillPath(e.source,r,o,!1)}function qe(t,e,o,r,a){if(e.source!=="workspace"||!t.onDeleteSkillPath)return;const d=e.dir||e.name;return()=>{(async()=>(await t.onDeleteSkillPath(e.source,d,o,r,e.name),await(a==null?void 0:a())))()}}function Wn(t,e,o){if(!t.onOpenFile)return;const r=e.dir||e.name;if(!r)return;const a=`${e.name}/${o}`;return()=>t.onOpenFile({source:e.source,skill:r,file:o,title:a})}function Bn(t,e,o){if(!t.activeFileKey)return!1;const r=e.dir||e.name;return t.activeFileKey===An(e.source,r,o)}function Gn(t){return[...t].sort((e,o)=>e.is_dir!==o.is_dir?e.is_dir?-1:1:e.name.localeCompare(o.name))}function Ke({skill:t,dirPath:e,entries:o,depth:r,ctx:a,treeCache:d,expandedDirs:u,loadingDirs:m,onSetDirExpanded:h,onRetryDir:v,onRefetchTree:j}){const g=Gn(o),c=t.dir||t.name,k=`${t.source}::${c}::`;return n.jsx("div",{className:"w-full min-w-0",children:g.map(b=>{const l=e?`${e}/${b.name}`:b.name,w=`${k}${l}`;return b.is_dir?n.jsx(Yn,{name:b.name,dirPath:l,depth:r,skill:t,ctx:a,expanded:u.has(w),loading:m.has(w),childrenEntries:d.get(w)??null,onOpenChange:R=>h(w,R),onRetry:()=>v(w,l),treeCache:d,expandedDirs:u,loadingDirs:m,onSetDirExpanded:h,onRetryDir:v,onRefetchTree:j},w):n.jsx(Lt,{name:b.name,depth:r,selected:Bn(a,t,l),title:`${t.name}/${l}`,onClick:Wn(a,t,l),onShare:Un(a,t,l),onDownload:Ne(a,t,l),onDelete:qe(a,t,l,!1,j)},w)})})}function Yn({name:t,dirPath:e,depth:o,skill:r,ctx:a,expanded:d,loading:u,childrenEntries:m,onOpenChange:h,onRetry:v,treeCache:j,expandedDirs:g,loadingDirs:c,onSetDirExpanded:k,onRetryDir:b,onRefetchTree:l}){const w=r.dir||r.name,R=`${r.source}::${w}::${e}`;return n.jsxs(je,{open:d,onOpenChange:h,children:[n.jsx(ve,{onDelete:qe(a,r,e,!0,async()=>{k(R,!1),await l()}),onDownload:Ne(a,r,e),deleteTitle:"删除文件夹",downloadTitle:"下载文件夹",trigger:n.jsx(Se,{asChild:!0,children:n.jsx(ke,{name:t,depth:o,expanded:d,loading:u})})}),n.jsx(Ce,{children:m===null&&!u?n.jsxs("div",{className:"flex items-center gap-1 py-1",style:{paddingLeft:We(o+1)},children:[n.jsx(Ue,{}),n.jsx("button",{type:"button",className:"text-[11px] text-violet-500 hover:underline",onClick:v,children:"加载"})]}):m!==null?n.jsx(Ke,{skill:r,dirPath:e,entries:m,depth:o+1,ctx:a,treeCache:j,expandedDirs:g,loadingDirs:c,onSetDirExpanded:k,onRetryDir:b,onRefetchTree:l}):null})]})}function Je({depth:t,skill:e,ctx:o}){const[r,a]=s.useState(!1),[d,u]=s.useState(new Map),[m,h]=s.useState(new Set),[v,j]=s.useState(new Set),[g,c]=s.useState(null),k=s.useRef(new Map),b=s.useRef(m);b.current=m;const l=s.useRef(r),w=s.useRef(!0);b.current=m,l.current=r;const R=e.dir||e.name,x=`${e.source}::${R}::`;s.useEffect(()=>{k.current=new Map,u(new Map),h(new Set),j(new Set),c(null),a(!1),w.current=!0},[o.agentName,e.source,R]);const S=s.useCallback(async(p,E)=>{const z=(k.current.get(p)??0)+1;k.current.set(p,z),j(L=>new Set(L).add(p));try{const L=await Gt(o.agentName,e.source,R,E||void 0);if(k.current.get(p)!==z)return;u(M=>new Map(M).set(p,L.files??[])),p===x&&c(null)}catch(L){if(k.current.get(p)!==z)return;p===x&&c(L instanceof Error?L.message:"加载失败")}finally{k.current.get(p)===z&&j(L=>{const M=new Set(L);return M.delete(p),M})}},[o.agentName,e.source,R,x]),D=s.useCallback(async()=>{if(!l.current)return;const p=[x,...Array.from(b.current)];await Promise.all(p.map(E=>S(E,E.slice(x.length))))},[S,x]);s.useEffect(()=>{if(w.current){w.current=!1;return}D()},[o.refreshRev,D]);const P=s.useCallback(p=>{a(p),p&&!d.has(x)&&S(x,"")},[d,x,S]),y=s.useCallback((p,E)=>{if(h(z=>{const L=z.has(p);if(E===L)return z;const M=new Set(z);return E?M.add(p):M.delete(p),M}),E&&!d.has(p)){const z=p.slice(x.length);S(p,z)}},[d,x,S]),I=Fn(o,e,D),A=Ne(o,e,"");return n.jsxs(je,{open:r,onOpenChange:P,children:[n.jsx(ve,{onDelete:I,onDownload:A,deleteTitle:"删除该 Skill 包",downloadTitle:"下载 Skill 包",trigger:n.jsx(Se,{asChild:!0,children:n.jsx(ke,{name:e.name,depth:t,expanded:r})})}),n.jsx(Ce,{children:g?n.jsx("p",{className:"px-3 py-2 text-[11px] text-destructive",children:g}):r&&!d.has(x)&&v.has(x)?n.jsxs("div",{className:"flex items-center gap-1 py-1",style:{paddingLeft:We(t+1)},children:[n.jsx(Ue,{}),n.jsx(V,{className:"size-3 animate-spin text-muted-foreground/50"})]}):d.has(x)?n.jsx(Ke,{skill:e,dirPath:"",entries:d.get(x)??[],depth:t+1,ctx:o,treeCache:d,expandedDirs:m,loadingDirs:v,onSetDirExpanded:y,onRetryDir:(p,E)=>void S(p,E),onRefetchTree:D}):null})]})}function Xn({source:t,items:e,ctx:o}){const[r,a]=s.useState(!1),d=On[t]??t,u=_n[t]??`${t}/`;return n.jsxs(je,{open:r,onOpenChange:a,children:[n.jsx(ve,{trigger:n.jsx(Se,{asChild:!0,children:n.jsx(ke,{name:d,depth:0,expanded:r,title:`${d} · ${u}`})})}),n.jsx(Ce,{children:e.map(m=>n.jsx(Je,{depth:1,skill:m,ctx:o},m.name))})]})}function qn({grouped:t,ctx:e}){return n.jsx("div",{className:"w-full min-w-0",children:t.map(({source:o,items:r})=>o==="workspace"?r.map(a=>n.jsx(Je,{depth:0,skill:a,ctx:e},`${o}-${a.name}`)):n.jsx(Xn,{source:o,items:r,ctx:e},o))})}function fo({agentName:t,className:e,onOpenFile:o,activeFileKey:r,onDeleteSkill:a,onDeleteSkillPath:d,onDownloadSkillPath:u,onShareSkillPath:m,refreshRev:h}){const[v,j]=s.useState(!1),[g,c]=s.useState(!1),[k,b]=s.useState(null),[l,w]=s.useState([]),R=s.useRef(null),x=s.useCallback(()=>{let y=!1;return j(!0),b(null),Wt(t).then(I=>{y||w(I.skills??[])}).catch(I=>{y||(b(I instanceof Error?I.message:String(I)),w([]))}).finally(()=>{y||j(!1)}),()=>{y=!0}},[t]);s.useEffect(()=>x(),[t,h,x]);const S=s.useCallback(async y=>{var A;const I=(A=y.target.files)==null?void 0:A[0];if(y.target.value="",!(!I||g)){c(!0);try{const E=(await Bt(t,I)).skill_dir||I.name;be.success(`已安装 Skill「${E}」`),x()}catch(p){be.error(p instanceof Error?p.message:"安装失败")}finally{c(!1)}}},[t,g,x]),D=s.useMemo(()=>Hn(l),[l]),P=s.useMemo(()=>({agentName:t,onOpenFile:o,activeFileKey:r,onDeleteSkill:a,onDeleteSkillPath:d,onDownloadSkillPath:u,onShareSkillPath:m,refreshRev:h}),[t,o,r,a,d,u,m,h]);return n.jsxs("div",{className:$("flex min-h-0 flex-1 flex-col",e),children:[n.jsxs("div",{className:"flex shrink-0 items-center gap-1 border-b border-border/40 px-2 py-1.5",children:[n.jsx("input",{ref:R,type:"file",accept:".zip,.md,application/zip,application/x-zip-compressed,text/markdown",className:"hidden",onChange:y=>void S(y)}),n.jsxs("button",{type:"button",className:"inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300",disabled:g,onClick:()=>{var y;return(y=R.current)==null?void 0:y.click()},title:"上传本地 Skill 包",children:[g?n.jsx(V,{className:"size-3.5 animate-spin"}):n.jsx(rn,{className:"size-3.5",stroke:1.75}),g?"安装中…":"安装"]}),n.jsx(en,{text:"上传 ZIP 或 SKILL.md 安装到当前 Agent 工作区。"})]}),n.jsx(Fe,{className:"min-h-0 flex-1 overflow-x-hidden",children:v?n.jsxs("div",{className:"px-3 py-6 text-center text-[11px] text-muted-foreground",children:[n.jsx(V,{className:"mx-auto mb-1.5 size-4 animate-spin text-muted-foreground/50"}),"加载中..."]}):k?n.jsx("div",{className:"flex flex-col items-center gap-1.5 px-3 py-6 text-center",children:n.jsx("p",{className:"text-[11px] text-destructive",children:k})}):l.length===0?n.jsx("p",{className:"px-3 py-6 text-center text-[11px] leading-relaxed text-muted-foreground",children:"暂无 Skill，可点击左上角「安装」上传本地 Skill 包"}):n.jsx("div",{className:"w-full min-w-0 overflow-x-hidden px-1 pb-2 pt-1",children:n.jsx(qn,{grouped:D,ctx:P})})})]})}export{Sn as A,je as C,po as D,rn as I,Nn as P,fo as a,An as b,Se as c,Ce as d,lo as e,uo as f,jn as g,q as i,so as l,ie as s,co as w};
