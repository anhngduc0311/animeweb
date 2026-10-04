import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { router, initKKUserData } from './kkphim.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
await initKKUserData();
app.get('/api/health', (req,res) => res.json({status:'ok',provider:'KKPhim'}));
app.use('/api',router);
app.post('/api/auth/login', (req, res) => {
  const { provider = 'google', name = 'Luffy Mũ Rơm', email = 'luffy@onepiece.strawhat' } = req.body;
  
  res.json({
    success: true,
    token: 'linime_jwt_session_' + Date.now(),
    user: {
      id: 'usr_001',
      name,
      email,
      avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=random',
      provider
    }
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    user: {
      id: 'usr_001',
      name: 'Luffy Mũ Rơm',
      email: 'luffy@onepiece.strawhat',
      avatar: 'https://ui-avatars.com/api/?name=Luffy+Mu+Rom&background=random'
    }
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Linime API Server is running on http://localhost:${PORT}`);
  console.log(`🐘 Connected to PostgreSQL (Docker container on port ${process.env.PGPORT || 5438})`);
});
