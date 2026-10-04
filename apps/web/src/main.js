import { LinimeAPI } from './api.js';
import { groupSeries, seriesKey, seasonNumber } from '../../../shared/series.js';
const INITIAL_ANIME_DATA = []; // No sample catalog fallback for live KKPhim data.

// Application State
const state = {
  spotlights: [],
  spotlightIndex: 0,
  spotlightTimer: null,
  trending: [],
  recent: [],
  seasonal: [],
  movies: [],
  genres: {},
  currentDetailAnime: null,
  currentEpisodes: [],
  currentVideoAnime: null,
  currentEpisodeIndex: 0,
  activePlaybackSpeed: 1,
  countdownInterval: null,
  watchlistIds: [],
  user: JSON.parse(localStorage.getItem('linime_user') || 'null')
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message) {
  const toast = document.getElementById('toast-msg');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// ==========================================
// HEADER SCROLL & WATCHLIST BADGE
// ==========================================
function initHeader() {
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  const menu = document.getElementById('mobile-toggle-btn');
  const closeMenu = () => {
    header.classList.remove('menu-open');
    menu?.setAttribute('aria-expanded', 'false');
  };
  menu?.addEventListener('click', () => {
    const opened = header.classList.toggle('menu-open');
    menu.setAttribute('aria-expanded', String(opened));
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      closeMenu();
    });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  updateUserUI();
}

async function refreshWatchlistCount() {
  const badge = document.getElementById('watchlist-count');
  try {
    const list = await LinimeAPI.getWatchlist();
    state.watchlistIds = list.map(a => a.id);
    if (badge) badge.textContent = list.length;
  } catch {
    if (badge) badge.textContent = state.watchlistIds.length;
  }
}

function updateUserUI() {
  const userText = document.getElementById('user-display-name');
  if (state.user && state.user.name) {
    userText.textContent = state.user.name;
  } else {
    userText.textContent = 'Đăng nhập';
  }
}

// ==========================================
// SPOTLIGHT HERO CAROUSEL
// ==========================================
async function loadSpotlight() {
  try {
    const spotlights = await LinimeAPI.getSpotlight();
    state.spotlights = groupSeries(spotlights.length ? spotlights : INITIAL_ANIME_DATA.filter(a => a.isSpotlight));
  } catch {
    state.spotlights = INITIAL_ANIME_DATA.filter(a => a.isSpotlight);
  }

  const navContainer = document.getElementById('spotlight-nav');
  navContainer.innerHTML = '';

  state.spotlights.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', `Hiển thị phim nổi bật ${idx + 1}`);
    dot.className = `spotlight-dot ${idx === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => {
      setSpotlightSlide(idx);
      resetSpotlightTimer();
    });
    navContainer.appendChild(dot);
  });

  if (!state.spotlights.length) {
    document.getElementById('spotlight-title').textContent = 'Chưa tải được phim từ KKPhim';
    document.getElementById('spotlight-desc').textContent = 'Vui lòng tải lại trang để thử kết nối lại.';
    document.querySelectorAll('.spotlight-actions button').forEach(button => { button.disabled = true; });
  }
  setSpotlightSlide(0);
  startSpotlightTimer();

  // Button actions
  document.getElementById('spotlight-watch-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) openPlayer(anime, 0);
  });

  document.getElementById('spotlight-detail-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) openAnimeDetail(anime.id);
  });

  document.getElementById('spotlight-bookmark-btn')?.addEventListener('click', async () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) {
      const res = await LinimeAPI.toggleWatchlist(anime.id);
      await refreshWatchlistCount();
      showToast(res.message || 'Cập nhật danh sách yêu thích');
    }
  });
}

function setSpotlightSlide(index) {
  if (!state.spotlights.length) return;
  state.spotlightIndex = index % state.spotlights.length;
  const anime = state.spotlights[state.spotlightIndex];

  const bg = document.getElementById('spotlight-bg');
  const status = document.getElementById('spotlight-status');
  const score = document.getElementById('spotlight-score');
  const format = document.getElementById('spotlight-format');
  const studio = document.getElementById('spotlight-studio');
  const logo = document.getElementById('spotlight-logo');
  const title = document.getElementById('spotlight-title');
  const desc = document.getElementById('spotlight-desc');

  bg.onerror = () => { bg.onerror = null; bg.src = anime.coverImage || '/poster-placeholder.svg'; };
  bg.src = anime.bannerImage || anime.coverImage;
  status.textContent = anime.status === 'Currently Airing' ? 'ĐANG PHÁT SÓNG' : 'TRỌN BỘ';
  score.textContent = `★ ${anime.score}`;
  format.textContent = anime.format;
  studio.textContent = anime.studio;

  title.textContent = anime.title.english || anime.title.vietnamese;
  if (anime.logo) {
    logo.onerror = () => { logo.style.display = 'none'; title.style.display = 'block'; };
    logo.src = anime.logo;
    logo.style.display = 'block';
    title.style.display = 'none';
  } else {
    logo.style.display = 'none';
    title.style.display = 'block';
    title.textContent = anime.title.english || anime.title.vietnamese;
  }

  desc.textContent = anime.description;

  document.querySelectorAll('.spotlight-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === state.spotlightIndex);
    dot.setAttribute('aria-pressed', String(idx === state.spotlightIndex));
  });
}

function startSpotlightTimer() {
  state.spotlightTimer = setInterval(() => {
    if (state.spotlights.length) {
      setSpotlightSlide((state.spotlightIndex + 1) % state.spotlights.length);
    }
  }, 6500);
}

function resetSpotlightTimer() {
  clearInterval(state.spotlightTimer);
  startSpotlightTimer();
}

// ==========================================
// RENDER GRIDS & SECTIONS VIA API
// ==========================================
function renderCard(anime) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.dataset.seriesKey = seriesKey(anime);
  card.dataset.animeId = anime.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Xem chi tiết ${anime.title.english || anime.title.vietnamese}`);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
  });
  card.innerHTML = `
    <div class="anime-card-poster">
      <img src="${anime.coverImage}" alt="${anime.title.english}" loading="lazy" decoding="async">
      <div class="anime-card-badges">
        <span class="badge-score">★ ${anime.score}</span>
        <span class="badge-ep">${anime.format === 'MOVIE' ? 'Movie' : `Tập ${anime.currentEpisode || anime.totalEpisodes || 'Full'}`}</span>
      </div>
      <div class="anime-card-overlay">
        <div class="play-bubble">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
      </div>
    </div>
    <div class="anime-card-info">
      <h3 class="anime-card-title">${anime.title.english || anime.title.vietnamese}</h3>
      <span class="anime-card-sub">${anime.studio} · ${anime.year}${anime.seasons?.length > 1 ? ` · ${anime.seasons.length} mùa` : ''}</span>
    </div>
  `;

  const poster = card.querySelector('img');
  poster.addEventListener('error', () => {
    if (!poster.dataset.fallback && anime.bannerImage) {
      poster.dataset.fallback = 'banner';
      poster.src = anime.bannerImage;
    } else {
      poster.src = '/poster-placeholder.svg';
    }
  });

  card.addEventListener('click', () => {
    openAnimeDetail(anime.id);
  });

  return card;
}

async function loadCatalogs() {
  try {
    const [trending, recent, seasonal, genres] = await Promise.all([
      LinimeAPI.getTrending(24),
      LinimeAPI.getRecentlyUpdated(24),
      LinimeAPI.getSeasonal(),
      LinimeAPI.getGenres()
    ]);

    state.trending = trending.length ? trending : INITIAL_ANIME_DATA.filter(a => a.isTrending);
    state.recent = recent.length ? recent : INITIAL_ANIME_DATA;
    state.seasonal = seasonal.length ? seasonal : INITIAL_ANIME_DATA.filter(a => a.status === 'Currently Airing');
    state.genres = genres;
  } catch (err) {
    console.error('Error loading catalogs from API:', err);
    state.trending = INITIAL_ANIME_DATA.filter(a => a.isTrending);
    state.recent = INITIAL_ANIME_DATA;
    state.seasonal = INITIAL_ANIME_DATA.filter(a => a.status === 'Currently Airing');
  }

  // Trending Grid (2 hàng x 6 ô = 12 ô)
  const trendingGrid = document.getElementById('trending-grid');
  trendingGrid.innerHTML = '';
  groupSeries(state.trending).slice(0, 12).forEach(anime => trendingGrid.appendChild(renderCard(anime)));

  // Recent Grid (2 hàng x 6 ô = 12 ô)
  const recentGrid = document.getElementById('recent-grid');
  recentGrid.innerHTML = '';
  groupSeries(state.recent).slice(0, 12).forEach(anime => recentGrid.appendChild(renderCard(anime)));

  // Seasonal Grid (2 hàng x 6 ô = 12 ô)
  const seasonalGrid = document.getElementById('seasonal-grid');
  seasonalGrid.innerHTML = '';
  groupSeries(state.seasonal).slice(0, 12).forEach(anime => seasonalGrid.appendChild(renderCard(anime)));

  for (const id of ['trending-grid','recent-grid','seasonal-grid']) {
    const grid = document.getElementById(id);
    if (!grid.children.length) grid.textContent = 'Chưa có dữ liệu phù hợp từ KKPhim.';
  }
  // 1. Trending controls
  const viewAllTrending = document.getElementById('view-all-trending');
  viewAllTrending?.addEventListener('click', () => {
    trendingGrid.innerHTML = '';
    groupSeries(state.trending).forEach(anime => trendingGrid.appendChild(renderCard(anime)));
    viewAllTrending.textContent = 'Đang hiển thị tất cả';
    viewAllTrending.disabled = true;
    viewAllTrending.style.opacity = '0.6';
    showToast(`Đã mở rộng hiển thị ${trendingGrid.children.length} anime.`);
  });

  // 2. Recent controls
  const viewAllRecent = document.getElementById('view-all-recent');
  const more = document.getElementById('load-more-anime');
  let page = 1;
  const loadMoreRecent = async () => {
    if (!more) return;
    more.disabled = true;
    more.textContent = 'Đang tải...';
    try {
      const response = await fetch('/api/catalog?page=' + (page + 1));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error();
      page++;
      state.recent.push(...data.data);
      const groups = groupSeries(state.recent);
      const existing = new Map([...recentGrid.children].map(card => [card.dataset.seriesKey, card]));
      for (const anime of groups) {
        const card = existing.get(seriesKey(anime));
        if (!card) recentGrid.appendChild(renderCard(anime));
        else card.querySelector('.anime-card-sub').textContent = `${anime.studio} · ${anime.year}${anime.seasons.length > 1 ? ` · ${anime.seasons.length} mùa` : ''}`;
      }
      more.hidden = page >= data.pagination.totalPages || !data.data.length;
    } catch { showToast('Không tải được thêm phim. Hãy thử lại.'); }
    more.disabled = false;
    more.textContent = 'Xem thêm anime';
  };
  more?.addEventListener('click', loadMoreRecent);
  viewAllRecent?.addEventListener('click', () => {
    recentGrid.innerHTML = '';
    groupSeries(state.recent).forEach(anime => recentGrid.appendChild(renderCard(anime)));
    void loadMoreRecent();
  });

  // 3. Seasonal (Tâm lý & Tình cảm) controls
  const viewAllSeasonal = document.getElementById('view-all-seasonal');
  const loadMoreSeasonal = document.getElementById('load-more-seasonal');
  let seasonalPage = 1;
  const loadMoreSeasonalFn = async () => {
    if (!loadMoreSeasonal) return;
    loadMoreSeasonal.disabled = true;
    loadMoreSeasonal.textContent = 'Đang tải phim...';
    try {
      const moreItems = await LinimeAPI.getSeasonal(seasonalPage + 1);
      if (!moreItems.length) {
        loadMoreSeasonal.hidden = true;
        showToast('Đã tải hết phim tâm lý & tình cảm.');
        return;
      }
      seasonalPage++;
      state.seasonal.push(...moreItems);
      const groups = groupSeries(state.seasonal);
      const existing = new Map([...seasonalGrid.children].map(card => [card.dataset.seriesKey, card]));
      for (const anime of groups) {
        const card = existing.get(seriesKey(anime));
        if (!card) seasonalGrid.appendChild(renderCard(anime));
        else card.querySelector('.anime-card-sub').textContent = `${anime.studio} · ${anime.year}${anime.seasons.length > 1 ? ` · ${anime.seasons.length} mùa` : ''}`;
      }
      showToast(`Đã tải thêm phim. Tổng cộng: ${seasonalGrid.children.length} anime.`);
    } catch {
      showToast('Không tải được thêm phim tâm lý & tình cảm.');
    } finally {
      loadMoreSeasonal.disabled = false;
      loadMoreSeasonal.textContent = 'Xem thêm anime tâm lý & tình cảm';
    }
  };
  loadMoreSeasonal?.addEventListener('click', loadMoreSeasonalFn);
  viewAllSeasonal?.addEventListener('click', () => {
    seasonalGrid.innerHTML = '';
    groupSeries(state.seasonal).forEach(anime => seasonalGrid.appendChild(renderCard(anime)));
    void loadMoreSeasonalFn();
  });
  renderGenreRails();
  await loadContinueWatching();
}

function initMovies() {
  const grid = document.getElementById('movies-grid');
  const button = document.getElementById('load-more-movies');
  const status = document.getElementById('movies-status');
  let page = 0, loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    button.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang tải phim lẻ…';
    try {
      const result = await LinimeAPI.getMovies(page + 1);
      const existing = new Set(state.movies.map(movie => movie.id));
      const movies = result.data.filter(movie => !existing.has(movie.id));
      movies.forEach(movie => grid.appendChild(renderCard(movie)));
      state.movies.push(...movies);
      page++;
      status.textContent = state.movies.length ? `Đã hiển thị ${state.movies.length} phim lẻ.` : 'Chưa có phim lẻ. Hãy quay lại sau.';
      button.hidden = !result.pagination?.hasMore;
      button.textContent = 'Xem thêm phim lẻ';
    } catch {
      status.textContent = 'Không tải được phim lẻ. Vui lòng thử lại.';
      button.hidden = false;
      button.textContent = 'Thử lại';
    } finally {
      loading = false;
      button.disabled = false;
      grid.setAttribute('aria-busy', 'false');
    }
  }
  button.addEventListener('click', load);
  void load();
}

function renderGenreRails() {
  const actionRail = document.getElementById('genre-action-rail');
  const romanceRail = document.getElementById('genre-romance-rail');

  const actionAnimes = state.genres['Action'] || INITIAL_ANIME_DATA.filter(a => a.genres.includes('Action'));
  const romanceAnimes = state.genres['Romance'] || INITIAL_ANIME_DATA.filter(a => a.genres.includes('Romance') || a.genres.includes('Drama'));

  actionRail.innerHTML = '';
  groupSeries(actionAnimes).forEach(anime => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.innerHTML = `
      <img class="genre-card-backdrop" src="${anime.bannerImage || anime.coverImage}" alt="${anime.title.english}">
      <div class="genre-card-shade"></div>
      ${anime.logo ? `<img class="genre-card-logo" src="${anime.logo}" alt="Logo">` : ''}
      <h4 class="genre-card-title">${anime.title.english}</h4>
    `;
    const cardLogo = card.querySelector('.genre-card-logo');
    if (cardLogo) {
      cardLogo.style.visibility = 'hidden';
      cardLogo.onload = () => { cardLogo.style.visibility = 'visible'; };
      cardLogo.onerror = () => { cardLogo.style.display = 'none'; };
      if (cardLogo.complete && cardLogo.naturalWidth) cardLogo.style.visibility = 'visible';
    }
    card.addEventListener('click', () => openAnimeDetail(anime.id));
    actionRail.appendChild(card);
  });

  romanceRail.innerHTML = '';
  groupSeries(romanceAnimes).forEach(anime => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.innerHTML = `
      <img class="genre-card-backdrop" src="${anime.bannerImage || anime.coverImage}" alt="${anime.title.english}">
      <div class="genre-card-shade"></div>
      ${anime.logo ? `<img class="genre-card-logo" src="${anime.logo}" alt="Logo">` : ''}
      <h4 class="genre-card-title">${anime.title.english}</h4>
    `;
    card.addEventListener('click', () => openAnimeDetail(anime.id));
    romanceRail.appendChild(card);
  });

  // Rail scroll buttons
  document.getElementById('rail-action-prev')?.addEventListener('click', () => actionRail.scrollBy({ left: -320, behavior: 'smooth' }));
  document.getElementById('rail-action-next')?.addEventListener('click', () => actionRail.scrollBy({ left: 320, behavior: 'smooth' }));
  document.getElementById('rail-romance-prev')?.addEventListener('click', () => romanceRail.scrollBy({ left: -320, behavior: 'smooth' }));
  document.getElementById('rail-romance-next')?.addEventListener('click', () => romanceRail.scrollBy({ left: 320, behavior: 'smooth' }));
}

async function loadContinueWatching() {
  const section = document.getElementById('section-continue-watching');
  const grid = document.getElementById('continue-watching-grid');

  let history = [];
  try {
    history = await LinimeAPI.getHistory();
  } catch {
    history = [];
  }

  if (!history || history.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = '';

  history.forEach(item => {
    const anime = item.anime;
    if (!anime) return;

    const progressPercent = Math.min(100, Math.floor((item.currentTime / (item.duration || 1440)) * 100));

    const card = document.createElement('div');
    card.className = 'cw-card';
    card.innerHTML = `
      <img class="cw-thumbnail" src="${anime.coverImage}" alt="${anime.title.english}">
      <div class="cw-info">
        <h4 class="cw-title">${anime.title.english}</h4>
        <span class="cw-ep">Tập ${item.episodeNumber} · ${formatTime(item.currentTime)}</span>
        <div class="cw-progress-bar">
          <div class="cw-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      </div>
    `;

    card.addEventListener('click', async () => {
      const fullAnime = await LinimeAPI.getAnimeDetail(item.animeId);
      if (fullAnime) openPlayer(fullAnime, 0, item.currentTime);
    });

    grid.appendChild(card);
  });
}

// ==========================================
// ANIME DETAIL VIEW (1:1 VỚI BẢN ONE PIECE TRONG ẢNH)
// ==========================================
let detailRequest = 0;
async function openAnimeDetail(animeId) {
  const request = ++detailRequest;
  let anime = await LinimeAPI.getAnimeDetail(animeId);
  if (request !== detailRequest) return;
  if (!anime) {
    anime = INITIAL_ANIME_DATA.find(a => a.id === animeId);
  }
  if (!anime) return;

  state.currentDetailAnime = anime;
  void loadSeasonSelector(anime, request);
  const view = document.getElementById('detail-view');

  // Fill in Header & Posters
  document.getElementById('detail-bg-img').src = anime.bannerImage || anime.coverImage;
  document.getElementById('detail-poster-img').src = anime.coverImage;

  // Eyebrow
  document.getElementById('detail-score-val').textContent = anime.score;
  document.getElementById('detail-studio-badge').textContent = anime.studio;

  const genreContainer = document.getElementById('detail-genres-list');
  genreContainer.innerHTML = '';
  anime.genres.forEach(g => {
    const pill = document.createElement('span');
    pill.className = 'detail-genre-tag';
    pill.textContent = g;
    genreContainer.appendChild(pill);
  });

  // Show a readable title until a valid logo has loaded.
  const logoImg = document.getElementById('detail-logo-img');
  const titleLabel = document.getElementById('detail-sub-title');
  titleLabel.textContent = anime.title.english || anime.title.vietnamese;
  titleLabel.classList.add('title-fallback');
  logoImg.style.display = 'none';
  logoImg.onload = () => {
    logoImg.style.display = 'block';
    titleLabel.classList.remove('title-fallback');
  };
  logoImg.onerror = () => {
    logoImg.style.display = 'none';
    titleLabel.classList.add('title-fallback');
  };
  if (anime.logo) {
    logoImg.alt = titleLabel.textContent;
    logoImg.src = anime.logo;
  } else {
    logoImg.removeAttribute('src');
  }

  // Stats bar
  document.getElementById('stat-format').textContent = anime.format;
  document.getElementById('stat-duration').textContent = anime.duration;
  document.getElementById('stat-status').textContent = anime.status;

  // Quick metadata
  document.getElementById('meta-start').textContent = anime.startDate || `${anime.year}`;
  document.getElementById('meta-status').textContent = anime.status;
  document.getElementById('meta-format').textContent = anime.format;
  document.getElementById('meta-duration').textContent = anime.duration;
  document.getElementById('meta-studio').textContent = anime.studio;
  document.getElementById('meta-season').textContent = anime.season || `${anime.year}`;

  // Bookmark status
  updateDetailBookmarkBtn(anime.id);

  // Synopsis
  document.getElementById('detail-synopsis-text').textContent = anime.description;

  // Countdown timer card setup (Tập X sẽ phát hành sau)
  setupCountdown(anime);

  // Episodes List from API
  try {
    const epData = await LinimeAPI.getEpisodes(anime.id);
    if (request !== detailRequest) return;
    state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
  } catch {
    state.currentEpisodes = anime.episodes || [];
  }
  renderDetailEpisodes(state.currentEpisodes);

  // Show View
  view.classList.add('active');
  document.body.style.overflow = 'hidden';
}

async function loadSeasonSelector(anime, request) {
  const section = document.getElementById('detail-seasons');
  const list = document.getElementById('detail-season-list');
  const status = document.getElementById('detail-season-status');
  section.hidden = anime.isMovie;
  list.replaceChildren();
  if (anime.isMovie) return;
  status.textContent = 'Đang tìm các mùa của phim…';
  try {
    const response = await fetch(`/api/anime/${encodeURIComponent(anime.id)}/seasons`);
    const result = await response.json();
    if (request !== detailRequest) return;
    if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error();
    status.textContent = result.data.length > 1 ? `${result.data.length} mùa · Chọn mùa để xem danh sách tập` : 'Hiện có 1 mùa';
    for (const season of result.data) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'season-option';
      button.dataset.animeId = season.id;
      button.textContent = `Mùa ${seasonNumber(season)}${season.year ? ` · ${season.year}` : ''}`;
      button.title = season.title.vietnamese || season.title.english;
      button.setAttribute('aria-pressed', String(season.id === anime.id));
      button.addEventListener('click', async () => {
        if (season.id === state.currentDetailAnime?.id) return;
        button.disabled = true;
        status.textContent = 'Đang chuyển mùa…';
        await openAnimeDetail(season.id);
        if (request === detailRequest || state.currentDetailAnime?.id !== season.id) {
          button.disabled = false;
          status.textContent = 'Không tải được mùa này. Hãy thử lại.';
        }
      });
      list.appendChild(button);
    }
  } catch {
    if (request !== detailRequest) return;
    status.textContent = 'Không tải được các mùa phim.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'season-option';
    retry.textContent = 'Thử lại';
    retry.addEventListener('click', () => loadSeasonSelector(anime, request));
    list.appendChild(retry);
  }
}

function updateDetailBookmarkBtn(animeId) {
  const isSaved = state.watchlistIds.includes(animeId);
  const text = document.getElementById('detail-bookmark-text');
  if (text) text.textContent = isSaved ? 'Đã lưu vào danh sách' : 'Thêm vào danh sách';
}

function setupCountdown(anime) {
  const countdownCard = document.getElementById('detail-countdown-card');
  const title = document.getElementById('countdown-title');
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');

  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
  }

  if (!anime.nextAiring) {
    countdownCard.style.display = 'none';
    return;
  }

  countdownCard.style.display = 'flex';
  title.textContent = `Tập ${anime.nextAiring.episode} sẽ phát hành sau`;

  const targetTime = anime.nextAiring.airingAt || (Date.now() + (anime.nextAiring.airingOffsetSeconds || 86400) * 1000);

  function update() {
    const now = Date.now();
    const diff = Math.max(0, targetTime - now);

    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    daysEl.textContent = String(days).padStart(2, '0');
    hoursEl.textContent = String(hours).padStart(2, '0');
    minsEl.textContent = String(mins).padStart(2, '0');
    secsEl.textContent = String(secs).padStart(2, '0');
  }

  update();
  state.countdownInterval = setInterval(update, 1000);
}

function renderDetailEpisodes(episodes, filterQuery = '') {
  const grid = document.getElementById('detail-episodes-grid');
  const title = document.getElementById('episodes-count-title');
  grid.innerHTML = '';

  title.textContent = `Danh sách tập (${episodes.length} tập)`;

  const filtered = episodes.filter(ep => 
    String(ep.number).includes(filterQuery) || ep.title.toLowerCase().includes(filterQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; color: var(--text-muted); text-align: center;">Không tìm thấy tập phù hợp.</div>`;
    return;
  }

  filtered.forEach((ep, idx) => {
    const item = document.createElement('div');
    item.className = 'episode-item';
    item.innerHTML = `
      <span class="ep-num">${ep.number}</span>
      <span class="ep-title">${ep.title}</span>
      <span class="ep-play-icon">▶</span>
    `;

    item.addEventListener('click', () => {
      openPlayer(state.currentDetailAnime, idx);
    });

    grid.appendChild(item);
  });
}

function initDetailEvents() {
  document.getElementById('close-detail-btn')?.addEventListener('click', () => {
    detailRequest++;
    document.getElementById('detail-view')?.classList.remove('active');
    document.body.style.overflow = '';
    if (state.countdownInterval) clearInterval(state.countdownInterval);
  });

  document.getElementById('copy-title-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) {
      const name = state.currentDetailAnime.title.english || state.currentDetailAnime.title.vietnamese;
      navigator.clipboard.writeText(name);
      showToast(`Đã sao chép: "${name}"`);
    }
  });

  document.getElementById('detail-play-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) openPlayer(state.currentDetailAnime, 0);
  });

  document.getElementById('detail-bookmark-btn')?.addEventListener('click', async () => {
    if (state.currentDetailAnime) {
      const res = await LinimeAPI.toggleWatchlist(state.currentDetailAnime.id);
      await refreshWatchlistCount();
      updateDetailBookmarkBtn(state.currentDetailAnime.id);
      showToast(res.message || 'Cập nhật danh sách yêu thích');
    }
  });

  document.getElementById('detail-share-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Đã sao chép liên kết chia sẻ!');
  });

  document.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      document.getElementById('tab-episodes').style.display = target === 'episodes' ? 'block' : 'none';
      document.getElementById('tab-synopsis').style.display = target === 'synopsis' ? 'block' : 'none';
      document.getElementById('tab-related').style.display = target === 'related' ? 'block' : 'none';
    });
  });

  document.getElementById('episode-search-input')?.addEventListener('input', (e) => {
    renderDetailEpisodes(state.currentEpisodes, e.target.value.trim());
  });
}

// ==========================================
// CINEMA VIDEO PLAYER (KKPHIM EMBED)
// ==========================================
let streamRequest = 0;
let lastProgressSave = 0;
let activeProvider = 'KKPhim';
let activeLanguage = 'sub';


async function openPlayer(anime, episodeIndex = 0, resumeTime = 0) {
  state.currentVideoAnime = anime;
  state.currentEpisodeIndex = episodeIndex;

  const modal = document.getElementById('player-modal');
  const title = document.getElementById('player-anime-name');
  const epHeading = document.getElementById('current-ep-heading');

  // Đảm bảo nạp đầy đủ danh sách tập từ API nếu chưa có
  if (!state.currentEpisodes.length || state.currentDetailAnime?.id !== anime.id) {
    try {
      const epData = await LinimeAPI.getEpisodes(anime.id);
      state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
    } catch {
      state.currentEpisodes = anime.episodes || [];
    }
  }

  if (!state.currentEpisodes.length) {
    showToast('KKPhim chưa có tập Vietsub cho phim này.');
    return;
  }

  const episode = state.currentEpisodes[episodeIndex] || state.currentEpisodes[0];
  const epNum = episode.number || (episodeIndex + 1);
  title.textContent = `${anime.title.english || anime.title.vietnamese} — ${episode.title || `Tập ${epNum}`}`;
  if (epHeading) epHeading.textContent = episode.title || `Tập ${epNum}`;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Nạp iframe KKPhim từ máy chủ
  await loadLiveAnimeStream(anime.id, epNum, activeProvider, activeLanguage, resumeTime);
}

async function loadLiveAnimeStream(animeId, episodeNumber, provider, language, resumeTime = 0) {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const controls = document.getElementById('player-controls');

  const requestId = ++streamRequest;
  lastProgressSave = 0;
  video.pause();
  video.removeAttribute('src');
  video.style.display = 'none';
  iframe.removeAttribute('src');
  iframe.style.display = 'none';
  if (controls) controls.style.display = 'none';
  document.getElementById('player-notice-banner')?.remove();
  showToast('Đang tải nguồn KKPhim • Vietsub...');
  try {
    const res = await fetch('/api/watch/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anime_id: animeId, episode_number: episodeNumber, language, provider })
    });
    const data = await res.json();
    if (requestId !== streamRequest) return;
    if (!res.ok || !data.success || data.type !== 'embed') throw new Error(data.message || 'Tập hoặc ngôn ngữ này chưa có nguồn phát.');
    const url = new URL(data.embed_url);
    if (url.origin !== ('https://player.phimapi.com')) throw new Error('Địa chỉ trình phát không hợp lệ.');
    document.getElementById('player-source-label').textContent = 'KKPhim • Phụ đề Việt';
    iframe.src = url.href;
    iframe.style.display = 'block';
    LinimeAPI.saveProgress(animeId, episodeNumber, 0, 0);
    // KKPhim owns playback controls; its public API does not document seeking.
    if (resumeTime > 0) showToast('Chọn vị trí xem tiếp trong trình phát.');
  } catch (err) {
    if (requestId === streamRequest) showPlayerNotice(err.message);
  }
}

function showPlayerNotice(message) {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const controls = document.getElementById('player-controls');
  const container = document.getElementById('video-container');

  if (video) {
    video.pause();
    video.style.display = 'none';
  }
  if (iframe) {
    iframe.style.display = 'none';
    iframe.src = '';
  }
  if (controls) controls.style.display = 'none';

  let notice = document.getElementById('player-notice-banner');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'player-notice-banner';
    notice.className = 'player-notice-banner';
    container.appendChild(notice);
  }

  notice.innerHTML = `
    <div class="notice-card">
      <div class="notice-icon">⚠️</div>
      <h3 class="notice-title">Thông Báo Nguồn Phát</h3>
      <p class="notice-desc"></p>
      <div class="notice-actions">
        <button class="notice-retry-btn" id="notice-retry-btn">Thử lại</button>
      </div>
    </div>
  `;
  notice.querySelector('.notice-desc').textContent = message;
  notice.style.display = 'flex';

  document.getElementById('notice-retry-btn')?.addEventListener('click', () => {
    notice.style.display = 'none';
    const altProv = activeProvider;
    document.querySelectorAll('.prov-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === altProv);
    });
    activeProvider = altProv;
    if (state.currentVideoAnime) {
      loadLiveAnimeStream(state.currentVideoAnime.id, state.currentEpisodes[state.currentEpisodeIndex]?.number || 1, altProv, activeLanguage, 0);
    }
  });
}

function initPlayerControls() {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const modal = document.getElementById('player-modal');
  const playBtn = document.getElementById('play-pause-btn');
  const progressBar = document.getElementById('video-progress-bar');
  const progressFill = document.getElementById('video-progress-fill');
  const timeDisplay = document.getElementById('video-time');
  const speedBtn = document.getElementById('speed-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // Nút Tập trước / Tập tiếp theo (Dưới player)
  document.getElementById('nav-next-ep')?.addEventListener('click', () => {
    const epList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime?.episodes || []);
    if (state.currentVideoAnime && state.currentEpisodeIndex < epList.length - 1) {
      openPlayer(state.currentVideoAnime, state.currentEpisodeIndex + 1);
    } else {
      showToast('Đang ở tập mới nhất');
    }
  });

  document.getElementById('nav-prev-ep')?.addEventListener('click', () => {
    const epList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime?.episodes || []);
    if (state.currentVideoAnime && state.currentEpisodeIndex > 0) {
      openPlayer(state.currentVideoAnime, state.currentEpisodeIndex - 1);
    } else {
      showToast('Đang ở tập đầu tiên');
    }
  });

  // Tắt đèn / Theater Mode
  document.getElementById('btn-light')?.addEventListener('click', () => {
    modal.classList.toggle('light-off');
    showToast(modal.classList.contains('light-off') ? 'Đã tắt đèn làm dịu mắt' : 'Đã bật đèn');
  });

  // Đóng player
  document.getElementById('close-player-btn')?.addEventListener('click', async () => {
    ++streamRequest;
    video.pause();
    video.src = '';
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
    await loadContinueWatching();
  });

  playBtn?.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      updatePlayPauseIcon(true);
    } else {
      video.pause();
      updatePlayPauseIcon(false);
    }
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      progressFill.style.width = `${pct}%`;
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;

      // Sync progress to API every 5 seconds
      if (Math.floor(video.currentTime) % 5 === 0 && state.currentVideoAnime) {
        const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
        const episode = episodeList[state.currentEpisodeIndex];
        LinimeAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
      }
    }
  });

  progressBar?.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  });

  const speeds = [1, 1.25, 1.5, 2, 0.75];
  let speedIdx = 0;
  speedBtn?.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const s = speeds[speedIdx];
    video.playbackRate = s;
    speedBtn.textContent = `${s}x`;
  });

  fullscreenBtn?.addEventListener('click', () => {
    const container = document.getElementById('video-container');
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

function updatePlayPauseIcon(isPlaying) {
  const icon = document.getElementById('play-icon');
  if (!icon) return;
  if (isPlaying) {
    icon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
  } else {
    icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// LIVE SEARCH MODAL (API SEARCH)
// ==========================================
function initSearchModal() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('live-search-input');
  const resultsContainer = document.getElementById('search-results-list');

  function openSearch() {
    modal.classList.add('active');
    input.focus();
    renderSearchResults('');
  }

  function closeSearch() {
    modal.classList.remove('active');
  }

  document.getElementById('open-search-btn')?.addEventListener('click', openSearch);
  document.getElementById('close-search-btn')?.addEventListener('click', closeSearch);

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeSearch();
    }
  });

  let debounceTimer = null;
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderSearchResults(e.target.value.trim());
    }, 200);
  });

  async function renderSearchResults(query) {
    resultsContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">Đang tìm kiếm...</div>`;

    const results = await LinimeAPI.search(query);

    if (results.length === 0) {
      resultsContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">Không tìm thấy anime phù hợp với từ khóa "${query}"</div>`;
      return;
    }

    resultsContainer.innerHTML = '';
    results.forEach(anime => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <img class="search-result-thumb" src="${anime.coverImage}" alt="${anime.title.english}">
        <div class="search-result-info">
          <span class="search-result-title">${anime.title.english}</span>
          <span class="search-result-meta">★ ${anime.score} · ${anime.format} · ${anime.genres.slice(0, 3).join(', ')}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        closeSearch();
        openAnimeDetail(anime.id);
      });

      resultsContainer.appendChild(item);
    });
  }
}

// ==========================================
// WATCHLIST DRAWER (API POWERED)
// ==========================================
function initWatchlistDrawer() {
  const modal = document.getElementById('watchlist-modal');
  const listEl = document.getElementById('watchlist-items-list');

  async function openWatchlist() {
    await renderWatchlistItems();
    modal.classList.add('active');
  }

  function closeWatchlist() {
    modal.classList.remove('active');
  }

  document.getElementById('open-watchlist-btn')?.addEventListener('click', openWatchlist);
  document.getElementById('close-watchlist-btn')?.addEventListener('click', closeWatchlist);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeWatchlist();
  });

  async function renderWatchlistItems() {
    listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải danh sách...</div>`;
    const list = await LinimeAPI.getWatchlist();

    if (list.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 40px 10px; color: var(--text-muted);">Bạn chưa lưu anime nào vào danh sách xem sau.</div>`;
      return;
    }

    listEl.innerHTML = '';
    list.forEach(anime => {
      const item = document.createElement('div');
      item.className = 'cw-card';
      item.innerHTML = `
        <img class="cw-thumbnail" src="${anime.coverImage}" alt="${anime.title.english}">
        <div class="cw-info">
          <h4 class="cw-title">${anime.title.english}</h4>
          <span class="cw-ep">★ ${anime.score} · ${anime.format}</span>
        </div>
        <button class="icon-btn" style="width: 32px; height: 32px; margin-left: auto;" title="Xóa">✕</button>
      `;

      item.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        await LinimeAPI.toggleWatchlist(anime.id);
        await refreshWatchlistCount();
        await renderWatchlistItems();
        showToast(`Đã xóa "${anime.title.english}" khỏi danh sách`);
      });

      item.addEventListener('click', () => {
        closeWatchlist();
        openAnimeDetail(anime.id);
      });

      listEl.appendChild(item);
    });
  }
}

// ==========================================
// LOGIN & SESSION MODAL (API POWERED)
// ==========================================
function initLoginModal() {
  const modal = document.getElementById('login-modal');
  document.getElementById('open-login-btn')?.addEventListener('click', () => {
    modal.classList.add('active');
  });

  document.getElementById('close-login-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  document.getElementById('google-login-btn')?.addEventListener('click', async () => {
    const res = await LinimeAPI.login({
      provider: 'google',
      name: 'Luffy Mũ Rơm',
      email: 'luffy@onepiece.strawhat'
    });

    if (res.success) {
      state.user = res.user;
      localStorage.setItem('linime_user', JSON.stringify(state.user));
      updateUserUI();
      modal.classList.remove('active');
      showToast(`Đăng nhập thành công! Chào mừng ${res.user.name}`);
    }
  });
}

// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initMovies();
  initHeader();
  await refreshWatchlistCount();
  await loadSpotlight();
  await loadCatalogs();
  initDetailEvents();
  initPlayerControls();
  initSearchModal();
  initWatchlistDrawer();
  initLoginModal();
});
