import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  initDatabase,
  getSpotlightAnimes,
  getTrendingAnimes,
  getRecentlyUpdatedAnimes,
  getSeasonalAnimes,
  getMovieAnimes,
  getGenreAnimes,
  getAnimeById,
  getAnimeEpisodes,
  searchAnimes,
  getWatchlist,
  toggleWatchlist,
  getWatchHistory,
  saveWatchProgress
} from './db/db.js';
import { getLiveSources, getLiveEpisodes } from './streamService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Khởi tạo bảng PostgreSQL và seed dữ liệu khi khởi động
initDatabase().catch(err => {
  console.error('Lỗi kết nối cơ sở dữ liệu ban đầu:', err);
});

// ==========================================
// 1. ANIME CATALOG ENDPOINTS (POSTGRESQL)
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Linime Cinema API (PostgreSQL)',
    database: `PostgreSQL on port ${process.env.PGPORT || 5438}`,
    timestamp: new Date().toISOString()
  });
});

// Spotlight Hero Carousel
app.get('/api/anime/spotlight', async (req, res) => {
  try {
    const spotlights = await getSpotlightAnimes();
    res.json({ success: true, total: spotlights.length, data: spotlights });
  } catch (err) {
    console.error('Lỗi getSpotlight:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Trending Anime
app.get('/api/anime/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const trending = await getTrendingAnimes(limit);
    res.json({ success: true, total: trending.length, data: trending });
  } catch (err) {
    console.error('Lỗi getTrending:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Recently Updated
app.get('/api/anime/recently-updated', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const list = await getRecentlyUpdatedAnimes(limit);
    res.json({ success: true, total: list.length, data: list });
  } catch (err) {
    console.error('Lỗi getRecentlyUpdated:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Seasonal Anime
app.get('/api/anime/seasonal', async (req, res) => {
  try {
    const seasonal = await getSeasonalAnimes();
    res.json({ success: true, total: seasonal.length, data: seasonal });
  } catch (err) {
    console.error('Lỗi getSeasonal:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Anime Movies
app.get('/api/anime/movies', async (req, res) => {
  try {
    const movies = await getMovieAnimes();
    res.json({ success: true, total: movies.length, data: movies });
  } catch (err) {
    console.error('Lỗi getMovies:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Genre Rails
app.get('/api/anime/genres', async (req, res) => {
  try {
    const result = await getGenreAnimes();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Lỗi getGenres:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Chi tiết 1 bộ Anime theo ID
app.get('/api/anime/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const anime = await getAnimeById(id);

    if (!anime) {
      return res.status(404).json({ success: false, message: 'Anime không tồn tại' });
    }

    // Tính toán đếm ngược chính xác theo thời gian thực
    let nextAiringData = null;
    if (anime.nextAiring) {
      const targetTimestamp = anime.nextAiring.airingAt || (Date.now() + 86400000);
      const diffMs = Math.max(0, targetTimestamp - Date.now());
      const totalSecs = Math.floor(diffMs / 1000);

      nextAiringData = {
        episode: anime.nextAiring.episode,
        airingAt: targetTimestamp,
        timeRemaining: {
          days: Math.floor(totalSecs / 86400),
          hours: Math.floor((totalSecs % 86400) / 3600),
          minutes: Math.floor((totalSecs % 3600) / 60),
          seconds: totalSecs % 60
        }
      };
    }

    res.json({
      success: true,
      data: {
        ...anime,
        nextAiring: nextAiringData
      }
    });
  } catch (err) {
    console.error('Lỗi getAnimeDetail:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Danh sách tập của 1 Anime (kèm server streams & audio options)
app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // 1. Lấy danh sách tập từ Anikoto qua ánh xạ AniList
    const liveEpData = await getLiveEpisodes(id);
    if (liveEpData && liveEpData.episodes) {
      const formatted = liveEpData.episodes.map(ep => ({
        number: ep.number,
        title: ep.title ? `Tập ${ep.number}: ${ep.title}` : `Tập ${ep.number}`,
        isFiller: ep.isFiller || false,
        duration: ep.duration || '24:00',
        image: ep.image || '',
        description: ep.description || ''
      }));

      return res.json({
        success: true,
        animeId: id,
        totalEpisodes: formatted.length,
        providers: liveEpData.sorted_providers || [],
        data: formatted
      });
    }

    // 2. Dự phòng lấy từ PostgreSQL
    const episodes = await getAnimeEpisodes(id);
    res.json({
      success: true,
      animeId: id,
      totalEpisodes: episodes.length,
      data: episodes
    });
  } catch (err) {
    console.error('Lỗi getAnimeEpisodes:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Endpoint danh sách tập /api/watch/:id/episodes
app.get('/api/watch/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const liveEpData = await getLiveEpisodes(id);
    if (liveEpData) {
      return res.json(liveEpData);
    }
    const dbEpisodes = await getAnimeEpisodes(id);
    res.json({
      success: true,
      animeId: id,
      episodes: dbEpisodes
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ==========================================
// 2. REAL ANIME STREAMING & PROXY APIS
// ==========================================

// Lấy iframe Anikoto / MegaPlay
app.post('/api/watch/sources', async (req, res) => {
  try {
    const { anime_id, episode_number = 1, language = 'sub', provider = 'Megaplay' } = req.body;
    const sources = await getLiveSources(anime_id, episode_number, language, provider);

    if (sources) {
      res.json(sources);
    } else {
      res.status(404).json({ success: false, message: 'Không tìm thấy nguồn phát cho tập này' });
    }
  } catch (err) {
    console.error('Lỗi /api/watch/sources:', err);
    res.status(err.status || 502).json({ success: false, message: err.status === 400 ? err.message : 'Không kết nối được nguồn phát' });
  }
});

// ==========================================
// 3. SEARCH & FILTER API (POSTGRESQL)
// ==========================================
app.get('/api/search', async (req, res) => {
  try {
    const { q = '', genre = '', format = '', sort = 'score' } = req.query;
    const results = await searchAnimes(q, genre, format, sort);

    res.json({
      success: true,
      query: q,
      total: results.length,
      data: results
    });
  } catch (err) {
    console.error('Lỗi search:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ==========================================
// 3. WATCHLIST & HISTORY API (POSTGRESQL)
// ==========================================

// Lấy danh sách Watchlist
app.get('/api/watchlist', async (req, res) => {
  try {
    const list = await getWatchlist();
    res.json({ success: true, total: list.length, data: list });
  } catch (err) {
    console.error('Lỗi getWatchlist:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Thêm / Bỏ yêu thích
app.post('/api/watchlist/toggle', async (req, res) => {
  try {
    const { animeId } = req.body;
    if (!animeId) {
      return res.status(400).json({ success: false, message: 'Thiếu animeId' });
    }

    const result = await toggleWatchlist(animeId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Lỗi toggleWatchlist:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Lấy lịch sử xem dở
app.get('/api/history', async (req, res) => {
  try {
    const history = await getWatchHistory();
    res.json({ success: true, total: history.length, data: history });
  } catch (err) {
    console.error('Lỗi getHistory:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Cập nhật tiến trình xem
app.post('/api/history', async (req, res) => {
  try {
    const { animeId, episodeNumber, currentTime, duration } = req.body;
    if (!animeId || episodeNumber === undefined) {
      return res.status(400).json({ success: false, message: 'Thông tin không hợp lệ' });
    }

    await saveWatchProgress(animeId, episodeNumber, currentTime, duration);
    res.json({ success: true, message: 'Đã lưu tiến trình xem vào PostgreSQL' });
  } catch (err) {
    console.error('Lỗi saveWatchProgress:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ==========================================
// 4. USER AUTH API
// ==========================================
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
