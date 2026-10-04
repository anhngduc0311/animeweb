const fs = require('fs');
let script=fs.readFileSync('artifacts/create-logo.cjs','utf8');
script=script.replace("const brush = elements.slice(0,380).join('\\n');", `// Extract only the O contours; avoid a rectangular clipping layer entirely.
const { parts, boxes } = JSON.parse(fs.readFileSync('artifacts/brush-parts.json', 'utf8'));
const oContours = boxes.filter(box => box.x > 1455).map(box => parts[box.i]).join('');
const brushDetails = elements.slice(0,380).filter((_, i) => i !== 251).join('\\n');`);
script=script.replace('<clipPath id="brush-crop"><rect x="1455" y="40" width="285" height="280"/></clipPath>\n','');
script=script.replace(/<g transform="translate\(-505 0\)" clip-path="url\(#brush-crop\)">[\s\S]*?\n<\/g>\n<!-- K/, `<g transform="translate(-505 0)">
<path fill="black" d="\${oContours}"/>
<g fill="white">\${brushDetails}</g>
</g>
<!-- K`);
fs.writeFileSync('artifacts/create-logo.cjs',script);
