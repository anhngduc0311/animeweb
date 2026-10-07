# Tối ưu tải trang AniDoki — 07/10/2026

Ảnh PageSpeed trước khi sửa: mobile 63 điểm, LCP 31,7 giây; desktop 79 điểm, LCP 3,2 giây.

## Thay đổi

- Giữ màn hình loading có logo khi mở trang theo yêu cầu. Trang chủ chỉ chờ tâm điểm và tài nguyên đầu màn hình (tối đa 1,5 giây cho tài nguyên), không chờ các danh mục phía dưới. Có giới hạn 6 giây để tránh kẹt loading khi mạng/API hoặc bundle lỗi.
- Gọi API tâm điểm ngay từ head và preload banner đầu tiên khi nhận dữ liệu; banner có `fetchpriority="high"`.
- API tâm điểm chỉ trả thông tin hiển thị, bỏ danh sách tập phim, stream, season lồng nhau và ghi chú quản trị. API chi tiết/phát phim giữ dữ liệu đầy đủ.
- Banner đứng yên mặc định. Người dùng có thể chọn phim hoặc bật tự chuyển, với chu kỳ 8 giây. Carousel chỉ chạy khi trang chủ đang mở.
- Giữ chỗ cho tên/logo và mô tả để giảm xê dịch; giữ heading H1 cho trình đọc màn hình khi hiển thị logo.
- Render từng danh mục ngay khi API tương ứng trả về. Ảnh thể loại tải lazy; danh mục phim lẻ bắt đầu tải khi cuộn gần tới.
- HTML và startup script được yêu cầu revalidate ở Nginx; bundle có hash vẫn cache dài hạn.

## Kiểm chứng

Mẫu JSON tâm điểm lấy từ `https://anidoki.com/api/anime/spotlight` ngày 07/10/2026 có 317.464 byte trước khi lọc và 11.845 byte sau khi lọc (giảm 96,3%, tính trên JSON chưa gzip). Đây là đo kích thước dữ liệu, không phải đo LCP mới.

Build production thành công. Kiểm thử API frontend, router và phép lọc tâm điểm đạt. Kiểm tra trình duyệt ở desktop và mobile 390 × 844: trang chủ, banner, chọn slide, bật/tắt tự chuyển; không ghi nhận lỗi JavaScript. Bản preview dùng API danh mục công khai trên website qua proxy local và áp dụng phép lọc mới; chưa kiểm tra triển khai backend/Nginx trên VPS.

```sh
npm run build --workspace web
npm test --workspace web
node --test apps/server/spotlight.test.js
```

## Đưa lên VPS

Sau khi cập nhật mã mới trên VPS, build lại cả frontend và backend vì endpoint tâm điểm đã thay đổi:

```sh
docker compose up -d --build web server
```

Giữ nguyên `WEB_ASSET_BASE` của môi trường đang chạy. Kiểm tra trang chủ, chi tiết, phát phim và API tâm điểm, sau đó chạy lại PageSpeed Insights cho mobile và desktop. Chưa có điểm PageSpeed mới trên production; thời gian thực tế còn phụ thuộc VPS, nguồn API và mạng tải ảnh bên ngoài.
