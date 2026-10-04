import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { app } from './app.js';
import { initKKUserData } from './kkphim.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.PORT || 3000;

// Khởi tạo migrations & dữ liệu
await initKKUserData();

// Khởi chạy server khi chạy trực tiếp
const isDirectRun = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  process.argv[1].endsWith('server.js')
);

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`🚀 Linime API Server is running on http://localhost:${PORT}`);
    console.log(`🐘 Connected to PostgreSQL (Docker container on port ${process.env.PGPORT || 5438})`);
  });
}

export { app };
