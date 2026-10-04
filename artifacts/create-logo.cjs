const fs = require('fs');
const sharp = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
// All lettering is outlined geometry. The panel uses actual transparent counters,
// without masks, clipping layers, fonts, or external references.
const ani = [
'M181.14 68.1h51.01v221.77h-51.01Z',
'M110.89 68.1a110.89 110.89 0 1 0 0 221.78a110.89 110.89 0 1 0 0-221.78Z M110.89 112.11a66.88 66.88 0 1 1 0 133.76a66.88 66.88 0 1 1 0-133.76Z',
'M283.04 166.12v124.19h51.32V168.02c0-42.14 18.38-59.56 49.42-59.56s49.42 17.43 49.42 59.56v122.29h50.69V166.12c0-65.27-37.38-101.38-100.43-101.38s-100.43 36.12-100.43 101.38Z',
'M529.09 68.1h51.01v221.77h-51.01Z'
];
const panel = 'M706.95 0H1553.35a62.65 62.65 0 0 1 62.65 62.65V294.93a62.65 62.65 0 0 1-62.65 62.65H706.95a62.65 62.65 0 0 1-62.65-62.65V62.65A62.65 62.65 0 0 1 706.95 0Z';
const d = 'M715 68.1H801C873 68.1 916 110 916 178.99S873 289.87 801 289.87H715Z M766.01 112.11V245.86H800C843 245.86 864.99 222 864.99 178.99S843 112.11 800 112.11Z';
// Slight optical overshoot keeps the round O visually level with the flat letters.
const o = 'M1074 65.1a111 113.89 0 1 0 0 227.78a111 113.89 0 1 0 0-227.78Z M1074 110.1a63 68.89 0 1 1 0 137.78a63 68.89 0 1 1 0-137.78Z';
const k = 'M1240 68.1H1291.01V155.8H1309L1383 68.1H1441L1350 176L1444 289.87H1384L1310 200H1291.01V289.87H1240Z';
const i = 'M1495 68.1H1546.01V289.87H1495Z';
// Original brush contours, excluding the source panel and its R counter.
const source = fs.readFileSync('anikuro_original.svg', 'utf8');
const elements = [...source.matchAll(/<(?:path|rect)[^>]*\/>/g)].map(m => m[0].replace(/ class="cls-1"/g, ''));
const { parts, boxes } = JSON.parse(fs.readFileSync('artifacts/brush-parts.json', 'utf8'));
const bounds = JSON.parse(fs.readFileSync('artifacts/brush-elements.json', 'utf8'));
const contour = boxes.filter(b => b.x > 1455).map(b => parts[b.i]).join('');
const details = bounds.filter(b => b.i < 380 && b.x > 1455).map(b => elements[b.i]).join('');
function logo(color) {
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1616 357.58" role="img" aria-labelledby="title"><title id="title">anidoki</title>
<style>.brush-motion{transform-origin:1586.58px 182.11px;animation:brush-turn 24s linear infinite}@keyframes brush-turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.brush-motion{animation:none}}</style>
<defs><mask id="letter-cutouts" maskUnits="userSpaceOnUse" x="644.3" y="0" width="971.7" height="357.58" style="mask-type:luminance">
<rect x="644.3" width="971.7" height="357.58" fill="white"/>
<path fill="black" fill-rule="evenodd" d="${d} ${k} ${i}"/>
<g transform="translate(-505 0)"><g class="brush-motion"><path fill="black" d="${contour}"/><g fill="white">${details}</g></g></g>
</mask></defs>
<g fill="${color}">${elements.slice(380).join('')}<path d="${panel}" mask="url(#letter-cutouts)"/></g></svg>\n`;
}
(async()=>{
 for(const [theme,color] of [['Black','#000000'],['White','#ffffff']]) {
 const svg=logo(color);
 fs.writeFileSync(`artifacts/Anidoki_Logo${theme}.svg`,svg);
 fs.writeFileSync(`apps/web/public/brand/anidoki-${theme.toLowerCase()}.svg`,svg);
 await sharp(Buffer.from(svg)).resize(1616).png().toFile(`artifacts/Anidoki_Logo${theme}.png`);
 }
 await sharp(Buffer.from(logo('#ffffff'))).resize(1000).extend({top:65,bottom:65,left:65,right:65,background:'#0c0c0e'}).flatten({background:'#0c0c0e'}).png().toFile('artifacts/anidoki-refined.png');
})();
