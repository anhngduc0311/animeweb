const fs = require('fs');
fs.mkdirSync('apps/web/public/brand', { recursive: true });
for (const theme of ['White', 'Black']) fs.copyFileSync(`artifacts/Anidoki_Logo${theme}.svg`, `apps/web/public/brand/anidoki-${theme.toLowerCase()}.svg`);
const logo = '<img class="brand-logo" src="/brand/anidoki-white.svg" alt="anidoki" width="1680" height="358">';
let html = fs.readFileSync('apps/web/index.html', 'utf8').replaceAll('Linime', 'anidoki').replaceAll('linime', 'anidoki');
html = html.replace(/<div class="brand-icon">L<\/div>\s*<span class="brand-text">anidoki<\/span>(?:\s*<span class="brand-badge">ANIME<\/span>)?/g, logo);
html = html.replace('class="brand" id="brand-link"', 'class="brand" id="brand-link" aria-label="anidoki — Trang chủ"');
html = html.replace('<h2>Truy cập anidoki</h2>', logo.replace('class="brand-logo"', 'class="brand-logo login-logo"') + '\n      <h2>Chào mừng đến anidoki</h2>');
html = html.replace('<meta property="og:image" content="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx195516-MJpUZlOberqH.jpg">', '<meta name="theme-color" content="#0c0c0e">');
fs.writeFileSync('apps/web/index.html', html);
let css = fs.readFileSync('apps/web/src/refinement.css', 'utf8');
const colors = {'#090e15':'#0c0c0e','#111923':'#161618','#17212d':'#202023','#9ba9b9':'#aaa9af','#9aefce':'#f2f0e9','#10221c':'#171719','#b7f7df':'#ffffff','#788b9c':'#89888e','#dce6ef':'#eeedf0','#c3cbd6':'#cfced3','#aab7c7':'#b6b4bd','#f2f5f8':'#f2f0e9','#c5d0dd':'#d0ced5','#8393a6':'#9e9ca6','#b7c6d5':'#c5c2cd','#8494a6':'#9e9ba6','#f2f7fa':'#f5f3ee','#15232b':'#232326','#080c12':'#080809','#8190a1':'#a19ea8','#65778b':'#8d8996','#172731':'#242427','#e0f8ee':'#f2f0e9'};
for (const [from,to] of Object.entries(colors)) css = css.replaceAll(from,to);
css = css.replaceAll('--accent-mint', '--accent-brand');
css = css.replace(/^\.brand(?:-icon|-text|-badge)? \{.*\}\r?\n/gm, '');
css = css.replace(/^\s*\.brand(?:-icon|-text) \{.*\}\r?\n/gm, '');
css = css.replace('.brand-badge, .btn-login svg', '.btn-login svg');
css = css.replace('.section-title { font-family: var(--font-body); font-size: 22px; font-weight: 650;', '.section-title { font-family: var(--font-display); font-size: 24px; font-weight: 700;');
css = css.replace('.discovery-bar { display:', '.discovery-bar { display:');
css += `
/* Anidoki: monochrome surfaces and geometric shapes echo the wordmark. */
.brand { display: inline-flex; flex-shrink: 0; }
.brand-logo { display: block; width: 174px; height: auto; }
.brand:hover { opacity: .82; }
.site-header { backdrop-filter: blur(20px); }
.btn-primary, .btn-secondary, .btn-login, .search-trigger { border-radius: 12px; }
.btn-primary { font-weight: 700; }
.spotlight-eyebrow { color: var(--accent-brand); }
.spotlight-eyebrow span { box-shadow: none; }
.discovery-bar { border-radius: 20px; background: linear-gradient(115deg, #202023, #141416); }
.discovery-heading > span { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -.03em; }
.discovery-links a { border-radius: 12px; background: #ffffff04; }
.anime-card-poster { border-radius: 14px; }
.section-link:hover { color: #fff; }
.section-title-group { gap: 7px; }
.login-logo { width: 210px; margin: 0 auto 28px; }
.login-card h2 { font-family: var(--font-display); }
.site-footer .brand-logo { width: 210px; }
@media (max-width: 1250px) { .brand-logo { width: 158px; } }
@media (max-width: 768px) {
  .brand-logo { width: 145px; }
  .discovery-heading > span { font-size: 18px; }
}
@media (max-width: 480px) {
  .brand-logo { width: 124px; }
  .header-actions { gap: 4px; }
  .btn-login { padding-inline: 8px; }
  .login-logo { width: 190px; }
}
@media (max-width: 360px) {
  .header-inner.container { padding-inline: 12px; }
  .brand-logo { width: 108px; }
  .header-actions { gap: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;
fs.writeFileSync('apps/web/src/refinement.css', css);
fs.writeFileSync('apps/web/public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f2f0e9"/><path fill="#0c0c0e" fill-rule="evenodd" d="M17 12h13c16 0 24 8 24 20s-8 20-24 20H17zm10 9v22h4c9 0 13-4 13-11s-4-11-13-11z"/></svg>\n');
