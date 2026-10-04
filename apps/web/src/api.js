// API Client - Giao tiếp với Linime Backend REST API
const API_BASE = '/api';

export const LinimeAPI = {
  // 1. Catalog APIs
  async getSpotlight() {
    try {
      const res = await fetch(`${API_BASE}/anime/spotlight`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getSpotlight error:', err);
      return [];
    }
  },

  async getTrending(limit = 12) {
    try {
      const res = await fetch(`${API_BASE}/anime/trending?limit=${limit}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getTrending error:', err);
      return [];
    }
  },

  async getRecentlyUpdated(limit = 12) {
    try {
      const res = await fetch(`${API_BASE}/anime/recently-updated?limit=${limit}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getRecentlyUpdated error:', err);
      return [];
    }
  },

  async getSeasonal() {
    try {
      const res = await fetch(`${API_BASE}/anime/seasonal`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getSeasonal error:', err);
      return [];
    }
  },

  async getMovies(page = 1, limit = 12) {
    const params = new URLSearchParams({ page, limit });
    const res = await fetch(`${API_BASE}/anime/movies?${params}`);
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.data)) throw new Error('Không tải được phim lẻ');
    return data;
  },

  async getGenres() {
    try {
      const res = await fetch(`${API_BASE}/anime/genres`);
      const data = await res.json();
      return data.success ? data.data : {};
    } catch (err) {
      console.error('getGenres error:', err);
      return {};
    }
  },

  // 2. Anime Detail & Episodes
  async getAnimeDetail(id) {
    try {
      const res = await fetch(`${API_BASE}/anime/${id}`);
      const data = await res.json();
      return data.success ? data.data : null;
    } catch (err) {
      console.error(`getAnimeDetail(${id}) error:`, err);
      return null;
    }
  },

  async getEpisodes(id) {
    try {
      const res = await fetch(`${API_BASE}/anime/${id}/episodes`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error(`getEpisodes(${id}) error:`, err);
      return [];
    }
  },

  // 3. Search API
  async search(query = '', filters = {}) {
    try {
      const params = new URLSearchParams({ q: query, ...filters });
      const res = await fetch(`${API_BASE}/search?${params.toString()}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('search error:', err);
      return [];
    }
  },

  // 4. Watchlist API
  async getWatchlist() {
    try {
      const res = await fetch(`${API_BASE}/watchlist`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getWatchlist error:', err);
      return [];
    }
  },

  async toggleWatchlist(animeId) {
    try {
      const res = await fetch(`${API_BASE}/watchlist/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animeId })
      });
      return await res.json();
    } catch (err) {
      console.error('toggleWatchlist error:', err);
      return { success: false };
    }
  },

  // 5. History / Continue Watching API
  async getHistory() {
    try {
      const res = await fetch(`${API_BASE}/history`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getHistory error:', err);
      return [];
    }
  },

  async saveProgress(animeId, episodeNumber, currentTime, duration) {
    try {
      const res = await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animeId, episodeNumber, currentTime, duration })
      });
      return await res.json();
    } catch (err) {
      console.error('saveProgress error:', err);
      return { success: false };
    }
  },

  // 6. User Auth API
  async login(userPayload) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload)
      });
      return await res.json();
    } catch (err) {
      console.error('login error:', err);
      return { success: false };
    }
  }
};
