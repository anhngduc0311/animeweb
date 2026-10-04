const fs = require('fs');
let script = fs.readFileSync('artifacts/create-logo.cjs', 'utf8');
const begin = script.indexOf('function logo(color)');
const end = script.indexOf('(async()=>', begin);
script = script.slice(0, begin) + `// Original brush contours, excluding the source panel and its R counter.
const source = fs.readFileSync('anikuro_original.svg', 'utf8');
const elements = [...source.matchAll(/<(?:path|rect)[^>]*\\/>/g)].map(m => m[0].replace(/ class="cls-1"/g, ''));
const { parts, boxes } = JSON.parse(fs.readFileSync('artifacts/brush-parts.json', 'utf8'));
const bounds = JSON.parse(fs.readFileSync('artifacts/brush-elements.json', 'utf8'));
const contour = boxes.filter(b => b.x > 1455).map(b => parts[b.i]).join('');
const details = bounds.filter(b => b.i < 380 && b.x > 1455).map(b => elements[b.i]).join('');
function logo(color) {
 return \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1616 357.58" role="img" aria-labelledby="title"><title id="title">anidoki</title>
<style>.brush-motion{transform-origin:1586.58px 182.11px;animation:brush-turn 24s linear infinite}@keyframes brush-turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.brush-motion{animation:none}}</style>
<defs><mask id="letter-cutouts" maskUnits="userSpaceOnUse" x="644.3" y="0" width="971.7" height="357.58" style="mask-type:luminance">
<rect x="644.3" width="971.7" height="357.58" fill="white"/>
<path fill="black" fill-rule="evenodd" d="\${d} \${k} \${i}"/>
<g transform="translate(-505 0)"><g class="brush-motion"><path fill="black" d="\${contour}"/><g fill="white">\${details}</g></g></g>
</mask></defs>
<g fill="\${color}">\${elements.slice(380).join('')}<path d="\${panel}" mask="url(#letter-cutouts)"/></g></svg>\\n\`;
}
` + script.slice(end);
fs.writeFileSync('artifacts/create-logo.cjs', script);
let html = fs.readFileSync('apps/web/index.html', 'utf8').replaceAll('anidoki-white.svg?v=5', 'anidoki-white.svg?v=6');
fs.writeFileSync('apps/web/index.html', html);
