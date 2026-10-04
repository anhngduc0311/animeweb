import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { router, initKKUserData } from './kkphim.js';
import { adminRouter } from './adminRoutes.js';
import { pool } from './db/db.js';
import {
  verifyGoogleCredential,
  verifyGoogleAccessToken,
  upsertUser,
  createSession,
  revokeSession,
  requireAuth,
  optionalAuth,
  requireAdmin,
  extractBearerToken,
  getUserSessions,
  revokeOtherSessions,
  updateUserProfile
} from './authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Khởi tạo migrations & dữ liệu
await initKKUserData();

// Sliding-window Rate limiter cho phản hồi góp ý (max 5/phút per IP/User)
const feedbackRateMap = new Map();
function checkFeedbackRateLimit(identifier) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const history = feedbackRateMap.get(identifier) || [];
  const valid = history.filter(t => now - t < windowMs);
  if (valid.length >= 5) {
    return false;
  }
  valid.push(now);
  feedbackRateMap.set(identifier, valid);
  return true;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', provider: 'AniDoki' }));

// Gắn router phim và dữ liệu người dùng (watchlist, history)
app.use('/api', router);

// Gắn router quản trị hệ thống được bảo vệ bằng quyền Admin (Giai đoạn 3 & 4)
app.use('/api/admin', requireAdmin, adminRouter);

// Cấu hình Google Client ID cho client
app.get('/api/auth/config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com'
  });
});

// Xác thực đăng nhập Google thật & tạo phiên làm việc
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, access_token } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    let profile = null;

    if (credential) {
      profile = await verifyGoogleCredential(credential, clientId);
    } else if (access_token) {
      profile = await verifyGoogleAccessToken(access_token, clientId);
    } else {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin xác thực Google (credential hoặc access_token)' });
    }

    // Lưu hoặc cập nhật tài khoản Google vào cơ sở dữ liệu
    const user = await upsertUser({
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      provider: 'google'
    });

    // Chặn người dùng nếu bị cấm (Banned)
    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BANNED',
        message: `Tài khoản của bạn đã bị khóa.${user.ban_reason ? ' Lý do: ' + user.ban_reason : ''}`
      });
    }

    // Tạo phiên xác thực có thể kiểm chứng, lưu vào DB và có hạn dùng
    const session = await createSession(user.id, 7, {
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress
    });

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user
    });
  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(401).json({
      success: false,
      message: err.message || 'Đăng nhập Google thất bại. Vui lòng thử lại.'
    });
  }
});

// Lấy thông tin người dùng hiện tại từ phiên đăng nhập
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Đăng xuất và vô hiệu hóa phiên làm việc trên server
app.post('/api/auth/logout', async (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    await revokeSession(token);
  }
  res.json({
    success: true,
    message: 'Đăng xuất thành công'
  });
});

// ==========================================
// TÀI KHOẢN & TÙY CHỌN NGƯỜI DÙNG (/api/account - Phase 4)
// ==========================================
app.get('/api/account/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

app.put('/api/account/profile', requireAuth, async (req, res) => {
  try {
    const { name, avatar, player_settings } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
      return res.status(400).json({ success: false, message: 'Tên hiển thị không hợp lệ (tối đa 100 ký tự).' });
    }

    if (avatar !== undefined && avatar !== null && typeof avatar === 'string' && avatar.trim() !== '') {
      if (!avatar.startsWith('http://') && !avatar.startsWith('https://')) {
        return res.status(400).json({ success: false, message: 'URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://' });
      }
    }

    const updated = await updateUserProfile(req.user.id, {
      name: name !== undefined ? name.trim() : undefined,
      avatar: avatar !== undefined ? (avatar ? avatar.trim() : null) : undefined,
      player_settings: player_settings !== undefined ? player_settings : undefined
    });

    res.json({
      success: true,
      message: 'Cập nhật thông tin tài khoản thành công',
      user: updated
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật hồ sơ người dùng' });
  }
});

app.get('/api/account/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.id, req.token);
    res.json({
      success: true,
      sessions
    });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách phiên đăng nhập' });
  }
});

app.post('/api/account/sessions/revoke-others', requireAuth, async (req, res) => {
  try {
    const result = await revokeOtherSessions(req.user.id, req.token);
    res.json({
      success: true,
      message: `Đã đăng xuất thành công khỏi ${result.revokedCount} thiết bị khác.`,
      revokedCount: result.revokedCount
    });
  } catch (err) {
    console.error('Revoke sessions error:', err);
    res.status(500).json({ success: false, message: 'Lỗi thu hồi phiên đăng nhập' });
  }
});

// ==========================================
// TRỢ GIÚP & GÓP Ý PHẢN HỒI (/api/feedback - Phase 4)
// ==========================================
app.post('/api/feedback', optionalAuth, async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const rateLimitKey = req.user?.id || ip || 'anonymous';

  if (!checkFeedbackRateLimit(rateLimitKey)) {
    return res.status(429).json({
      success: false,
      message: 'Bạn gửi phản hồi quá nhanh. Vui lòng thử lại sau 1 phút.'
    });
  }

  const { name, email, subject, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống' });
  }

  const feedbackName = (name && name.trim()) || req.user?.name || 'Khách truy cập';
  const feedbackEmail = (email && email.trim()) || req.user?.email || null;
  const feedbackSubject = (subject && subject.trim()) || 'Góp ý chung';
  const userId = req.user?.id || null;

  try {
    const result = await pool.query(`
      INSERT INTO feedback (user_id, name, email, subject, message, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
      RETURNING id, created_at
    `, [userId, feedbackName, feedbackEmail, feedbackSubject, message.trim()]);

    res.json({
      success: true,
      message: 'Cảm ơn bạn đã đóng góp ý kiến! Ban quản trị sẽ xem xét sớm nhất.',
      feedbackId: result.rows[0].id
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi gửi phản hồi, vui lòng thử lại sau.' });
  }
});

// ==========================================
// CẤU HÌNH TRANG CHỦ & HỆ THỐNG CÔNG KHAI (Phase 4)
// ==========================================
app.get('/api/homepage/config', async (req, res) => {
  try {
    const r = await pool.query('SELECT spotlight_slugs, sections_config FROM homepage_config WHERE id = $1', ['default']);
    if (r.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          spotlight_slugs: r.rows[0].spotlight_slugs || [],
          sections_config: r.rows[0].sections_config || []
        }
      });
    }
    res.json({
      success: true,
      data: {
        spotlight_slugs: [],
        sections_config: []
      }
    });
  } catch (err) {
    console.error('Get homepage config error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải cấu hình trang chủ' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settingsRes = await pool.query('SELECT key, value FROM system_settings');
    const settings = {
      site_name: 'Linime',
      site_logo: '',
      contact_email: 'support@linime.org',
      site_announcement: '',
      maintenance_mode: false
    };
    settingsRes.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json({
      success: true,
      settings
    });
  } catch (err) {
    console.error('Get public settings error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải cài đặt hệ thống' });
  }
});



// Cấu hình phục vụ frontend SPA và các trang con (Direct URLs, Refresh)
import fs from 'fs';
const webDistPath = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Khởi chạy server khi chạy trực tiếp
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`🚀 Linime API Server is running on http://localhost:${PORT}`);
    console.log(`🐘 Connected to PostgreSQL (Docker container on port ${process.env.PGPORT || 5438})`);
  });
}

