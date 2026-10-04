const fs = require('fs');
const sharp = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const original = fs.readFileSync('anikuro_original.svg', 'utf8');
const elements = [...original.matchAll(/<(?:path|rect)[^>]*\/>/g)].map(m => m[0].replace(/ class="cls-1"/g, ''));
const ani = elements.slice(380).join('\n');
// Extract only the O contours; avoid a rectangular clipping layer entirely.
const { parts, boxes } = JSON.parse(fs.readFileSync('artifacts/brush-parts.json', 'utf8'));
const oContours = boxes.filter(box => box.x > 1455).map(box => parts[box.i]).join('');
const elementBounds = JSON.parse(fs.readFileSync('artifacts/brush-elements.json', 'utf8'));
const brushDetails = elementBounds.filter(box => box.i < 380 && box.x > 1455).map(box => elements[box.i]).join('\n');
function logo(color) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 357.58" role="img" aria-labelledby="title">
<title id="title">anidoki</title>
<defs>
<mask id="letters" maskUnits="userSpaceOnUse" x="644.3" y="0" width="1035.7" height="357.58" style="mask-type:luminance">
<rect x="644.3" width="1035.7" height="357.58" fill="white"/>
<!-- D: geometric outline, matching the original stroke weight. -->
<path fill="black" fill-rule="evenodd" d="M715 68.1H801C873 68.1 916 110 916 178.99S873 289.87 801 289.87H715ZM766.01 112.11V245.86H800C843 245.86 864.99 222 864.99 178.99S843 112.11 800 112.11Z"/>
<!-- Preserve the original brushwork in the O. -->
<g transform="translate(-505 0)">
<path fill="black" d="${oContours}"/>
<g fill="white">${brushDetails}</g>
</g>
<!-- K and I are outlined vectors, with no font dependency. -->
<path fill="black" d="M1265 68.1H1316.01V155.8H1334L1408 68.1H1466L1375 176L1469 289.87H1409L1335 200H1316.01V289.87H1265Z"/>
<path fill="black" d="M1520 68.1H1571.01V289.87H1520Z"/>
</mask>
</defs>
<g fill="${color}">${ani}</g>
<rect x="644.3" width="1035.7" height="357.58" rx="62.65" fill="${color}" mask="url(#letters)"/>
</svg>\n`; }
(async()=> {
for(const [name,color] of [['Black','#000000'],['White','#ffffff']]) {
const svg = logo(color);
fs.writeFileSync(`artifacts/Anidoki_Logo${name}.svg`,svg);
await sharp(Buffer.from(svg)).resize(1680).png().toFile(`artifacts/Anidoki_Logo${name}.png`);
}
await sharp('artifacts/Anidoki_LogoBlack.svg').resize(1260).flatten({background:'#ffffff'}).png().toFile('artifacts/anidoki-preview.png');
})();



