import express from 'express';
import { pool } from './db/db.js';
import { kkRequest, slugOK, mapMovie, extractEpisodes } from './kkphim.js';

export const adminRouter = express.Router();

// Helper: áp dụng thông tin override vào anime object
export function applyAnimeOverride(anime, override) {
  if (!override) return anime;
  const copy = { ...anime };
  if (override.title_vietnamese) {
    copy.title = { ...(copy.title || {}), vietnamese: override.title_vietnamese };
  }
  if (override.title_english) {
    copy.title = { ...(copy.title || {}), english: override.title_english };
  }
  if (override.description !== undefined && override.description !== null) {
    copy.description = override.description;
  }
  if (override.cover_image) copy.coverImage = override.cover_image;
  if (override.banner_image) copy.bannerImage = override.banner_image;
  if (Array.isArray(override.genres) && override.genres.length) copy.genres = override.genres;
  if (override.status) copy.status = override.status;
  if (Array.isArray(override.custom_seasons) && override.custom_seasons.length) {
    copy.seasons = override.custom_seasons;
  }
  copy.is_hidden = Boolean(override.is_hidden);
  copy.has_override = true;
  copy.notes = override.notes;
  return copy;
}

// Helper: ghi nhật ký kiểm toán thao tác quản trị
export async function createAuditLog({ req, action, targetType, targetId, details }) {
  try {
    const userId = req?.user?.id || 'system';
    const adminName = req?.user?.name || 'Admin';
    const adminEmail = req?.user?.email || null;
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || null;

    // Loại bỏ token, mật khẩu, bí mật nhạy cảm
    const sanitizedDetails = details ? { ...details } : {};
    delete sanitizedDetails.token;
    delete sanitizedDetails.password;
    delete sanitizedDetails.secret;

    await pool.query(`
      INSERT INTO audit_logs (user_id, admin_name, admin_email, action, target_type, target_id, details, ip_address, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [userId, adminName, adminEmail, action, targetType, String(targetId || ''), JSON.stringify(sanitizedDetails), ipAddress]);
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}

// ==========================================
// 0. ADMIN PROFILE & SESSION
// ==========================================
adminRouter.get('/me', (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ==========================================
// 1. TỔNG QUAN & THỐNG KÊ (DASHBOARD)
// ==========================================
adminRouter.get('/dashboard', async (req, res) => {
  try {
    const [reportsRes, overridesRes, hiddenRes, usersRes, lastSyncRes] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_reports,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_reports,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_reports,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved_reports
        FROM reports
      `),
      pool.query('SELECT COUNT(*) as total_overrides FROM anime_overrides'),
      pool.query('SELECT COUNT(*) as total_hidden FROM anime_overrides WHERE is_hidden = true'),
      pool.query('SELECT COUNT(*) as total_users FROM users'),
      pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1')
    ]);

    const reportCounts = reportsRes.rows[0] || {};
    const totalOverrides = parseInt(overridesRes.rows[0]?.total_overrides, 10) || 0;
    const totalHidden = parseInt(hiddenRes.rows[0]?.total_hidden, 10) || 0;
    const totalUsers = parseInt(usersRes.rows[0]?.total_users, 10) || 0;
    const lastSync = lastSyncRes.rows[0] || null;

    const recentReports = await pool.query(`
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 6
    `);

    const recentOverrides = await pool.query(`
      SELECT anime_id, title_vietnamese, title_english, is_hidden, updated_at
      FROM anime_overrides
      ORDER BY updated_at DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      stats: {
        total_reports: parseInt(reportCounts.total_reports, 10) || 0,
        pending_reports: parseInt(reportCounts.pending_reports, 10) || 0,
        in_progress_reports: parseInt(reportCounts.in_progress_reports, 10) || 0,
        resolved_reports: parseInt(reportCounts.resolved_reports, 10) || 0,
        total_overrides: totalOverrides,
        total_hidden: totalHidden,
        total_users: totalUsers,
        source_status: 'online',
        upstream_provider: 'AniDoki / PhimAPI'
      },
      last_sync: lastSync,
      recent_reports: recentReports.rows,
      recent_overrides: recentOverrides.rows
    });
  } catch (err) {
    console.error('Admin dashboard stats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải số liệu tổng quan' });
  }
});

adminRouter.get('/stats', (req, res) => {
  // Alias to /dashboard for consistency
  res.redirect('/api/admin/dashboard');
});

// ==========================================
// 2. QUẢN LÝ PHIM (ANIME CRUD & OVERRIDES)
// ==========================================
adminRouter.get('/anime', async (req, res) => {
  try {
    const { q = '', category = '', hidden = 'all', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    // Lấy tất cả overrides từ database để merge
    const overridesRes = await pool.query('SELECT * FROM anime_overrides');
    const overridesMap = new Map(overridesRes.rows.map(row => [row.anime_id, row]));

    let items = [];
    let totalItems = 0;

    if (q && q.trim()) {
      const keyword = q.trim().slice(0, 100);
      const upstream = await kkRequest('/v1/api/tim-kiem?' + new URLSearchParams({
        keyword,
        limit: '64',
        country: 'nhat-ban'
      }));
      items = (upstream.data?.items || []).filter(m => m.type === 'hoathinh').map(mapMovie);
    } else {
      const queryObj = { country: 'nhat-ban', limit: String(limitNum), page: String(pageNum) };
      if (category) queryObj.category = category;
      const upstream = await kkRequest('/v1/api/danh-sach/hoat-hinh?' + new URLSearchParams(queryObj));
      items = (upstream.data?.items || []).map(mapMovie);
      totalItems = Number(upstream.data?.params?.pagination?.totalItems) || items.length;
    }

    // Merge overrides và thêm cờ has_override, is_hidden
    items = items.map(anime => {
      const override = overridesMap.get(anime.id);
      return applyAnimeOverride(anime, override);
    });

    // Lọc theo trạng thái ẩn/hiện nếu được chỉ định
    if (hidden === 'hidden') {
      items = items.filter(a => a.is_hidden === true);
    } else if (hidden === 'visible') {
      items = items.filter(a => a.is_hidden !== true);
    }

    // Tính toán phân trang
    if (q && q.trim()) {
      totalItems = items.length;
      items = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    }
    const totalPages = Math.ceil(totalItems / limitNum) || 1;

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        totalPages,
        totalItems,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    });
  } catch (err) {
    console.error('Admin list anime error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách phim quản trị' });
  }
});

adminRouter.get('/anime/:id', async (req, res) => {
  const animeId = req.params.id;
  if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

  try {
    const [overrideRes, detailRes] = await Promise.all([
      pool.query('SELECT * FROM anime_overrides WHERE anime_id = $1', [animeId]),
      kkRequest('/phim/' + animeId).catch(() => null)
    ]);

    const override = overrideRes.rows[0] || null;
    let anime = detailRes?.movie ? { ...mapMovie(detailRes.movie), episodes: extractEpisodes(detailRes) } : null;

    if (!anime) {
      if (!override) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin phim' });
      }
      anime = {
        id: animeId,
        title: { vietnamese: override.title_vietnamese || animeId, english: override.title_english || animeId },
        description: override.description || '',
        coverImage: override.cover_image || '/poster-placeholder.svg',
        bannerImage: override.banner_image || '',
        genres: override.genres || [],
        status: override.status || 'Ongoing',
        seasons: override.custom_seasons || [],
        episodes: []
      };
    }

    anime = applyAnimeOverride(anime, override);

    res.json({
      success: true,
      data: anime,
      override: override || null
    });
  } catch (err) {
    console.error('Admin get anime detail error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy chi tiết phim' });
  }
});

adminRouter.put('/anime/:id', async (req, res) => {
  const animeId = req.params.id;
  if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

  const {
    title_vietnamese,
    title_english,
    description,
    cover_image,
    banner_image,
    genres,
    status,
    is_hidden = false,
    custom_seasons = [],
    notes
  } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO anime_overrides (
        anime_id, title_vietnamese, title_english, description, cover_image, banner_image,
        genres, status, is_hidden, custom_seasons, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (anime_id) DO UPDATE SET
        title_vietnamese = EXCLUDED.title_vietnamese,
        title_english = EXCLUDED.title_english,
        description = EXCLUDED.description,
        cover_image = EXCLUDED.cover_image,
        banner_image = EXCLUDED.banner_image,
        genres = EXCLUDED.genres,
        status = EXCLUDED.status,
        is_hidden = EXCLUDED.is_hidden,
        custom_seasons = EXCLUDED.custom_seasons,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `, [
      animeId,
      title_vietnamese || null,
      title_english || null,
      description !== undefined ? description : null,
      cover_image || null,
      banner_image || null,
      JSON.stringify(Array.isArray(genres) ? genres : []),
      status || null,
      Boolean(is_hidden),
      JSON.stringify(Array.isArray(custom_seasons) ? custom_seasons : []),
      notes || null
    ]);

    await createAuditLog({
      req,
      action: 'UPDATE_ANIME_OVERRIDE',
      targetType: 'anime',
      targetId: animeId,
      details: { title_vietnamese, title_english, status, is_hidden, notes }
    });

    res.json({
      success: true,
      message: 'Đã lưu chỉnh sửa phim thành công',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Admin update anime override error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu thông tin chỉnh sửa phim' });
  }
});

adminRouter.post('/anime/:id/toggle-visibility', async (req, res) => {
  const animeId = req.params.id;
  if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

  try {
    const result = await pool.query(`
      INSERT INTO anime_overrides (anime_id, is_hidden, updated_at)
      VALUES ($1, TRUE, NOW())
      ON CONFLICT (anime_id) DO UPDATE SET
        is_hidden = NOT anime_overrides.is_hidden,
        updated_at = NOW()
      RETURNING is_hidden;
    `, [animeId]);

    const isHidden = result.rows[0].is_hidden;

    await createAuditLog({
      req,
      action: 'TOGGLE_ANIME_VISIBILITY',
      targetType: 'anime',
      targetId: animeId,
      details: { is_hidden: isHidden }
    });

    res.json({
      success: true,
      is_hidden: isHidden,
      message: isHidden ? 'Đã ẩn anime khỏi website' : 'Đã hiển thị anime trên website'
    });
  } catch (err) {
    console.error('Admin toggle anime visibility error:', err);
    res.status(500).json({ success: false, message: 'Lỗi chuyển đổi trạng thái ẩn/hiện' });
  }
});

// ==========================================
// 3. QUẢN LÝ TẬP & NGUỒN PHÁT (EPISODES OVERRIDES)
// ==========================================
adminRouter.get('/anime/:id/episodes', async (req, res) => {
  const animeId = req.params.id;
  if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

  try {
    const [detailRes, epOverridesRes] = await Promise.all([
      kkRequest('/phim/' + animeId).catch(() => null),
      pool.query('SELECT * FROM episode_overrides WHERE anime_id = $1 ORDER BY episode_number ASC', [animeId])
    ]);

    const overridesMap = new Map(epOverridesRes.rows.map(row => [row.episode_number, row]));
    let episodes = detailRes ? extractEpisodes(detailRes) : [];

    // Nếu không có tập từ upstream, kiểm tra các tập đã lưu override
    if (!episodes.length && epOverridesRes.rows.length) {
      episodes = epOverridesRes.rows.map(o => ({
        number: o.episode_number,
        title: `Tập ${o.episode_number}`,
        embed: o.embed_url || ''
      }));
    }

    // Merge override vào từng tập
    const mergedEpisodes = episodes.map(ep => {
      const o = overridesMap.get(ep.number);
      return {
        number: ep.number,
        title: ep.title,
        original_embed: ep.embed,
        embed_url: o?.embed_url || ep.embed,
        is_hidden: Boolean(o?.is_hidden),
        last_checked_at: o?.last_checked_at || null,
        last_check_status: o?.last_check_status || null,
        notes: o?.notes || null
      };
    });

    res.json({
      success: true,
      anime_id: animeId,
      episodes: mergedEpisodes
    });
  } catch (err) {
    console.error('Admin get episodes error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách tập phim' });
  }
});

adminRouter.put('/anime/:id/episodes/:episodeNumber', async (req, res) => {
  const animeId = req.params.id;
  const episodeNumber = parseInt(req.params.episodeNumber, 10);
  if (!slugOK(animeId) || isNaN(episodeNumber) || episodeNumber < 1) {
    return res.status(400).json({ success: false, message: 'Mã phim hoặc số tập không hợp lệ' });
  }

  const { embed_url, is_hidden = false, notes } = req.body;

  // Kiểm tra tính hợp lệ của embed_url nếu có truyền vào
  if (embed_url && embed_url.trim()) {
    try {
      new URL(embed_url.trim());
    } catch {
      return res.status(400).json({ success: false, message: 'Đường dẫn video / embed không hợp lệ' });
    }
  }

  try {
    const result = await pool.query(`
      INSERT INTO episode_overrides (
        anime_id, episode_number, embed_url, is_hidden, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (anime_id, episode_number) DO UPDATE SET
        embed_url = EXCLUDED.embed_url,
        is_hidden = EXCLUDED.is_hidden,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `, [
      animeId,
      episodeNumber,
      embed_url ? embed_url.trim() : null,
      Boolean(is_hidden),
      notes || null
    ]);

    await createAuditLog({
      req,
      action: 'UPDATE_EPISODE_OVERRIDE',
      targetType: 'episode',
      targetId: `${animeId}:${episodeNumber}`,
      details: { has_embed: Boolean(embed_url), is_hidden, notes }
    });

    res.json({
      success: true,
      message: `Đã lưu cấu hình Tập ${episodeNumber}`,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Admin update episode override error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu thông tin tập phim' });
  }
});

adminRouter.post('/anime/:id/episodes/:episodeNumber/check', async (req, res) => {
  const animeId = req.params.id;
  const episodeNumber = parseInt(req.params.episodeNumber, 10);
  if (!slugOK(animeId) || isNaN(episodeNumber) || episodeNumber < 1) {
    return res.status(400).json({ success: false, message: 'Mã phim hoặc số tập không hợp lệ' });
  }

  try {
    // Tìm nguồn phát hiện tại (ưu tiên override nếu có)
    const overrideRes = await pool.query(
      'SELECT * FROM episode_overrides WHERE anime_id = $1 AND episode_number = $2',
      [animeId, episodeNumber]
    );
    let targetUrl = overrideRes.rows[0]?.embed_url;

    if (!targetUrl) {
      const detail = await kkRequest('/phim/' + animeId).catch(() => null);
      const ep = detail ? extractEpisodes(detail).find(e => e.number === episodeNumber) : null;
      targetUrl = ep?.embed;
    }

    if (!targetUrl) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn nguồn phát của tập này' });
    }

    let isOk = false;
    let statusCode = 0;
    try {
      const checkRes = await fetch(targetUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      statusCode = checkRes.status;
      isOk = checkRes.ok || checkRes.status === 403 || checkRes.status === 405; // Nhiều player chặn HEAD nhưng vẫn live
    } catch {
      // Thử GET nhẹ
      try {
        const getRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-100' },
          signal: AbortSignal.timeout(5000)
        });
        statusCode = getRes.status;
        isOk = getRes.ok || getRes.status === 206;
      } catch {
        isOk = false;
      }
    }

    const checkStatus = isOk ? 'ok' : 'error';

    // Cập nhật kết quả kiểm tra vào database
    await pool.query(`
      INSERT INTO episode_overrides (anime_id, episode_number, last_checked_at, last_check_status, updated_at)
      VALUES ($1, $2, NOW(), $3, NOW())
      ON CONFLICT (anime_id, episode_number) DO UPDATE SET
        last_checked_at = NOW(),
        last_check_status = $3,
        updated_at = NOW()
    `, [animeId, episodeNumber, checkStatus]);

    res.json({
      success: true,
      status: checkStatus,
      http_code: statusCode,
      checked_at: new Date().toISOString(),
      message: isOk ? 'Nguồn phát hoạt động bình thường' : 'Nguồn phát có dấu hiệu lỗi hoặc không phản hồi'
    });
  } catch (err) {
    console.error('Check episode stream error:', err);
    res.status(500).json({ success: false, message: 'Lỗi kiểm tra nguồn phát tập phim' });
  }
});

// ==========================================
// 4. ĐỒNG BỘ DỮ LIỆU & NHẬT KÝ (SYNC)
// ==========================================
let activeSyncTask = null;

adminRouter.get('/sync/logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 50');
    res.json({
      success: true,
      data: result.rows,
      is_syncing: Boolean(activeSyncTask)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải nhật ký đồng bộ' });
  }
});

adminRouter.post('/sync/anime', async (req, res) => {
  const { slug } = req.body;
  if (!slugOK(slug)) return res.status(400).json({ success: false, message: 'Mã phim cần đồng bộ không hợp lệ' });

  if (activeSyncTask) {
    return res.status(409).json({ success: false, message: 'Hiện đang có tác vụ đồng bộ đang chạy. Vui lòng chờ hoàn tất.' });
  }

  activeSyncTask = `anime:${slug}`;
  let logId = null;

  try {
    const logRes = await pool.query(`
      INSERT INTO sync_logs (sync_type, target_slug, status, started_at)
      VALUES ('manual_anime', $1, 'running', NOW())
      RETURNING id;
    `, [slug]);
    logId = logRes.rows[0].id;

    // Lấy thông tin từ upstream
    const detail = await kkRequest('/phim/' + slug);
    if (!detail.movie) throw new Error('Upstream không trả về dữ liệu phim');

    const epCount = extractEpisodes(detail).length;

    await pool.query(`
      UPDATE sync_logs
      SET status = 'success', items_synced = 1, details = $1, finished_at = NOW()
      WHERE id = $2
    `, [JSON.stringify({ title: detail.movie.name, episodes_count: epCount }), logId]);

    await createAuditLog({
      req,
      action: 'SYNC_ANIME',
      targetType: 'anime',
      targetId: slug,
      details: { title: detail.movie.name, episodes_count: epCount }
    });

    res.json({
      success: true,
      message: `Đã đồng bộ thành công anime "${detail.movie.name}" (${epCount} tập).`,
      episodes_count: epCount
    });
  } catch (err) {
    if (logId) {
      await pool.query(`
        UPDATE sync_logs
        SET status = 'failed', error_message = $1, finished_at = NOW()
        WHERE id = $2
      `, [err.message || 'Lỗi không xác định', logId]);
    }
    res.status(500).json({ success: false, message: `Lỗi đồng bộ: ${err.message}` });
  } finally {
    activeSyncTask = null;
  }
});

adminRouter.post('/sync/recent', async (req, res) => {
  const limit = Math.min(48, Math.max(12, parseInt(req.body.limit, 10) || 24));

  if (activeSyncTask) {
    return res.status(409).json({ success: false, message: 'Hiện đang có tác vụ đồng bộ đang chạy. Vui lòng chờ hoàn tất.' });
  }

  activeSyncTask = `catalog_recent:${limit}`;
  let logId = null;

  try {
    const logRes = await pool.query(`
      INSERT INTO sync_logs (sync_type, status, started_at)
      VALUES ('catalog_recent', 'running', NOW())
      RETURNING id;
    `);
    logId = logRes.rows[0].id;

    const data = await kkRequest(`/v1/api/danh-sach/hoat-hinh?country=nhat-ban&limit=${limit}&page=1`);
    const items = data.data?.items || [];

    await pool.query(`
      UPDATE sync_logs
      SET status = 'success', items_synced = $1, details = $2, finished_at = NOW()
      WHERE id = $3
    `, [items.length, JSON.stringify({ count: items.length }), logId]);

    await createAuditLog({
      req,
      action: 'SYNC_RECENT_CATALOG',
      targetType: 'catalog',
      targetId: `recent_${limit}`,
      details: { items_synced: items.length }
    });

    res.json({
      success: true,
      message: `Đã hoàn tất đồng bộ danh mục ${items.length} phim mới cập nhật từ AniDoki.`,
      items_synced: items.length
    });
  } catch (err) {
    if (logId) {
      await pool.query(`
        UPDATE sync_logs
        SET status = 'failed', error_message = $1, finished_at = NOW()
        WHERE id = $2
      `, [err.message || 'Lỗi không xác định', logId]);
    }
    res.status(500).json({ success: false, message: `Lỗi đồng bộ danh mục: ${err.message}` });
  } finally {
    activeSyncTask = null;
  }
});

// ==========================================
// 5. QUẢN LÝ BÁO LỖI (REPORTS MANAGEMENT)
// ==========================================
adminRouter.get('/reports', async (req, res) => {
  try {
    const { status = 'all', issue_type = '', anime_id = '', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    if (issue_type) {
      params.push(issue_type);
      conditions.push(`r.issue_type = $${params.length}`);
    }

    if (anime_id) {
      params.push(anime_id);
      conditions.push(`r.anime_slug = $${params.length}`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) as total FROM reports r ${whereClause}`;
    const dataQuery = `
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limitNum, offset])
    ]);

    const total = parseInt(countRes.rows[0]?.total, 10) || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: {
        page: pageNum,
        totalPages,
        totalItems: total,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    });
  } catch (err) {
    console.error('Admin get reports error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách báo lỗi' });
  }
});

adminRouter.patch('/reports/:id', async (req, res) => {
  const reportId = parseInt(req.params.id, 10);
  if (isNaN(reportId)) return res.status(400).json({ success: false, message: 'ID báo lỗi không hợp lệ' });

  const { status, admin_notes } = req.body;
  const validStatuses = ['pending', 'in_progress', 'resolved', 'dismissed'];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Trạng thái báo lỗi không hợp lệ' });
  }

  try {
    const result = await pool.query(`
      UPDATE reports
      SET 
        status = COALESCE($1, status),
        admin_notes = COALESCE($2, admin_notes),
        resolved_at = CASE WHEN $1 IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `, [status || null, admin_notes !== undefined ? admin_notes : null, reportId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo sự cố' });
    }

    await createAuditLog({
      req,
      action: 'PROCESS_REPORT',
      targetType: 'report',
      targetId: reportId,
      details: { status, admin_notes }
    });

    res.json({
      success: true,
      message: 'Đã cập nhật báo cáo sự cố thành công',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Admin patch report error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật báo cáo sự cố' });
  }
});

// ==========================================
// 6. QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN (USERS MANAGEMENT)
// ==========================================
adminRouter.get('/users', async (req, res) => {
  try {
    const { q, status, role, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (q && q.trim()) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR id ILIKE $${idx})`);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    if (status === 'banned') {
      conditions.push(`is_banned = TRUE`);
    } else if (status === 'active') {
      conditions.push(`(is_banned IS FALSE OR is_banned IS NULL)`);
    }

    if (role && ['admin', 'user'].includes(role)) {
      conditions.push(`role = $${idx}`);
      values.push(role);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM users ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].count, 10);

    const usersRes = await pool.query(`
      SELECT id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...values, limitNum, offset]);

    res.json({
      success: true,
      users: usersRes.rows,
      pagination: {
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        totalItems: total,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách người dùng' });
  }
});

adminRouter.get('/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const userRes = await pool.query(`
      SELECT id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
      FROM users
      WHERE id = $1
    `, [userId]);

    if (!userRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }

    const [sessionsRes, watchlistRes, historyRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()', [userId]),
      pool.query('SELECT COUNT(*) FROM kk_watchlist WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) FROM kk_history WHERE user_id = $1', [userId])
    ]);

    res.json({
      success: true,
      user: userRes.rows[0],
      stats: {
        activeSessions: parseInt(sessionsRes.rows[0]?.count, 10) || 0,
        watchlistCount: parseInt(watchlistRes.rows[0]?.count, 10) || 0,
        historyCount: parseInt(historyRes.rows[0]?.count, 10) || 0
      }
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải thông tin chi tiết người dùng' });
  }
});

adminRouter.patch('/users/:id/role', async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Vai trò người dùng không hợp lệ' });
  }

  // Quy tắc 1: Ngăn admin tự gỡ quyền admin của chính mình
  if (req.user?.id === userId && role !== 'admin') {
    return res.status(400).json({ success: false, message: 'Bạn không thể tự hạ quyền quản trị của chính mình.' });
  }

  try {
    // Quy tắc 2: Ngăn hạ quyền nếu là Admin hoạt động duy nhất còn lại
    if (role !== 'admin') {
      const activeAdminCountRes = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND (is_banned IS FALSE OR is_banned IS NULL)"
      );
      const activeAdminCount = parseInt(activeAdminCountRes.rows[0].count, 10) || 0;
      const targetUserRes = await pool.query('SELECT role, is_banned FROM users WHERE id = $1', [userId]);

      if (targetUserRes.rows[0]?.role === 'admin' && activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Không thể hạ quyền Admin đang hoạt động duy nhất trong hệ thống.'
        });
      }
    }

    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, updated_at',
      [role, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }

    await createAuditLog({
      req,
      action: 'UPDATE_USER_ROLE',
      targetType: 'user',
      targetId: userId,
      details: { role }
    });

    res.json({
      success: true,
      message: `Đã cập nhật vai trò người dùng thành "${role}"`,
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Admin update user role error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật vai trò tài khoản' });
  }
});

adminRouter.patch('/users/:id/ban', async (req, res) => {
  const userId = req.params.id;
  const { is_banned, ban_reason } = req.body;

  if (typeof is_banned !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Thiếu trạng thái khóa tài khoản (is_banned: boolean)' });
  }

  // Quy tắc 1: Ngăn admin tự khóa tài khoản của chính mình
  if (req.user?.id === userId) {
    return res.status(400).json({ success: false, message: 'Bạn không thể tự khóa tài khoản của chính mình.' });
  }

  try {
    const targetUserRes = await pool.query('SELECT role, is_banned, email, name FROM users WHERE id = $1', [userId]);
    if (!targetUserRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }
    const target = targetUserRes.rows[0];

    // Quy tắc 2: Ngăn khóa nếu đây là Admin hoạt động duy nhất
    if (is_banned && target.role === 'admin') {
      const activeAdminCountRes = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND (is_banned IS FALSE OR is_banned IS NULL)"
      );
      const activeAdminCount = parseInt(activeAdminCountRes.rows[0].count, 10) || 0;
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Không thể khóa Admin đang hoạt động duy nhất trong hệ thống.'
        });
      }
    }

    const updatedRes = await pool.query(`
      UPDATE users
      SET 
        is_banned = $1,
        ban_reason = CASE WHEN $1 = TRUE THEN $2 ELSE NULL END,
        banned_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, email, role, is_banned, ban_reason, banned_at, updated_at
    `, [is_banned, ban_reason || null, userId]);

    // Nếu khóa tài khoản, lập tức hủy toàn bộ phiên làm việc của user đó
    if (is_banned) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    }

    await createAuditLog({
      req,
      action: is_banned ? 'BAN_USER' : 'UNBAN_USER',
      targetType: 'user',
      targetId: userId,
      details: { is_banned, ban_reason, target_email: target.email }
    });

    res.json({
      success: true,
      message: is_banned ? 'Đã khóa tài khoản thành công' : 'Đã mở khóa tài khoản thành công',
      user: updatedRes.rows[0]
    });
  } catch (err) {
    console.error('Admin ban user error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái khóa tài khoản' });
  }
});

// ==========================================
// 7. CẤU HÌNH TRANG CHỦ (HOMEPAGE MANAGEMENT)
// ==========================================
adminRouter.get('/homepage', async (req, res) => {
  try {
    const configRes = await pool.query("SELECT * FROM homepage_config WHERE id = 'default'");
    const config = configRes.rows[0] || {
      id: 'default',
      spotlight_slugs: [],
      sections_config: []
    };

    res.json({
      success: true,
      config
    });
  } catch (err) {
    console.error('Admin get homepage config error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải cấu hình trang chủ' });
  }
});

adminRouter.put('/homepage', async (req, res) => {
  const { spotlight_slugs, sections_config } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO homepage_config (id, spotlight_slugs, sections_config, updated_at, updated_by)
      VALUES (
        'default',
        COALESCE($1::jsonb, '[]'::jsonb),
        COALESCE($2::jsonb, '[]'::jsonb),
        NOW(),
        $3
      )
      ON CONFLICT (id) DO UPDATE SET
        spotlight_slugs = COALESCE(EXCLUDED.spotlight_slugs, homepage_config.spotlight_slugs),
        sections_config = COALESCE(EXCLUDED.sections_config, homepage_config.sections_config),
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *;
    `, [
      spotlight_slugs ? JSON.stringify(spotlight_slugs) : null,
      sections_config ? JSON.stringify(sections_config) : null,
      req.user?.id || 'admin'
    ]);

    await createAuditLog({
      req,
      action: 'UPDATE_HOMEPAGE_CONFIG',
      targetType: 'homepage',
      targetId: 'default',
      details: { spotlight_slugs, sections_config }
    });

    res.json({
      success: true,
      message: 'Đã cập nhật cấu hình trang chủ thành công',
      config: result.rows[0]
    });
  } catch (err) {
    console.error('Admin update homepage config error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu cấu hình trang chủ' });
  }
});

// ==========================================
// 8. TIẾP NHẬN & XỬ LÝ PHẢN HỒI (FEEDBACK MANAGEMENT)
// ==========================================
adminRouter.get('/feedback', async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (status && status !== 'all') {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM feedback ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].count, 10);

    const feedbackRes = await pool.query(`
      SELECT * FROM feedback
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...values, limitNum, offset]);

    res.json({
      success: true,
      feedback: feedbackRes.rows,
      pagination: {
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        totalItems: total,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('Admin get feedback error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách phản hồi' });
  }
});

adminRouter.patch('/feedback/:id', async (req, res) => {
  const feedbackId = parseInt(req.params.id, 10);
  if (isNaN(feedbackId)) return res.status(400).json({ success: false, message: 'ID phản hồi không hợp lệ' });

  const { status, admin_notes } = req.body;
  const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Trạng thái phản hồi không hợp lệ' });
  }

  try {
    const result = await pool.query(`
      UPDATE feedback
      SET 
        status = COALESCE($1, status),
        admin_notes = COALESCE($2, admin_notes),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `, [status || null, admin_notes !== undefined ? admin_notes : null, feedbackId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi' });
    }

    await createAuditLog({
      req,
      action: 'PROCESS_FEEDBACK',
      targetType: 'feedback',
      targetId: feedbackId,
      details: { status, admin_notes }
    });

    res.json({
      success: true,
      message: 'Đã cập nhật trạng thái phản hồi',
      data: result.rows[0],
      feedback: result.rows[0]
    });
  } catch (err) {
    console.error('Admin patch feedback error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật phản hồi' });
  }
});

// ==========================================
// 9. CÀI ĐẶT HỆ THỐNG (SYSTEM SETTINGS)
// ==========================================
adminRouter.get('/settings', async (req, res) => {
  try {
    const settingsRes = await pool.query('SELECT key, value, description, updated_at FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json({
      success: true,
      settings
    });
  } catch (err) {
    console.error('Admin get settings error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải cài đặt hệ thống' });
  }
});

adminRouter.put('/settings', async (req, res) => {
  const allowedKeys = ['site_name', 'site_logo', 'contact_email', 'site_announcement', 'maintenance_mode'];
  const updates = req.body;

  try {
    for (const [key, val] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        await pool.query(`
          INSERT INTO system_settings (key, value, updated_at, updated_by)
          VALUES ($1, $2::jsonb, NOW(), $3)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by;
        `, [key, JSON.stringify(val), req.user?.id || 'admin']);
      }
    }

    await createAuditLog({
      req,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetType: 'settings',
      targetId: 'site_settings',
      details: updates
    });

    res.json({
      success: true,
      message: 'Đã lưu cài đặt hệ thống thành công'
    });
  } catch (err) {
    console.error('Admin update settings error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu cài đặt hệ thống' });
  }
});

// ==========================================
// 10. NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
// ==========================================
adminRouter.get('/audit-logs', async (req, res) => {
  try {
    const { q, action, target_type, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (q && q.trim()) {
      conditions.push(`(admin_name ILIKE $${idx} OR admin_email ILIKE $${idx} OR target_id ILIKE $${idx})`);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    if (action && action.trim()) {
      conditions.push(`action = $${idx++}`);
      values.push(action.trim());
    }

    if (target_type && target_type.trim()) {
      conditions.push(`target_type = $${idx++}`);
      values.push(target_type.trim());
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM audit_logs ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].count, 10);

    const logsRes = await pool.query(`
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...values, limitNum, offset]);

    res.json({
      success: true,
      logs: logsRes.rows,
      pagination: {
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        totalItems: total,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('Admin get audit logs error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải nhật ký kiểm toán' });
  }
});
