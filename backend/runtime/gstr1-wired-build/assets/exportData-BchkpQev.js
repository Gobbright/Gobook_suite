function e(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function t(e){return String(e??``).replace(/₹/g,`Rs. `).replace(/[–—]/g,`-`).replace(/[^\x20-\x7E]/g,` `).replace(/\\/g,`\\\\`).replace(/\(/g,`\\(`).replace(/\)/g,`\\)`)}function n(e,t){return typeof t.value==`function`?t.value(e):e[t.key]}function r(e,t,n){let r=new Blob([e],{type:t}),i=URL.createObjectURL(r),a=document.createElement(`a`);a.href=i,a.download=n,document.body.appendChild(a),a.click(),a.remove(),window.setTimeout(()=>URL.revokeObjectURL(i),1e3)}function i(e,t){return`${String(e||`export`).trim().toLowerCase().replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)||`export`}.${t}`}function a(e,t){if(o(e))return 18;let r=t.reduce((t,r)=>Math.max(t,String(n(r,e)??``).length),e.label.length);return Math.min(Math.max(r+3,12),28)}function o(e){return/date|valid till|delivery/i.test(e.label)}function s(e){return/amount|amt|gst|total|value|debit|credit|receipt|payment|balance|quantity|items|hours/i.test(e.label)}function c({title:t,rows:c,columns:l,filename:u}){let d=l.map(e=>`<col style="width:${a(e,c)}ch" />`).join(``),f=l.map(t=>`<th>${e(t.label)}</th>`).join(``),p=c.map(t=>`<tr>${l.map(r=>{let i=s(r)?`right`:`left`,a=o(r)?` date-text`:``;return`<td class="${i===`right`?`num`:`txt`}${a}">${e(n(t,r))}</td>`}).join(``)}</tr>`).join(``),m=c.length===0?`<tr><td colspan="${l.length}" class="txt empty">No records</td></tr>`:``;r(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    th, td { border: 1px solid #9aa7b4; padding: 6px 8px; white-space: nowrap; vertical-align: middle; mso-number-format:"\\@"; }
    th { background: #d9eaf7; color: #111827; font-weight: 700; text-align: center; }
    .title { background: #1f4e78; color: #fff; font-size: 14pt; font-weight: 700; text-align: center; padding: 8px; }
    .txt { text-align: left; }
    .num { text-align: right; }
    .date-text { min-width: 130px; width: 130px; mso-number-format:"\\@"; }
    .empty { text-align: center; color: #64748b; }
  </style>
</head>
<body>
  <table>
    ${d}
    <thead>
      <tr><th class="title" colspan="${l.length}">${e(t)}</th></tr>
      <tr>${f}</tr>
    </thead>
    <tbody>${p||m}</tbody>
  </table>
</body>
</html>`,`application/vnd.ms-excel;charset=utf-8`,i(u||t,`xls`))}function l({title:e,rows:o,columns:c,filename:l}){let u=o.length?o:[{}],d=c.map(e=>Math.min(Math.max(a(e,u),10),30)),f=d.reduce((e,t)=>e+t,0),p=d.map(e=>e/f*794),m=[];for(let e=0;e<u.length;e+=18)m.push(u.slice(e,e+18));let h=[],g=e=>(h.push(e),h.length),_=g(`<< /Type /Catalog /Pages 2 0 R >>`),v=g(``),y=g(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`),b=[];function x(e,n,r,i=7){return`BT /F1 ${i} Tf ${e.toFixed(2)} ${n.toFixed(2)} Td (${t(r)}) Tj ET`}function S(e,t){let n=String(e??``).replace(/\s+/g,` `).trim().replace(/₹/g,`Rs. `),r=Math.max(4,Math.floor(t/(7*.52)));return n.length>r?`${n.slice(0,Math.max(1,r-1))}...`:n}m.forEach((t,r)=>{let i=571,a=[];a.push(`0.12 0.31 0.47 rg`),a.push(`24 ${i-28} 794 28 re f`),a.push(`1 1 1 rg`),a.push(x(32,i-18,r===0?e:`${e} (continued)`,13)),i-=28,a.push(`0.85 0.92 0.97 rg`),a.push(`24 ${i-24} 794 24 re f`),a.push(`0 0 0 RG`),a.push(`0.55 w`);let l=24;c.forEach((e,t)=>{a.push(`${l.toFixed(2)} ${(i-24).toFixed(2)} ${p[t].toFixed(2)} 24 re S`),a.push(`0.06 0.09 0.16 rg`),a.push(x(l+4,i-15,S(e.label,p[t]-8),7)),l+=p[t]}),i-=24,o.length===0?(a.push(`1 1 1 rg`),a.push(`24 ${i-24} 794 24 re f`),a.push(`0 0 0 RG`),a.push(`24 ${i-24} 794 24 re S`),a.push(`0.39 0.45 0.55 rg`),a.push(x(32,i-15,`No records`,8))):t.forEach((e,t)=>{l=24,a.push(t%2==0?`1 1 1 rg`:`0.98 0.99 1 rg`),a.push(`24 ${i-24} 794 24 re f`),c.forEach((t,r)=>{let o=p[r],c=S(n(e,t),o-8),u=s(t)?l+o-Math.min(o-8,c.length*7*.52)-4:l+4;a.push(`0 0 0 RG`),a.push(`${l.toFixed(2)} ${(i-24).toFixed(2)} ${o.toFixed(2)} 24 re S`),a.push(`0.06 0.09 0.16 rg`),a.push(x(u,i-8-7,c,7)),l+=o}),i-=24}),a.push(`0.39 0.45 0.55 rg`),a.push(x(24,14,`Page ${r+1} of ${m.length}`,7));let u=a.join(`
`),d=g(`<< /Type /Page /Parent ${v} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${y} 0 R >> >> /Contents ${g(`<< /Length ${u.length} >>\nstream\n${u}\nendstream`)} 0 R >>`);b.push(d)}),h[v-1]=`<< /Type /Pages /Kids [${b.map(e=>`${e} 0 R`).join(` `)}] /Count ${b.length} >>`;let C=`%PDF-1.4
`,w=[0];h.forEach((e,t)=>{w.push(C.length),C+=`${t+1} 0 obj\n${e}\nendobj\n`});let T=C.length;C+=`xref\n0 ${h.length+1}\n0000000000 65535 f \n`,w.slice(1).forEach(e=>{C+=`${String(e).padStart(10,`0`)} 00000 n \n`}),C+=`trailer\n<< /Size ${h.length+1} /Root ${_} 0 R >>\nstartxref\n${T}\n%%EOF`,r(C,`application/pdf`,i(l||e,`pdf`))}export{l as n,c as t};