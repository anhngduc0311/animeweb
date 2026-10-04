import crypto from 'node:crypto';
import { pool } from './db/db.js';

export function getAdminEmails() {
  const envAdmin = process.env.ADMIN_EMAILS || '';
  return envAdmin
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAdmin(email) {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.toLowerCase());
}

export async function verifyGoogleCredential(credential, expectedClientId) {
  if (!credential) {
    throw new Error('Thiếu thông tin Google ID Token (credential)');
  }
  const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const payload = await verifyRes.json();
  if (!verifyRes.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || 'Google ID Token không hợp lệ');
  }

  if (expectedClientId && payload.aud !== expectedClientId) {
    throw new Error('Google ID Token không dành cho ứng dụng này (mã ứng dụng không khớp)');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || (payload.email ? payload.email.split('@')[0] : 'Người dùng Google'),
    picture: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'User')}&background=random`
  };
}

export async function verifyGoogleAccessToken(accessToken, expectedClientId) {
  if (!accessToken) {
    throw new Error('Thiếu thông tin Google Access Token');
  }

  // 1. Kiểm tra tokeninfo để xác thực audience / app
  const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  const tokenInfo = await tokenInfoRes.json();
  if (!tokenInfoRes.ok || tokenInfo.error) {
    throw new Error(tokenInfo.error_description || tokenInfo.error || 'Google Access Token không hợp lệ hoặc đã hết hạn');
  }

  if (expectedClientId && tokenInfo.aud && tokenInfo.aud !== expectedClientId) {
    throw new Error('Google Access Token không thuộc ứng dụng này');
  }

  // 2. Lấy thông tin userinfo
  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await userinfoRes.json();
  if (!userinfoRes.ok || profile.error) {
    throw new Error(profile.error_description || profile.error || 'Không tải được hồ sơ tài khoản Google');
  }

  return {
    sub: profile.sub || tokenInfo.sub,
    email: profile.email || tokenInfo.email,
    name: profile.name || (profile.email ? profile.email.split('@')[0] : 'Người dùng Google'),
    picture: profile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=random`
  };
}

export async function upsertUser({ sub, email, name, picture, provider = 'google' }) {
  const userId = `google_${sub}`;
  const isAdmin = isEmailAdmin(email);

  // Tìm tài khoản theo ID hoặc email
  const existingRes = await pool.query(
    'SELECT * FROM users WHERE id = $1 OR (email IS NOT NULL AND email = $2)',
    [userId, email]
  );

  let user = null;
  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const targetRole = isAdmin ? 'admin' : (existing.role || 'user');
    const updateRes = await pool.query(`
      UPDATE users
      SET name = $1, avatar = $2, email = $3, role = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
    `, [name, picture, email, targetRole, existing.id]);
    user = updateRes.rows[0];
  } else {
    const initialRole = isAdmin ? 'admin' : 'user';
    const insertRes = await pool.query(`
      INSERT INTO users (id, name, email, avatar, provider, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
    `, [userId, name, email, picture, provider, initialRole]);
    user = insertRes.rows[0];
  }

  if (user && typeof user.player_settings === 'string') {
    try {
      user.player_settings = JSON.parse(user.player_settings);
    } catch {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  } else if (user && !user.player_settings) {
    user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
  }

  return user;
}

export async function createSession(userId, durationDays = 7, metadata = {}) {
  const token = 'anidoki_sess_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const userAgent = metadata.userAgent || null;
  const ipAddress = metadata.ip || null;

  await pool.query(
    'INSERT INTO user_sessions (token, user_id, expires_at, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [token, userId, expiresAt, userAgent, ipAddress]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

export async function getUserByToken(token) {
  if (!token || typeof token !== 'string') return null;

  const res = await pool.query(`
    SELECT 
      u.id, u.name, u.email, u.avatar, u.provider, u.role,
      u.is_banned, u.ban_reason, u.banned_at, u.player_settings,
      u.created_at, s.expires_at
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > NOW()
  `, [token]);

  const user = res.rows[0] || null;
  if (user) {
    if (typeof user.player_settings === 'string') {
      try {
        user.player_settings = JSON.parse(user.player_settings);
      } catch {
        user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
      }
    } else if (!user.player_settings) {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  }

  return user;
}

export async function getUserSessions(userId, currentToken) {
  if (!userId) return [];
  const res = await pool.query(`
    SELECT token, user_agent, ip_address, created_at, expires_at
    FROM user_sessions
    WHERE user_id = $1 AND expires_at > NOW()
    ORDER BY created_at DESC
  `, [userId]);

  return res.rows.map(row => ({
    id: row.token.slice(-12),
    isCurrent: row.token === currentToken,
    userAgent: row.user_agent || 'Thiết bị không xác định',
    ipAddress: row.ip_address || '—',
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

export async function revokeOtherSessions(userId, currentToken) {
  if (!userId || !currentToken) return { revokedCount: 0 };
  const res = await pool.query(
    'DELETE FROM user_sessions WHERE user_id = $1 AND token != $2 RETURNING token',
    [userId, currentToken]
  );
  return { revokedCount: res.rowCount };
}

export async function updateUserProfile(userId, { name, avatar, player_settings }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(name.trim());
  }
  if (avatar !== undefined) {
    fields.push(`avatar = $${idx++}`);
    values.push(avatar.trim());
  }
  if (player_settings !== undefined) {
    fields.push(`player_settings = $${idx++}`);
    values.push(typeof player_settings === 'string' ? player_settings : JSON.stringify(player_settings));
  }

  if (!fields.length) {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return existing.rows[0];
  }

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const query = `
    UPDATE users
    SET ${fields.join(', ')}
    WHERE id = $${idx}
    RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, player_settings, created_at, updated_at
  `;

  const res = await pool.query(query, values);
  const row = res.rows[0] || null;
  if (row && typeof row.player_settings === 'string') {
    try {
      row.player_settings = JSON.parse(row.player_settings);
    } catch {
      row.player_settings = {};
    }
  }
  return row;
}

export async function revokeSession(token) {
  if (!token) return;
  await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
}

export function extractBearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader.trim();
}

export async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Vui lòng đăng nhập để thực hiện hành động này.'
    });
  }

  const user = await getUserByToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      code: 'SESSION_EXPIRED',
      message: 'Phiên làm việc đã hết hạn hoặc không tồn tại. Vui lòng đăng nhập lại.'
    });
  }

  // Thực thi kiểm tra khóa tài khoản ở server (Phase 4)
  if (user.is_banned) {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_BANNED',
      message: `Tài khoản của bạn đã bị khóa.${user.ban_reason ? ' Lý do: ' + user.ban_reason : ''}`
    });
  }

  req.user = user;
  req.token = token;
  next();
}

export async function optionalAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (token) {
    try {
      const user = await getUserByToken(token);
      if (user && !user.is_banned) {
        req.user = user;
        req.token = token;
      } else {
        req.user = null;
      }
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

export async function requireAdmin(req, res, next) {
  // Yêu cầu xác thực tài khoản trước
  await requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập trang quản trị.'
      });
    }
    next();
  });
}
