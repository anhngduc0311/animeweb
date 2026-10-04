const fs=require('fs');
const file='artifacts/create-logo.cjs';let script=fs.readFileSync(file,'utf8');
script=script.replace('<title id="title">anidoki</title>', `<title id="title">anidoki</title><style>
.o-orbit { animation: orbit 8s linear infinite; transform-origin: 0px 0px; }
@keyframes orbit { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .o-orbit { animation: none; display: none; } }
</style>`);
script=script.replace('</g></svg>', `</g><g transform="translate(1074 178.99)" fill="none" stroke="\${color}" stroke-linecap="round" aria-hidden="true"><g class="o-orbit"><circle r="87" stroke-width="12" stroke-dasharray="78 469" opacity=".14"/><circle r="87" stroke-width="7" stroke-dasharray="52 495" opacity=".65"/><circle r="87" stroke-width="7" stroke-dasharray="3 544" opacity=".95"/></g></g></svg>`);
fs.writeFileSync(file,script);
let html=fs.readFileSync('apps/web/index.html','utf8').replaceAll('anidoki-white.svg?v=4','anidoki-white.svg?v=5');fs.writeFileSync('apps/web/index.html',html);
