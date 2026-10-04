# Animeweb — Turborepo Monorepo

Dự án anime web được tổ chức dưới dạng Monorepo sử dụng **Turborepo** và **npm workspaces**.

## Cấu trúc thư mục (Monorepo Layout)

```
animeweb/
├── apps/
│   ├── web/               # Frontend (Vite + Vanilla JS + CSS)
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── package.json
│   │
│   └── server/            # Backend (Node.js Express API + KKPhim + PostgreSQL)
│       ├── db/
│       ├── server.js
│       ├── kkphim.js
│       ├── *.test.js
│       └── package.json
│
├── .env                   # Biến môi trường chung (PostgreSQL, Port, ...)
├── turbo.json             # Cấu hình Turborepo pipeline
└── package.json           # Root package.json & workspaces config
```

---

## Hướng dẫn cài đặt & Chạy dự án

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Chạy môi trường phát triển (Dev)
- Chạy toàn bộ hệ thống (cả Web frontend và Server API song song qua Turborepo):
  ```bash
  npm run dev
  # hoặc
  npx turbo dev
  ```
- Chỉ chạy Web Frontend:
  ```bash
  npm run dev:web
  ```
- Chỉ chạy Backend Server:
  ```bash
  npm run dev:server
  ```

### 3. Build & Test
- Build toàn bộ dự án (có caching siêu tốc với Turborepo):
  ```bash
  npm run build
  ```
- Chạy bộ kiểm thử (Tests):
  ```bash
  npm run test
  ```

---

## Chi tiết kỹ thuật & Tính năng

- **Frontend (`apps/web`)**: Chạy tại `http://localhost:5173`, tích hợp proxy tự động `/api` sang backend `http://localhost:3000`.
- **Backend API (`apps/server`)**: Cung cấp dữ liệu anime qua KKPhim API (`https://phimapi.com`), quản lý watchlist và watch history bằng PostgreSQL.
- **Turborepo Pipelines (`turbo.json`)**: Tối ưu hóa build cache, song song hóa dev/build/test pipelines.


sudo apt update && sudo apt install -y git && sudo apt install nano -y