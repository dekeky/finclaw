import{c as d,ah as m,a as n}from"./index-BVnra-cu.js";import{j as i}from"./radix-D7VsYw7I.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",key:"svg-0"}],["path",{d:"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",key:"svg-1"}]],g=d("outline","refresh","Refresh",x);function f(t){const e=t.trim().charAt(0);return e?e.toUpperCase():"?"}const l={sm:"h-8 w-8 text-[11px] rounded-lg",md:"h-9 w-9 text-xs rounded-xl",lg:"h-11 w-11 text-sm rounded-xl",xl:"h-14 w-14 text-base rounded-2xl"};function p({name:t,hasAvatar:e=!1,avatarRevision:c=0,size:s="md",className:r,title:h}){const o=h??t,a=e?m(t,c):null;return a?i.jsx("img",{src:a,alt:o,title:o,className:n("shrink-0 object-cover shadow-sm shadow-violet-500/20",l[s],r)}):i.jsx("div",{className:n("flex shrink-0 items-center justify-center bg-gradient-to-br from-violet-500 to-violet-600 font-semibold text-white shadow-sm shadow-violet-500/25",l[s],r),title:o,"aria-label":o,role:"img",children:f(t)})}export{p as A,g as I};
