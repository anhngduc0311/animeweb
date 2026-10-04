const fs = require('fs');
const file = 'apps/web/index.html';
let html = fs.readFileSync(file, 'utf8');
const discover = html.match(/    <!-- Trending Anime Section -->[\s\S]*?<\/section>/)[0];
const recent = html.match(/    <!-- Recently Updated Section -->[\s\S]*?<\/section>/)[0];
const trending = discover.replace('Khám phá anime', 'Thịnh hành').replace('Tuyển chọn từ danh sách cập nhật KKPhim', 'Các anime nổi bật trong danh sách hiện tại');
const updated = recent.replace('Các tập phim mới ra lò', 'Anime và các tập phim vừa được cập nhật');
html = html.replace(discover, '__ANIDOKI_RECENT_SECTION__').replace(recent, trending).replace('__ANIDOKI_RECENT_SECTION__', updated);
fs.writeFileSync(file, html);
