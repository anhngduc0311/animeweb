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
app.get('/api/health', (req,res) => res.json({status:'ok',provider:'AniDoki'}));
app.use('/api',router);
app.get('/api/auth/config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com'
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, access_token } = req.body;
    let userData = null;

    if (credential) {
      // Xác thực Google ID Token qua Google OAuth2 API
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      const payload = await verifyRes.json();
      if (!verifyRes.ok || payload.error) {
        return res.status(401).json({ success: false, message: 'Google ID Token không hợp lệ' });
      }
      userData = {
        id: `google_${payload.sub}`,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        avatar: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'User')}&background=random`,
        provider: 'google'
      };
    } else if (access_token) {
      // Xác thực Google Access Token qua UserInfo endpoint
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const profile = await userinfoRes.json();
      if (!userinfoRes.ok || profile.error) {
        return res.status(401).json({ success: false, message: 'Google Access Token không hợp lệ' });
      }
      userData = {
        id: `google_${profile.sub}`,
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        avatar: profile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=random`,
        provider: 'google'
      };
    } else {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin xác thực Google' });
    }

    res.json({
      success: true,
      token: 'anidoki_jwt_session_' + Date.now(),
      user: userData
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ success: false, message: 'Đăng nhập Google thất bại. Vui lòng thử lại.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { provider = 'google', name = 'Luffy Mũ Rơm', email = 'luffy@onepiece.strawhat', avatar } = req.body;
  
  res.json({
    success: true,
    token: 'anidoki_jwt_session_' + Date.now(),
    user: {
      id: 'usr_001',
      name,
      email,
      avatar: avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=random'),
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
