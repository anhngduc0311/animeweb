import { LinimeAPI } from './api.js';
import { groupSeries, seriesKey, seasonNumber } from '../../../shared/series.js';
import { router } from './router.js';
const INITIAL_ANIME_DATA = []; // No sample catalog fallback for live AniDoki data.

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
// SPA VIEW SWITCHER & MODALS
// ==========================================
function switchView(viewId) {
  // Đóng detail và player modal nếu đang mở
  document.getElementById('detail-view')?.classList.remove('active');
  document.getElementById('player-modal')?.classList.remove('active');
  document.body.style.overflow = '';

  // Ẩn tất cả các view trang chính
  document.querySelectorAll('.app-view').forEach(view => {
    if (view.id === 'detail-view' || view.id === 'player-modal') return;
    view.style.display = 'none';
    view.classList.remove('active');
  });

  const target = document.getElementById(viewId);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
  }
}

function showConfirmModal({ title, message, onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const okBtn = document.getElementById('confirm-ok-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  if (titleEl) titleEl.textContent = title || 'Xác nhận';
  if (msgEl) msgEl.textContent = message || '';

  const cleanup = () => {
    modal.classList.remove('active');
    if (okBtn) okBtn.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
  };

  if (okBtn) {
    okBtn.onclick = () => {
      cleanup();
      if (onConfirm) onConfirm();
    };
  }

  if (cancelBtn) cancelBtn.onclick = cleanup;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) cleanup();
    };
    modal.classList.add('active');
  }
}

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
      if (link.id === 'genre-toggle') return;
      document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      closeMenu();
    });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  updateUserUI();
}

function initGenreDropdown() {
  const toggle = document.getElementById('genre-toggle');
  const form = document.getElementById('genre-dropdown');
  const options = document.getElementById('genre-options');
  const optionsStatus = document.getElementById('genre-options-status');
  const retryOptions = document.getElementById('genre-options-retry');
  const apply = document.getElementById('genre-apply');
  const count = document.getElementById('genre-count');
  const section = document.getElementById('section-genre-results');
  const grid = document.getElementById('genre-results-grid');
  const status = document.getElementById('genre-results-status');
  const more = document.getElementById('genre-results-more');
  let loaded = false, loadingOptions = false, selected = [], page = 0, busy = false, generation = 0;
  const close = (focus = false) => {
    form.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus();
  };
  const chosen = () => [...options.querySelectorAll('input:checked')];
  const sync = () => {
    const size = chosen().length;
    count.hidden = size === 0;
    count.textContent = String(size);
    apply.disabled = size === 0;
  };
  async function loadOptions() {
    if (loaded || loadingOptions) return;
    loadingOptions = true;
    retryOptions.hidden = true;
    optionsStatus.textContent = 'Đang tải thể loại…';
    try {
      const response = await fetch('/api/genre-options');
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error();
      options.replaceChildren();
      result.data.forEach(genre => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = genre.slug;
        input.dataset.label = genre.name;
        label.append(input, document.createTextNode(genre.name));
        options.appendChild(label);
      });
      loaded = true;
      optionsStatus.textContent = '';
    } catch {
      optionsStatus.textContent = 'Không tải được thể loại.';
      retryOptions.hidden = false;
    } finally { loadingOptions = false; }
  }
  toggle.addEventListener('click', () => {
    if (!form.hidden) return close();
    form.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    void loadOptions();
  });
  options.addEventListener('change', sync);
  retryOptions.addEventListener('click', loadOptions);
  document.getElementById('genre-reset').addEventListener('click', () => {
    chosen().forEach(input => { input.checked = false; });
    sync();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-genres')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !form.hidden) close(true);
  });
  async function loadResults(reset = false) {
    if (busy && !reset) return;
    const request = ++generation;
    busy = true;
    more.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang tìm anime…';
    try {
      const params = new URLSearchParams({ categories: selected.join(','), page: reset ? 1 : page + 1, limit: 12 });
      const response = await fetch('/api/anime/by-genres?' + params);
      const result = await response.json();
      if (request !== generation) return;
      if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error();
      const existing = new Set([...grid.children].map(card => card.dataset.seriesKey));
      result.data.filter(anime => !existing.has(seriesKey(anime))).forEach(anime => grid.appendChild(renderCard(anime)));
      page = result.pagination.page;
      status.textContent = grid.children.length ? `Đã hiển thị ${grid.children.length} anime.` : 'Không tìm thấy anime có đủ các thể loại đã chọn. Hãy thử thay đổi lựa chọn.';
      more.hidden = !result.pagination.hasMore;
      more.textContent = 'Xem thêm anime';
    } catch {
      if (request !== generation) return;
      status.textContent = 'Không tải được phim. Hãy thử lại.';
      more.hidden = false;
      more.textContent = 'Thử lại';
    } finally {
      if (request === generation) {
        busy = false;
        more.disabled = false;
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const inputs = chosen();
    if (!inputs.length) return;
    const slugs = inputs.map(input => input.value).join(',');
    close();
    document.getElementById('site-header').classList.remove('menu-open');
    document.getElementById('mobile-toggle-btn').setAttribute('aria-expanded', 'false');
    router.navigate('/browse?category=' + encodeURIComponent(slugs));
  });
  more.addEventListener('click', () => loadResults());
  document.getElementById('genre-clear-filter').addEventListener('click', () => {
    generation++;
    busy = false;
    selected = [];
    section.hidden = true;
    grid.replaceChildren();
    chosen().forEach(input => { input.checked = false; });
    sync();
    toggle.classList.remove('active');
    document.querySelector('[data-nav="home"]').classList.add('active');
  });
}

async function refreshWatchlistCount() {
  const badge = document.getElementById('watchlist-count');
  if (!LinimeAPI.getToken()) {
    state.watchlistIds = [];
    if (badge) badge.textContent = '0';
    return;
  }
  try {
    const list = await LinimeAPI.getWatchlist();
    state.watchlistIds = list.map(a => a.id);
    if (badge) badge.textContent = list.length;
  } catch {
    if (badge) badge.textContent = state.watchlistIds.length;
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
    document.getElementById('spotlight-title').textContent = 'Chưa tải được phim từ AniDoki';
    document.getElementById('spotlight-desc').textContent = 'Vui lòng tải lại trang để thử kết nối lại.';
    document.querySelectorAll('.spotlight-actions button').forEach(button => { button.disabled = true; });
  }
  setSpotlightSlide(0);
  startSpotlightTimer();

  // Button actions
  document.getElementById('spotlight-watch-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) router.navigate(`/watch/${anime.id}/1`);
  });

  document.getElementById('spotlight-detail-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) router.navigate(`/anime/${anime.id}`);
  });

  document.getElementById('spotlight-bookmark-btn')?.addEventListener('click', async () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (!anime) return;
    if (!LinimeAPI.getToken()) {
      showToast('Vui lòng đăng nhập để lưu phim vào danh sách yêu thích');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    const res = await LinimeAPI.toggleWatchlist(anime.id);
    if (res.code === 'UNAUTHORIZED' || res.code === 'SESSION_EXPIRED') {
      showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    await refreshWatchlistCount();
    showToast(res.message || 'Cập nhật danh sách yêu thích');
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
  card.dataset.animeId = anime.id || '';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const engTitle = anime.title?.english || (typeof anime.title === 'string' ? anime.title : '');
  const vieTitle = anime.title?.vietnamese || '';
  const mainTitle = engTitle || vieTitle || 'Anime';
  const coverSrc = anime.coverImage || anime.posterUrl || anime.poster_url || '/poster-placeholder.svg';
  const scoreText = anime.score ? `★ ${anime.score}` : '';
  const epText = anime.format === 'MOVIE' ? 'Movie' : `Tập ${anime.currentEpisode || anime.totalEpisodes || 'Full'}`;
  const subMeta = [anime.studio, anime.year].filter(Boolean).join(' · ');

  card.setAttribute('aria-label', `Xem chi tiết ${mainTitle}`);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
  });
  card.innerHTML = `
    <div class="anime-card-poster">
      <img src="${coverSrc}" alt="${mainTitle}" loading="lazy" decoding="async">
      <div class="anime-card-badges">
        ${scoreText ? `<span class="badge-score">${scoreText}</span>` : ''}
        <span class="badge-ep">${epText}</span>
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
      <h3 class="anime-card-title">${mainTitle}</h3>
      <span class="anime-card-sub">${subMeta || 'AniDoki'}${anime.seasons?.length > 1 ? ` · ${anime.seasons.length} mùa` : ''}</span>
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
    if (anime.id) {
      router.navigate(`/anime/${anime.id}`);
    }
  });

  return card;
}

async function loadCatalogs() {
  try {
    const [trending, recent, seasonal, genres] = await Promise.all([
      LinimeAPI.getTrendingCatalog().catch(() => null),
      LinimeAPI.getRecentlyUpdated(24),
      LinimeAPI.getSeasonal(),
      LinimeAPI.getGenres()
    ]);

    state.trending = trending?.data || [];
    state.trendingPagination = trending?.pagination || { page: 0, hasMore: true };
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

  // Seasonal Grid (Anime Tâm lý & Tình cảm: sắp xếp năm mới nhất trước, 2 hàng x 6 ô = 12 ô)
  const seasonalGrid = document.getElementById('seasonal-grid');
  const renderSortedSeasonalGrid = (all = false) => {
    seasonalGrid.innerHTML = '';
    const sorted = groupSeries(state.seasonal).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    (all ? sorted : sorted.slice(0, 12)).forEach(anime => seasonalGrid.appendChild(renderCard(anime)));
  };
  renderSortedSeasonalGrid(false);

  for (const id of ['trending-grid','recent-grid','seasonal-grid']) {
    const grid = document.getElementById(id);
    if (!grid.children.length) grid.textContent = 'Chưa có dữ liệu phù hợp từ AniDoki.';
  }
  // 1. Trending controls
  const viewAllTrending = document.getElementById('view-all-trending');
  const moreTrending = document.getElementById('load-more-trending');
  let trendingLoading = false;
  const updateTrendingControls = () => {
    const hasMore = state.trendingPagination?.hasMore ?? true;
    moreTrending.hidden = !hasMore;
    viewAllTrending.hidden = !hasMore;
  };
  updateTrendingControls();
  const loadMoreTrending = async () => {
    if (trendingLoading || state.trendingPagination?.hasMore === false) return;
    trendingLoading = true;
    moreTrending.disabled = viewAllTrending.disabled = true;
    moreTrending.textContent = 'Đang tải…';
    trendingGrid.setAttribute('aria-busy', 'true');
    try {
      const result = await LinimeAPI.getTrendingCatalog((state.trendingPagination?.page || 0) + 1);
      const existing = new Set(state.trending.map(seriesKey));
      const added = result.data.filter(item => !existing.has(seriesKey(item)));
      if (!state.trending.length && added.length) trendingGrid.replaceChildren();
      added.forEach(item => trendingGrid.appendChild(renderCard(item)));
      state.trending.push(...added);
      state.trendingPagination = result.pagination;
      updateTrendingControls();
      showToast(added.length ? `Đã tải thêm ${added.length} anime từ 7 sao trở lên.` : 'Đã hiển thị hết phim thịnh hành.');
    } catch {
      showToast('Không tải được thêm phim thịnh hành. Hãy thử lại.');
    } finally {
      trendingLoading = false;
      moreTrending.disabled = viewAllTrending.disabled = false;
      moreTrending.textContent = 'Xem thêm anime';
      trendingGrid.setAttribute('aria-busy', 'false');
    }
  };
  moreTrending.addEventListener('click', loadMoreTrending);
  viewAllTrending.addEventListener('click', () => {
    router.navigate('/browse?sort=score');
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
    router.navigate('/browse?sort=updated');
  });

  // 3. Seasonal (Tâm lý & Tình cảm) controls - Luôn ưu tiên năm mới nhất trước
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
      renderSortedSeasonalGrid(true);
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
    router.navigate('/browse?category=tam-ly,tinh-cam');
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

  if (!LinimeAPI.getToken()) {
    if (section) section.style.display = 'none';
    if (grid) grid.innerHTML = '';
    return;
  }

  let history = [];
  try {
    const res = await LinimeAPI.getHistory();
    history = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
  } catch {
    history = [];
  }

  if (!Array.isArray(history) || history.length === 0) {
    if (section) section.style.display = 'none';
    if (grid) grid.innerHTML = '';
    return;
  }

  if (section) section.style.display = 'block';
  if (grid) grid.innerHTML = '';

  // Giới hạn tối đa 3 hàng (15 phim cho 5 cột)
  history.slice(0, 15).forEach(item => {
    let anime = item.anime;
    if (typeof anime === 'string') {
      try {
        anime = JSON.parse(anime);
      } catch {
        anime = null;
      }
    }
    anime = anime || {
      id: item.animeId,
      title: { english: item.animeId, vietnamese: item.animeId },
      coverImage: '/poster-placeholder.svg'
    };

    const hasProgress = Number(item.currentTime) > 0 && Number(item.duration) > 0;
    const progressPercent = hasProgress
      ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100))
      : 0;
    const epLabel = hasProgress
      ? `Tập ${item.episodeNumber} · ${formatTime(item.currentTime)}`
      : `Tập ${item.episodeNumber} · Tiếp tục xem`;

    const titleText = anime.title?.english || anime.title?.vietnamese || (typeof anime.title === 'string' ? anime.title : 'Anime');
    const coverSrc = anime.coverImage || anime.posterUrl || anime.poster_url || '/poster-placeholder.svg';

    const card = document.createElement('div');
    card.className = 'cw-card';
    card.innerHTML = `
      <img class="cw-thumbnail" src="${coverSrc}" alt="${titleText}">
      <div class="cw-info">
        <h4 class="cw-title">${titleText}</h4>
        <span class="cw-ep">${epLabel}</span>
        ${hasProgress ? `
          <div class="cw-progress-bar">
            <div class="cw-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        ` : ''}
      </div>
      <button class="cw-delete-item-btn icon-btn" style="width: 28px; height: 28px; margin-left: auto; background: rgba(255,255,255,0.08); border-radius: 50%; font-size: 11px;" title="Xóa">✕</button>
    `;

    card.querySelector('.cw-delete-item-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await LinimeAPI.deleteHistory(item.animeId);
      await loadContinueWatching();
      showToast('Đã xóa khỏi tiếp tục xem');
    });

    card.addEventListener('click', () => {
      router.navigate(`/watch/${item.animeId}/${item.episodeNumber || 1}`);
    });

    grid.appendChild(card);
  });
}


// ==========================================
// ANIME DETAIL VIEW (1:1 VỚI BẢN ONE PIECE TRONG ẢNH)
// ==========================================
let detailRequest = 0;
async function openAnimeDetail(animeId, pushRoute = true) {
  if (pushRoute) {
    router.navigate(`/anime/${animeId}`);
    return;
  }
  const request = ++detailRequest;
  let anime = await LinimeAPI.getAnimeDetail(animeId);
  if (request !== detailRequest) return;
  if (!anime) {
    anime = INITIAL_ANIME_DATA.find(a => a.id === animeId);
  }
  if (!anime) {
    showToast('Không tìm thấy thông tin phim.');
    router.navigate('/');
    return;
  }

  state.currentDetailAnime = anime;
  document.title = `${anime.title.vietnamese || anime.title.english} | anidoki`;
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
  titleLabel.textContent = anime.title.vietnamese || anime.title.english;
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
      button.addEventListener('click', () => {
        if (season.id === state.currentDetailAnime?.id) return;
        router.navigate(`/anime/${season.id}`);
      });
      list.appendChild(button);
    }
  } catch {
    if (request !== detailRequest) return;
    status.textContent = 'Không tải được các mùa phim.';
  }
}

function updateDetailBookmarkBtn(animeId, knownStatus = null) {
  const isSaved = state.watchlistIds.includes(animeId);
  const text = document.getElementById('detail-bookmark-text');
  if (!text) return;
  const statusLabels = {
    plan_to_watch: '📌 Muốn xem',
    watching: '▶ Đang xem',
    completed: '✔ Đã hoàn thành'
  };
  if (knownStatus) {
    text.textContent = statusLabels[knownStatus] || 'Đã lưu thư viện';
  } else {
    text.textContent = isSaved ? 'Đã lưu thư viện' : 'Lưu vào thư viện';
  }
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
    state.countdownInterval = null;
  }

  // CHỈ HIỂN THỊ KHI có dữ liệu nextAiring hợp lệ VÀ thời gian còn trong tương lai
  const targetTime = anime?.nextAiring?.airingAt;
  const now = Date.now();
  if (!targetTime || targetTime <= now) {
    if (countdownCard) countdownCard.style.display = 'none';
    return;
  }

  if (countdownCard) countdownCard.style.display = 'flex';
  if (title) title.textContent = `Tập ${anime.nextAiring.episode || ''} sẽ phát hành sau`;

  function update() {
    const current = Date.now();
    const diff = Math.max(0, targetTime - current);
    if (diff <= 0) {
      if (countdownCard) countdownCard.style.display = 'none';
      if (state.countdownInterval) clearInterval(state.countdownInterval);
      return;
    }

    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
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

  filtered.forEach((ep) => {
    const item = document.createElement('div');
    item.className = 'episode-item';
    item.innerHTML = `
      <span class="ep-num">${ep.number}</span>
      <span class="ep-title">${ep.title}</span>
      <span class="ep-play-icon">▶</span>
    `;

    item.addEventListener('click', () => {
      if (state.currentDetailAnime) {
        router.navigate(`/watch/${state.currentDetailAnime.id}/${ep.number}`);
      }
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      router.navigate('/');
    }
  });

  document.getElementById('copy-title-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) {
      const name = state.currentDetailAnime.title.vietnamese || state.currentDetailAnime.title.english;
      navigator.clipboard.writeText(name);
      showToast(`Đã sao chép: "${name}"`);
    }
  });

  document.getElementById('detail-play-btn')?.addEventListener('click', async () => {
    if (!state.currentDetailAnime) return;
    const anime = state.currentDetailAnime;
    let targetEp = 1;
    if (LinimeAPI.getToken()) {
      try {
        const hist = await LinimeAPI.getHistory();
        const items = Array.isArray(hist) ? hist : (Array.isArray(hist?.data) ? hist.data : []);
        const found = items.find(h => h.animeId === anime.id);
        if (found && found.episodeNumber) {
          targetEp = found.episodeNumber;
        }
      } catch {}
    }
    router.navigate(`/watch/${anime.id}/${targetEp}`);
  });

  const bookmarkBtn = document.getElementById('detail-bookmark-btn');
  const statusMenu = document.getElementById('detail-status-menu');

  bookmarkBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!LinimeAPI.getToken()) {
      showToast('Vui lòng đăng nhập để lưu phim vào thư viện');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    if (statusMenu) statusMenu.hidden = !statusMenu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (statusMenu && !statusMenu.hidden && !statusMenu.contains(e.target) && e.target !== bookmarkBtn) {
      statusMenu.hidden = true;
    }
  });

  statusMenu?.querySelectorAll('button[data-status]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (statusMenu) statusMenu.hidden = true;
      if (!state.currentDetailAnime) return;

      const targetStatus = btn.dataset.status;
      if (targetStatus === 'remove') {
        await LinimeAPI.deleteLibraryItem(state.currentDetailAnime.id);
        state.watchlistIds = state.watchlistIds.filter(id => id !== state.currentDetailAnime.id);
        updateDetailBookmarkBtn(state.currentDetailAnime.id, null);
        await refreshWatchlistCount();
        showToast(`Đã xóa khỏi thư viện`);
      } else {
        const res = await LinimeAPI.updateLibraryStatus(state.currentDetailAnime.id, targetStatus);
        if (res.success) {
          if (!state.watchlistIds.includes(state.currentDetailAnime.id)) {
            state.watchlistIds.push(state.currentDetailAnime.id);
          }
          updateDetailBookmarkBtn(state.currentDetailAnime.id, targetStatus);
          await refreshWatchlistCount();
          const labels = {
            plan_to_watch: 'Muốn xem (Xem sau)',
            watching: 'Đang xem',
            completed: 'Đã hoàn thành'
          };
          showToast(`Đã chuyển trạng thái: ${labels[targetStatus] || targetStatus}`);
        } else {
          showToast(res.message || 'Lỗi cập nhật trạng thái');
        }
      }
    });
  });

  document.getElementById('detail-share-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) {
      const shareUrl = `${window.location.origin}/anime/${state.currentDetailAnime.id}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Đã sao chép liên kết chia sẻ!');
      }).catch(() => {
        showToast(`Liên kết: ${shareUrl}`);
      });
    }
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
// CINEMA VIDEO PLAYER (ANIDOKI EMBED)
// ==========================================
let streamRequest = 0;
let lastProgressSave = 0;
let activeProvider = 'AniDoki';
let activeLanguage = 'sub';


async function openPlayerByRoute(animeId, episodeNumber = 1) {
  // Hide detail view if currently open
  document.getElementById('detail-view')?.classList.remove('active');

  let anime = (state.currentDetailAnime?.id === animeId) ? state.currentDetailAnime : await LinimeAPI.getAnimeDetail(animeId);
  if (!anime) {
    anime = INITIAL_ANIME_DATA.find(a => a.id === animeId);
  }
  if (!anime) {
    showToast('Không tìm thấy thông tin phim để phát.');
    router.navigate('/');
    return;
  }
  state.currentDetailAnime = anime;

  // Nạp danh sách tập nếu chưa có
  if (!state.currentEpisodes.length || state.currentVideoAnime?.id !== animeId) {
    try {
      const epData = await LinimeAPI.getEpisodes(animeId);
      state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
    } catch {
      state.currentEpisodes = anime.episodes || [];
    }
  }

  const epNum = parseInt(episodeNumber, 10) || 1;
  let idx = state.currentEpisodes.findIndex(e => Number(e.number) === epNum);
  if (idx === -1) idx = 0;

  await openPlayer(anime, idx, 0, false);
}

async function openPlayer(anime, episodeIndex = 0, resumeTime = 0, pushRoute = true) {
  state.currentVideoAnime = anime;
  state.currentEpisodeIndex = episodeIndex;

  // Đảm bảo nạp đầy đủ danh sách tập từ API nếu chưa có
  if (!state.currentEpisodes.length || state.currentVideoAnime?.id !== anime.id) {
    try {
      const epData = await LinimeAPI.getEpisodes(anime.id);
      state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
    } catch {
      state.currentEpisodes = anime.episodes || [];
    }
  }

  if (!state.currentEpisodes.length) {
    showToast('AniDoki chưa có tập Vietsub cho phim này.');
    return;
  }

  const episode = state.currentEpisodes[episodeIndex] || state.currentEpisodes[0];
  const epNum = episode.number || (episodeIndex + 1);

  if (pushRoute) {
    router.navigate(`/watch/${anime.id}/${epNum}`);
    return;
  }

  document.getElementById('detail-view')?.classList.remove('active');
  document.title = `${anime.title.vietnamese || anime.title.english} - Tập ${epNum} | anidoki`;

  const modal = document.getElementById('player-modal');
  const title = document.getElementById('player-anime-name');
  const epHeading = document.getElementById('current-ep-heading');

  if (title) title.textContent = `${anime.title.english || anime.title.vietnamese} — ${episode.title || `Tập ${epNum}`}`;
  if (epHeading) epHeading.textContent = episode.title || `Tập ${epNum}`;

  // Cập nhật giá kệ chọn tập xem nhanh trong trình phát
  const shelfCount = document.getElementById('watch-episodes-shelf-count');
  if (shelfCount) shelfCount.textContent = `Tổng cộng: ${state.currentEpisodes.length} tập`;
  const shelfGrid = document.getElementById('watch-episodes-shelf-grid');
  if (shelfGrid) {
    shelfGrid.innerHTML = '';
    state.currentEpisodes.forEach((ep, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `watch-ep-button ${i === episodeIndex ? 'active' : ''}`;
      btn.textContent = `${ep.number}`;
      btn.title = ep.title || `Tập ${ep.number}`;
      btn.addEventListener('click', () => {
        if (i === state.currentEpisodeIndex) return;
        router.navigate(`/watch/${anime.id}/${ep.number}`);
      });
      shelfGrid.appendChild(btn);
    });
    const activeBtn = shelfGrid.querySelector('.watch-ep-button.active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // Cập nhật trạng thái nút tập trước/kế tiếp
  const prevBtn = document.getElementById('nav-prev-ep');
  const nextBtn = document.getElementById('nav-next-ep');
  const ctrlPrevBtn = document.getElementById('prev-ep-btn');
  const ctrlNextBtn = document.getElementById('next-ep-btn');
  const hasPrev = episodeIndex > 0;
  const hasNext = episodeIndex < state.currentEpisodes.length - 1;

  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = !hasNext;
  if (ctrlPrevBtn) ctrlPrevBtn.style.opacity = hasPrev ? '1' : '0.4';
  if (ctrlNextBtn) ctrlNextBtn.style.opacity = hasNext ? '1' : '0.4';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Nạp iframe AniDoki từ máy chủ
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
  showToast('Đang tải nguồn AniDoki • Vietsub...');
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
    document.getElementById('player-source-label').textContent = 'AniDoki • Phụ đề Việt';
    iframe.src = url.href;
    iframe.style.display = 'block';
    LinimeAPI.saveProgress(animeId, episodeNumber, 0, 0);
    // AniDoki owns playback controls; its public API does not document seeking.
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

  // Điều hướng chuyển tập trước / tập tiếp theo
  const navigateToEp = (delta) => {
    const epList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime?.episodes || []);
    if (!state.currentVideoAnime || !epList.length) return;
    const targetIdx = state.currentEpisodeIndex + delta;
    if (targetIdx >= 0 && targetIdx < epList.length) {
      const targetEp = epList[targetIdx];
      router.navigate(`/watch/${state.currentVideoAnime.id}/${targetEp.number}`);
    } else if (delta < 0) {
      showToast('Đang ở tập đầu tiên');
    } else {
      showToast('Đang ở tập mới nhất');
    }
  };

  document.getElementById('nav-next-ep')?.addEventListener('click', () => navigateToEp(1));
  document.getElementById('next-ep-btn')?.addEventListener('click', () => navigateToEp(1));
  document.getElementById('nav-prev-ep')?.addEventListener('click', () => navigateToEp(-1));
  document.getElementById('prev-ep-btn')?.addEventListener('click', () => navigateToEp(-1));

  // Tùy chọn Tự chuyển tập (Autonext)
  const autoNextChk = document.getElementById('chk-autonext');
  if (autoNextChk) {
    const savedAutoNext = localStorage.getItem('anidoki_autonext');
    autoNextChk.checked = savedAutoNext !== 'false';
    autoNextChk.addEventListener('change', (e) => {
      localStorage.setItem('anidoki_autonext', String(e.target.checked));
      showToast(e.target.checked ? 'Đã bật tự chuyển tập' : 'Đã tắt tự chuyển tập');
    });
  }

  // Tự chuyển tập khi HTML5 video kết thúc
  video.addEventListener('ended', () => {
    const isAutoNext = localStorage.getItem('anidoki_autonext') !== 'false';
    if (isAutoNext && state.currentVideoAnime && state.currentEpisodeIndex < state.currentEpisodes.length - 1) {
      showToast('Đang tự động chuyển sang tập tiếp theo...');
      setTimeout(() => navigateToEp(1), 1000);
    }
  });

  // Tắt đèn / Theater Mode
  document.getElementById('btn-light')?.addEventListener('click', () => {
    modal.classList.toggle('light-off');
    showToast(modal.classList.contains('light-off') ? 'Đã tắt đèn làm dịu mắt' : 'Đã bật đèn');
  });

  // Nút trở lại trang chi tiết từ trình phát
  document.getElementById('watch-back-btn')?.addEventListener('click', () => {
    ++streamRequest;
    video.pause();
    video.src = '';
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (state.currentVideoAnime) {
      router.navigate(`/anime/${state.currentVideoAnime.id}`);
    } else {
      router.navigate('/');
    }
  });

  // Đóng player
  document.getElementById('close-player-btn')?.addEventListener('click', async () => {
    ++streamRequest;
    if (state.currentVideoAnime && video && video.currentTime > 0) {
      const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
      const episode = episodeList[state.currentEpisodeIndex];
      LinimeAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
    }
    video.pause();
    video.src = '';
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
    await loadContinueWatching();
    if (state.currentVideoAnime) {
      router.navigate(`/anime/${state.currentVideoAnime.id}`);
    } else {
      router.navigate('/');
    }
  });

  video.addEventListener('pause', () => {
    if (state.currentVideoAnime && video.currentTime > 0) {
      const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
      const episode = episodeList[state.currentEpisodeIndex];
      LinimeAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
    }
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

// ==========================================
// REPORT ISSUE MODAL
// ==========================================
function initReportModal() {
  const modal = document.getElementById('report-modal');
  const form = document.getElementById('report-form');
  const closeBtn = document.getElementById('close-report-btn');
  const cancelBtn = document.getElementById('cancel-report-btn');
  const openBtn = document.getElementById('open-report-btn');

  const close = () => {
    modal?.classList.remove('active');
  };

  openBtn?.addEventListener('click', () => {
    if (!state.currentVideoAnime) {
      showToast('Chưa chọn anime nào để báo lỗi');
      return;
    }
    const anime = state.currentVideoAnime;
    const ep = state.currentEpisodes[state.currentEpisodeIndex] || { number: state.currentEpisodeIndex + 1 };
    const epNum = ep.number || (state.currentEpisodeIndex + 1);

    const titleInput = document.getElementById('report-anime-title');
    const epInput = document.getElementById('report-episode-num');
    const provInput = document.getElementById('report-provider');

    if (titleInput) titleInput.value = anime.title.vietnamese || anime.title.english || anime.id;
    if (epInput) epInput.value = `Tập ${epNum}`;
    if (provInput) provInput.value = activeProvider || 'AniDoki';

    modal?.classList.add('active');
  });

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentVideoAnime) {
      close();
      return;
    }
    const ep = state.currentEpisodes[state.currentEpisodeIndex] || { number: state.currentEpisodeIndex + 1 };
    const epNum = ep.number || (state.currentEpisodeIndex + 1);
    const issueType = document.getElementById('report-issue-type')?.value;
    const desc = document.getElementById('report-desc')?.value?.trim();

    const submitBtn = document.getElementById('submit-report-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang gửi...';
    }

    try {
      const res = await LinimeAPI.submitReport({
        anime_id: state.currentVideoAnime.id,
        episode_number: epNum,
        provider: activeProvider || 'AniDoki',
        issue_type: issueType,
        description: desc
      });

      if (res.success) {
        showToast('Báo lỗi thành công! Đội ngũ kỹ thuật sẽ sớm kiểm tra.');
        form.reset();
        close();
      } else {
        showToast(res.message || 'Không thể gửi báo lỗi lúc này.');
      }
    } catch {
      showToast('Đã xảy ra lỗi khi gửi báo lỗi.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi báo lỗi';
      }
    }
  });
}

// ==========================================
// BROWSE VIEW (/browse)
// ==========================================
let browseGenreOptions = [];

async function initBrowseView() {
  const genreSelect = document.getElementById('browse-genre-select');
  const form = document.getElementById('browse-filter-form');
  const resetBtn = document.getElementById('browse-reset-btn');
  const emptyResetBtn = document.getElementById('browse-empty-reset-btn');

  try {
    const res = await fetch('/api/genre-options');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      browseGenreOptions = json.data;
      if (genreSelect) {
        browseGenreOptions.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.slug;
          opt.textContent = g.name;
          genreSelect.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn('Error loading browse genre options:', err);
  }

  const applyFilters = () => {
    const q = document.getElementById('browse-search-input')?.value?.trim() || '';
    const category = document.getElementById('browse-genre-select')?.value || '';
    const year = document.getElementById('browse-year-select')?.value || '';
    const status = document.getElementById('browse-status-select')?.value || '';
    const sort = document.getElementById('browse-sort-select')?.value || 'score';

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (year) params.set('year', year);
    if (status) params.set('status', status);
    if (sort && sort !== 'score') params.set('sort', sort);

    const queryStr = params.toString();
    router.navigate(`/browse${queryStr ? '?' + queryStr : ''}`);
  };

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  ['browse-genre-select', 'browse-year-select', 'browse-status-select', 'browse-sort-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  let searchDebounce = null;
  document.getElementById('browse-search-input')?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 400);
  });

  const resetFilters = () => {
    router.navigate('/browse');
  };

  resetBtn?.addEventListener('click', resetFilters);
  emptyResetBtn?.addEventListener('click', resetFilters);
}

async function loadBrowseView(route) {
  const query = route?.query || {};
  const q = query.q || '';
  const category = query.category || '';
  const year = query.year || '';
  const status = query.status || '';
  const sort = query.sort || 'score';
  const page = parseInt(query.page, 10) || 1;

  const searchInput = document.getElementById('browse-search-input');
  const genreSelect = document.getElementById('browse-genre-select');
  const yearSelect = document.getElementById('browse-year-select');
  const statusSelect = document.getElementById('browse-status-select');
  const sortSelect = document.getElementById('browse-sort-select');

  if (searchInput) searchInput.value = q;
  if (genreSelect) genreSelect.value = category;
  if (yearSelect) yearSelect.value = year;
  if (statusSelect) statusSelect.value = status;
  if (sortSelect) sortSelect.value = sort;

  renderBrowseChips(query);

  const grid = document.getElementById('browse-grid');
  const countEl = document.getElementById('browse-results-count');
  const pageIndicator = document.getElementById('browse-results-page-indicator');
  const emptyEl = document.getElementById('browse-empty');
  const paginationWrap = document.getElementById('browse-pagination');

  if (countEl) countEl.textContent = 'Đang tìm kiếm anime...';
  if (grid) grid.innerHTML = '';
  if (emptyEl) emptyEl.style.display = 'none';
  if (paginationWrap) paginationWrap.style.display = 'none';

  try {
    const res = await LinimeAPI.getBrowse({ q, category, year, status, sort, page, limit: 24 });
    const items = res.data || [];
    const pagination = res.pagination || { page: 1, totalPages: 1, totalItems: items.length, hasMore: false };

    if (!items.length) {
      if (countEl) countEl.textContent = '0 anime phù hợp';
      if (pageIndicator) pageIndicator.textContent = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      if (grid) grid.innerHTML = '';
      return;
    }

    if (countEl) {
      const totalStr = pagination.totalItems ? `${pagination.totalItems} kết quả` : `${items.length} phim`;
      countEl.textContent = `Tìm thấy ${totalStr}`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = pagination.totalPages > 1 ? `Trang ${pagination.page} / ${pagination.totalPages}` : '';
    }

    if (grid) {
      grid.innerHTML = '';
      items.forEach(anime => {
        grid.appendChild(renderCard(anime));
      });
    }

    if (pagination.totalPages > 1 && paginationWrap) {
      paginationWrap.style.display = 'flex';
      setupBrowsePagination(query, pagination);
    }
  } catch {
    if (countEl) countEl.textContent = 'Lỗi tải danh sách phim';
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

function renderBrowseChips(query) {
  const chipsWrap = document.getElementById('browse-active-chips');
  if (!chipsWrap) return;
  chipsWrap.innerHTML = '';

  const activeFilters = [];
  if (query.q) activeFilters.push({ key: 'q', label: `Từ khóa: "${query.q}"` });
  if (query.category) {
    const found = browseGenreOptions.find(g => g.slug === query.category);
    activeFilters.push({ key: 'category', label: `Thể loại: ${found ? found.name : query.category}` });
  }
  if (query.year) activeFilters.push({ key: 'year', label: `Năm: ${query.year}` });
  if (query.status) {
    const statusLabels = { ongoing: 'Đang phát sóng', completed: 'Trọn bộ' };
    activeFilters.push({ key: 'status', label: `Trạng thái: ${statusLabels[query.status] || query.status}` });
  }
  if (query.sort && query.sort !== 'score') {
    const sortLabels = { updated: 'Mới cập nhật', year: 'Năm mới nhất', title: 'Tên A-Z' };
    activeFilters.push({ key: 'sort', label: `Sắp xếp: ${sortLabels[query.sort] || query.sort}` });
  }

  if (!activeFilters.length) return;

  activeFilters.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `<span>${item.label}</span><button type="button" aria-label="Xóa bộ lọc ${item.label}">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      const nextQuery = { ...query };
      delete nextQuery[item.key];
      delete nextQuery.page;
      const params = new URLSearchParams(nextQuery);
      router.navigate(`/browse${params.toString() ? '?' + params.toString() : ''}`);
    });
    chipsWrap.appendChild(chip);
  });

  const clearAllBtn = document.createElement('span');
  clearAllBtn.className = 'filter-chip-clear';
  clearAllBtn.textContent = 'Xóa tất cả';
  clearAllBtn.addEventListener('click', () => router.navigate('/browse'));
  chipsWrap.appendChild(clearAllBtn);
}

function setupBrowsePagination(query, pagination) {
  const prevBtn = document.getElementById('browse-prev-page');
  const nextBtn = document.getElementById('browse-next-page');
  const pagesContainer = document.getElementById('browse-page-numbers');

  const currentPage = pagination.page;
  const totalPages = pagination.totalPages;

  const navigateToPage = (p) => {
    const nextQuery = { ...query, page: p };
    const params = new URLSearchParams(nextQuery);
    router.navigate(`/browse?${params.toString()}`);
  };

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => navigateToPage(currentPage - 1);
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => navigateToPage(currentPage + 1);
  }

  if (pagesContainer) {
    pagesContainer.innerHTML = '';
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let p = start; p <= end; p++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => navigateToPage(p);
      pagesContainer.appendChild(btn);
    }
  }
}

// ==========================================
// PERSONAL LIBRARY VIEW (/library)
// ==========================================
let currentLibTab = 'all';
let currentLibQuery = '';

function initLibraryView() {
  const tabs = document.querySelectorAll('.lib-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLibTab = btn.dataset.tab || 'all';
      loadLibraryView(currentLibTab, currentLibQuery);
    });
  });

  let searchTimeout = null;
  const searchInput = document.getElementById('library-search-input');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentLibQuery = e.target.value.trim();
      loadLibraryView(currentLibTab, currentLibQuery);
    }, 300);
  });

  document.getElementById('library-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });
}

async function loadLibraryView(tab = currentLibTab, query = currentLibQuery) {
  const unauthEl = document.getElementById('library-unauth-state');
  const emptyEl = document.getElementById('library-empty-state');
  const grid = document.getElementById('library-grid');
  const countAll = document.getElementById('lib-count-all');
  const countWatching = document.getElementById('lib-count-watching');
  const countPlan = document.getElementById('lib-count-plan');
  const countCompleted = document.getElementById('lib-count-completed');

  if (!LinimeAPI.getToken()) {
    if (unauthEl) unauthEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (countAll) countAll.textContent = '0';
    if (countWatching) countWatching.textContent = '0';
    if (countPlan) countPlan.textContent = '0';
    if (countCompleted) countCompleted.textContent = '0';
    return;
  }

  if (unauthEl) unauthEl.style.display = 'none';
  if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Đang tải thư viện...</div>`;

  try {
    const params = {};
    if (tab && tab !== 'all') params.status = tab;
    if (query) params.q = query;

    const res = await LinimeAPI.getLibrary(params);
    const items = res.data || [];
    const counts = res.counts || { all: 0, plan_to_watch: 0, watching: 0, completed: 0 };

    if (countAll) countAll.textContent = counts.all;
    if (countWatching) countWatching.textContent = counts.watching;
    if (countPlan) countPlan.textContent = counts.plan_to_watch;
    if (countCompleted) countCompleted.textContent = counts.completed;

    if (!items.length) {
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        const emptyTitle = document.getElementById('library-empty-title');
        const emptyDesc = document.getElementById('library-empty-desc');
        if (query) {
          if (emptyTitle) emptyTitle.textContent = `Không tìm thấy anime khớp với "${query}"`;
          if (emptyDesc) emptyDesc.textContent = 'Hãy thử tìm kiếm với từ khóa khác.';
        } else {
          const tabNames = {
            all: 'Thư viện chưa có phim',
            watching: 'Chưa có phim đang xem',
            plan_to_watch: 'Chưa có phim muốn xem sau',
            completed: 'Chưa có phim đã hoàn thành'
          };
          if (emptyTitle) emptyTitle.textContent = tabNames[tab] || 'Thư viện trống';
          if (emptyDesc) emptyDesc.textContent = 'Khám phá ngay kho anime phong phú của anidoki để lưu phim yêu thích nhé!';
        }
      }
      if (grid) grid.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) {
      grid.innerHTML = '';
      items.forEach(item => {
        let anime = item.anime;
        if (!anime || typeof anime !== 'object' || !anime.title) {
          if (item.title || item.coverImage || item.id) {
            anime = { ...item };
          } else {
            anime = {
              id: item.animeId || item.id || item.slug,
              title: { english: item.animeId || item.id || 'Anime' },
              coverImage: '/poster-placeholder.svg'
            };
          }
        }

        if (typeof anime.title === 'string') {
          anime.title = { english: anime.title, vietnamese: anime.title };
        } else if (!anime.title) {
          const fallbackTitle = item.animeId || item.id || item.slug || 'Anime';
          anime.title = { english: fallbackTitle, vietnamese: fallbackTitle };
        }

        anime.id = anime.id || item.animeId || item.id || item.slug;
        anime.coverImage = anime.coverImage || anime.posterUrl || anime.poster_url || '/poster-placeholder.svg';

        const card = renderCard(anime);

        const statusMap = {
          plan_to_watch: { label: 'Muốn xem', bg: '#4a90e2' },
          watching: { label: 'Đang xem', bg: '#50e3c2' },
          completed: { label: 'Hoàn thành', bg: '#b8e986' }
        };
        const currentStatus = item.libraryStatus || (statusMap[item.status] ? item.status : 'plan_to_watch');
        const info = statusMap[currentStatus] || { label: 'Muốn xem', bg: '#4a90e2' };
        const badge = document.createElement('div');
        badge.style.cssText = `position: absolute; top: 8px; left: 8px; background: ${info.bg}; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; z-index: 3;`;
        badge.textContent = info.label;
        card.querySelector('.anime-card-poster')?.appendChild(badge);

        grid.appendChild(card);
      });
    }
  } catch {
    if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff5252;">Lỗi tải dữ liệu thư viện. Vui lòng thử lại.</div>`;
  }
}

// ==========================================
// WATCH HISTORY VIEW (/history)
// ==========================================
let currentHistoryPage = 1;

function initHistoryView() {
  document.getElementById('history-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });

  document.getElementById('clear-all-history-btn')?.addEventListener('click', () => {
    showConfirmModal({
      title: 'Xóa toàn bộ lịch sử',
      message: 'Bạn có chắc chắn muốn xóa tất cả lịch sử xem phim trên tài khoản này? Hành động này không thể hoàn tác.',
      onConfirm: async () => {
        await LinimeAPI.clearAllHistory();
        showToast('Đã xóa toàn bộ lịch sử xem phim');
        await loadHistoryView(1);
        await loadContinueWatching();
      }
    });
  });

  document.getElementById('history-load-more-btn')?.addEventListener('click', () => {
    loadHistoryView(currentHistoryPage + 1, true);
  });
}

async function loadHistoryView(page = 1, append = false) {
  currentHistoryPage = page;
  const unauthEl = document.getElementById('history-unauth-state');
  const emptyEl = document.getElementById('history-empty-state');
  const grid = document.getElementById('history-items-grid');
  const clearBtn = document.getElementById('clear-all-history-btn');
  const loadMoreBtn = document.getElementById('history-load-more-btn');

  if (!LinimeAPI.getToken()) {
    if (unauthEl) unauthEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  if (unauthEl) unauthEl.style.display = 'none';
  if (!append && grid) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Đang tải lịch sử...</div>`;
  }

  try {
    const res = await LinimeAPI.getHistory(page, 20);
    const items = res.data || [];
    const pagination = res.pagination || { hasMore: false };

    if (!items.length && !append) {
      if (emptyEl) emptyEl.style.display = 'flex';
      if (grid) grid.innerHTML = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (loadMoreBtn) loadMoreBtn.style.display = pagination.hasMore ? 'inline-block' : 'none';

    if (!append && grid) grid.innerHTML = '';

    items.forEach(item => {
      const anime = item.anime || { id: item.animeId, title: { english: item.animeId }, coverImage: '/poster-placeholder.svg' };
      const hasProgress = Number(item.currentTime) > 0 && Number(item.duration) > 0;
      const progressPercent = hasProgress ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100)) : 0;
      const timeStr = hasProgress ? `${formatTime(item.currentTime)} / ${formatTime(item.duration)}` : 'Tiếp tục xem';

      const card = document.createElement('div');
      card.className = 'history-card-item';
      card.innerHTML = `
        <img class="history-card-thumb" src="${anime.coverImage}" alt="${anime.title?.english || anime.title?.vietnamese || 'Anime'}">
        <div class="history-card-content">
          <div class="history-card-title">${anime.title?.english || anime.title?.vietnamese || 'Anime'}</div>
          <div class="history-card-ep">Tập ${item.episodeNumber || 1} · ${timeStr}</div>
          ${hasProgress ? `
            <div class="cw-progress-bar" style="margin-top: 6px;">
              <div class="cw-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          ` : ''}
        </div>
        <button type="button" class="history-del-btn" title="Xóa khỏi lịch sử">✕</button>
      `;

      card.querySelector('.history-del-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await LinimeAPI.deleteHistory(item.animeId);
        showToast('Đã xóa tập khỏi lịch sử');
        await loadHistoryView(1);
        await loadContinueWatching();
      });

      card.addEventListener('click', () => {
        router.navigate(`/watch/${item.animeId}/${item.episodeNumber || 1}`);
      });

      grid.appendChild(card);
    });
  } catch {
    if (!append && grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff5252;">Lỗi tải lịch sử xem phim.</div>`;
  }
}

// ==========================================
// SPA ROUTE REGISTRATION
// ==========================================
function registerRoutes() {
  router
    .addRoute('/', () => {
      switchView('view-home');
      document.title = 'anidoki — Xem anime online';
    })
    .addRoute('/browse', (route) => {
      switchView('view-browse');
      document.title = 'Khám Phá Anime | anidoki';
      loadBrowseView(route);
    })
    .addRoute('/anime/:slug', (route) => {
      openAnimeDetail(route.params.slug, false);
    })
    .addRoute('/watch/:slug/:episode', (route) => {
      openPlayerByRoute(route.params.slug, route.params.episode);
    })
    .addRoute('/library', () => {
      switchView('view-library');
      document.title = 'Thư Viện Của Tôi | anidoki';
      loadLibraryView();
    })
    .addRoute('/history', () => {
      switchView('view-history');
      document.title = 'Lịch Sử Xem Phim | anidoki';
      loadHistoryView();
    })
    .addRoute('/account', () => {
      switchView('view-account');
      document.title = 'Tài Khoản & Tùy Chọn | anidoki';
      loadAccountView();
    })
    .addRoute('/help', () => {
      switchView('view-help');
      document.title = 'Trung Tâm Trợ Giúp & Góp Ý | anidoki';
      loadHelpView();
    })
    .addRoute('/admin', () => {
      loadAdminView('dashboard');
    })
    .addRoute('/admin/dashboard', () => {
      loadAdminView('dashboard');
    })
    .addRoute('/admin/anime', () => {
      loadAdminView('anime');
    })
    .addRoute('/admin/anime/:slug/episodes', (route) => {
      loadAdminView('episodes', route.params.slug);
    })
    .addRoute('/admin/homepage', () => {
      loadAdminView('homepage');
    })
    .addRoute('/admin/sync', () => {
      loadAdminView('sync');
    })
    .addRoute('/admin/reports', () => {
      loadAdminView('reports');
    })
    .addRoute('/admin/feedback', () => {
      loadAdminView('feedback');
    })
    .addRoute('/admin/users', () => {
      loadAdminView('users');
    })
    .addRoute('/admin/audit-logs', () => {
      loadAdminView('audit-logs');
    })
    .addRoute('/admin/settings', () => {
      loadAdminView('settings');
    })
    .setNotFound(() => {
      switchView('view-404');
      document.title = '404 - Không Tìm Thấy Trang | anidoki';
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
    if (!LinimeAPI.getToken()) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">🔒</div>
          <h4 style="color: #fff; margin-bottom: 8px; font-size: 16px;">Yêu cầu đăng nhập</h4>
          <p style="margin-bottom: 20px; font-size: 13px; line-height: 1.5;">Vui lòng đăng nhập để lưu và quản lý danh sách anime yêu thích của riêng bạn.</p>
          <button class="btn btn-primary" id="watchlist-login-action-btn" style="padding: 9px 24px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: var(--primary, #e50914); color: #fff;">Đăng nhập ngay</button>
        </div>
      `;
      document.getElementById('watchlist-login-action-btn')?.addEventListener('click', () => {
        closeWatchlist();
        document.getElementById('login-modal')?.classList.add('active');
      });
      return;
    }

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
// LOGIN & SESSION MODAL (GOOGLE OAUTH & API POWERED)
// ==========================================
const GOOGLE_CLIENT_ID = '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com';
let googleTokenClient = null;

function updateUserUI() {
  const openLoginBtn = document.getElementById('open-login-btn');
  const userDisplayName = document.getElementById('user-display-name');
  const userDropdown = document.getElementById('user-dropdown');
  const userAvatarImg = document.getElementById('user-avatar-img');
  const userDropdownName = document.getElementById('user-dropdown-name');
  const userDropdownEmail = document.getElementById('user-dropdown-email');
  const loginIcon = document.getElementById('login-btn-icon');
  const roleBadge = document.getElementById('user-dropdown-role-badge');
  const adminMenuSection = document.getElementById('admin-menu-section');

  if (state.user) {
    const firstName = state.user.name ? state.user.name.split(' ').slice(-1)[0] : 'Tài khoản';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name || 'User')}&background=e50914&color=fff&bold=true`;
    const avatarSrc = state.user.avatar || fallbackAvatar;

    if (userDisplayName) userDisplayName.textContent = firstName;
    if (userDropdownName) userDropdownName.textContent = state.user.name || 'Người dùng AniDoki';
    if (userDropdownEmail) userDropdownEmail.textContent = state.user.email || '';
    
    if (userAvatarImg) {
      userAvatarImg.setAttribute('referrerpolicy', 'no-referrer');
      userAvatarImg.setAttribute('crossorigin', 'anonymous');
      userAvatarImg.onerror = () => { userAvatarImg.src = fallbackAvatar; };
      userAvatarImg.src = avatarSrc;
    }

    // Cập nhật huy hiệu Admin & nút mở trang quản trị
    const isAdmin = state.user.role === 'admin';
    if (roleBadge) roleBadge.style.display = isAdmin ? 'inline-block' : 'none';
    if (adminMenuSection) adminMenuSection.style.display = isAdmin ? 'block' : 'none';

    // Hiển thị avatar tròn nhỏ trong nút đăng nhập
    let thumb = openLoginBtn?.querySelector('.user-avatar-thumb');
    if (!thumb && openLoginBtn) {
      thumb = document.createElement('img');
      thumb.className = 'user-avatar-thumb';
      thumb.setAttribute('referrerpolicy', 'no-referrer');
      thumb.setAttribute('crossorigin', 'anonymous');
      thumb.onerror = () => { thumb.src = fallbackAvatar; };
      thumb.src = avatarSrc;
      thumb.alt = state.user.name || 'Avatar';
      openLoginBtn.prepend(thumb);
    } else if (thumb) {
      thumb.setAttribute('referrerpolicy', 'no-referrer');
      thumb.setAttribute('crossorigin', 'anonymous');
      thumb.onerror = () => { thumb.src = fallbackAvatar; };
      thumb.src = avatarSrc;
    }
    if (loginIcon) loginIcon.style.display = 'none';
  } else {
    if (userDisplayName) userDisplayName.textContent = 'Đăng nhập';
    const thumb = openLoginBtn?.querySelector('.user-avatar-thumb');
    if (thumb) thumb.remove();
    if (loginIcon) loginIcon.style.display = 'inline-block';
    if (userDropdown) userDropdown.hidden = true;
    if (roleBadge) roleBadge.style.display = 'none';
    if (adminMenuSection) adminMenuSection.style.display = 'none';
  }
}

function initGoogleServices(onSuccess) {
  if (window.google?.accounts?.oauth2) {
    try {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            const res = await LinimeAPI.googleLogin({ access_token: tokenResponse.access_token });
            if (res.success && res.user) {
              await onSuccess(res.user);
            } else {
              showToast(res.message || 'Đăng nhập Google thất bại');
            }
          }
        }
      });
    } catch (err) {
      console.warn('Google Token Client init error:', err);
    }
  }

  if (window.google?.accounts?.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (response && response.credential) {
            const res = await LinimeAPI.googleLogin({ credential: response.credential });
            if (res.success && res.user) {
              await onSuccess(res.user);
            } else {
              showToast(res.message || 'Đăng nhập Google thất bại');
            }
          }
        },
        auto_select: false
      });
    } catch (err) {
      console.warn('Google GSI init error:', err);
    }
  }
}

// ==========================================
// ADMIN CONTROL PANEL (PHASE 3)
// ==========================================
let currentAdminTab = 'dashboard';
let currentAdminAnimePage = 1;
let currentAdminEpisodeSlug = '';
let currentAdminReportFilter = { status: 'all', issue_type: '' };

async function loadAdminView(subTab = 'dashboard', param = null) {
  switchView('view-admin');

  const isAdmin = state.user && state.user.role === 'admin';
  const unauthView = document.getElementById('admin-unauth-view');
  const workspaceView = document.getElementById('admin-workspace');

  if (!isAdmin) {
    if (unauthView) unauthView.style.display = 'block';
    if (workspaceView) workspaceView.style.display = 'none';
    document.title = 'Yêu Cầu Quyền Quản Trị | anidoki';
    return;
  }

  if (unauthView) unauthView.style.display = 'none';
  if (workspaceView) workspaceView.style.display = 'block';

  const userTag = document.getElementById('admin-user-tag');
  if (userTag) userTag.textContent = state.user.email || state.user.name || 'Admin';

  currentAdminTab = subTab;

  // Cập nhật tab sidebar
  document.querySelectorAll('#admin-nav-group .admin-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-admin-tab') === subTab);
  });

  // Cập nhật breadcrumbs & tiêu đề trang
  const sectionTitles = {
    dashboard: 'Bảng Tổng Quan',
    anime: 'Quản Lý Anime',
    episodes: `Quản Lý Tập Phim (${param || ''})`,
    homepage: 'Cấu Hình Trang Chủ',
    sync: 'Đồng Bộ Dữ Liệu',
    reports: 'Báo Cáo Sự Cố',
    feedback: 'Phản Hồi & Góp Ý',
    users: 'Người Dùng & Phân Quyền',
    'audit-logs': 'Nhật Ký Kiểm Toán',
    settings: 'Cài Đặt Hệ Thống'
  };
  const title = sectionTitles[subTab] || 'Quản Trị';
  const breadcrumbEl = document.getElementById('admin-current-section-title');
  if (breadcrumbEl) breadcrumbEl.textContent = title;
  document.title = `${title} - Admin | anidoki`;

  // Ẩn tất cả panel, hiển thị panel mục tiêu
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.style.display = 'none';
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(`admin-panel-${subTab}`);
  if (targetPanel) {
    targetPanel.style.display = 'block';
    targetPanel.classList.add('active');
  }

  // Tải dữ liệu tương ứng
  if (subTab === 'dashboard') {
    await loadAdminDashboard();
  } else if (subTab === 'anime') {
    await loadAdminAnimeList(currentAdminAnimePage);
  } else if (subTab === 'episodes') {
    if (param) await loadAdminEpisodes(param);
  } else if (subTab === 'homepage') {
    await loadAdminHomepage();
  } else if (subTab === 'sync') {
    await loadAdminSync();
  } else if (subTab === 'reports') {
    await loadAdminReports();
  } else if (subTab === 'feedback') {
    await loadAdminFeedback();
  } else if (subTab === 'users') {
    await loadAdminUsers();
  } else if (subTab === 'audit-logs') {
    await loadAdminAuditLogs();
  } else if (subTab === 'settings') {
    await loadAdminSettings();
  }
}

async function loadAdminDashboard() {
  const res = await LinimeAPI.getAdminDashboard();
  if (!res.success) {
    showToast(res.message || 'Lỗi tải dữ liệu tổng quan admin');
    return;
  }

  const { stats, lastSync } = res;
  if (stats) {
    const totalAnimeEl = document.getElementById('stat-total-anime');
    const overridesEl = document.getElementById('stat-total-overrides');
    const hiddenEl = document.getElementById('stat-hidden-anime');
    const reportsEl = document.getElementById('stat-pending-reports');
    const usersEl = document.getElementById('stat-total-users');
    const badgeEl = document.getElementById('admin-pending-reports-badge');

    if (totalAnimeEl) totalAnimeEl.textContent = stats.totalAnime?.toLocaleString('vi-VN') || '0';
    if (overridesEl) overridesEl.textContent = stats.overridesCount?.toLocaleString('vi-VN') || '0';
    if (hiddenEl) hiddenEl.textContent = stats.hiddenAnimeCount?.toLocaleString('vi-VN') || '0';
    if (reportsEl) reportsEl.textContent = stats.pendingReportsCount?.toLocaleString('vi-VN') || '0';
    if (usersEl) usersEl.textContent = stats.totalUsers?.toLocaleString('vi-VN') || '0';

    if (badgeEl) {
      if (stats.pendingReportsCount > 0) {
        badgeEl.textContent = stats.pendingReportsCount;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }
  }

  const lastSyncStatusEl = document.getElementById('stat-last-sync-status');
  const lastSyncTimeEl = document.getElementById('stat-last-sync-time');
  if (lastSync) {
    if (lastSyncStatusEl) {
      const statusMap = { success: 'THÀNH CÔNG', failed: 'THẤT BẠI', running: 'ĐANG CHẠY' };
      lastSyncStatusEl.textContent = statusMap[lastSync.status] || lastSync.status.toUpperCase();
      lastSyncStatusEl.style.color = lastSync.status === 'success' ? '#2ecc71' : (lastSync.status === 'failed' ? '#ff334b' : '#ff9800');
    }
    if (lastSyncTimeEl) {
      lastSyncTimeEl.textContent = new Date(lastSync.started_at).toLocaleString('vi-VN');
    }
  } else {
    if (lastSyncStatusEl) lastSyncStatusEl.textContent = 'CHƯA CÓ';
    if (lastSyncTimeEl) lastSyncTimeEl.textContent = 'Chưa có tác vụ đồng bộ nào';
  }
}

async function loadAdminAnimeList(page = 1) {
  currentAdminAnimePage = page;
  const tbody = document.getElementById('admin-anime-tbody');
  const searchInput = document.getElementById('admin-anime-search');
  const visibilitySelect = document.getElementById('admin-anime-visibility-filter');
  const pageInfo = document.getElementById('admin-anime-count-info');
  const prevBtn = document.getElementById('admin-anime-prev-btn');
  const nextBtn = document.getElementById('admin-anime-next-btn');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách phim...</td></tr>`;
  }

  const params = {
    page,
    limit: 12,
    search: searchInput?.value.trim() || '',
    visibility: visibilitySelect?.value || 'all'
  };

  const res = await LinimeAPI.getAdminAnime(params);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách anime'}</td></tr>`;
    return;
  }

  const { items, pagination } = res;
  if (!items || items.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Không tìm thấy anime nào phù hợp.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Không có kết quả';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (pageInfo) {
    pageInfo.textContent = `Trang ${pagination.page} / ${pagination.totalPages || 1} (Tổng: ${pagination.total} phim)`;
  }
  if (prevBtn) prevBtn.disabled = pagination.page <= 1;
  if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;

  if (tbody) {
    tbody.innerHTML = '';
    items.forEach(anime => {
      const tr = document.createElement('tr');
      const isHidden = Boolean(anime.is_hidden);
      const titleVi = anime.title?.vietnamese ? `<span style="font-weight: 500;">${anime.title.vietnamese}</span>` : `<span style="color: var(--text-muted);">—</span>`;
      const titleEn = anime.title?.english || anime.name || anime.id;
      const statusText = anime.status === 'completed' ? 'Trọn bộ' : 'Đang phát sóng';

      tr.innerHTML = `
        <td>
          <img class="admin-table-thumb" src="${anime.coverImage || '/poster-placeholder.svg'}" alt="${titleEn}" onerror="this.src='/poster-placeholder.svg'">
        </td>
        <td>
          <div style="font-weight: 600; font-size: 13.5px; color: #fff;">${titleEn}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${anime.id}</div>
        </td>
        <td>${titleVi}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${statusText}</span></td>
        <td>
          ${isHidden
            ? `<span class="badge-status-hidden">Đang ẩn</span>`
            : `<span class="badge-status-visible">Hiển thị</span>`}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button type="button" class="table-btn btn-edit-anime" title="Chỉnh sửa thông tin phim">✏️ Sửa</button>
            <a href="/admin/anime/${encodeURIComponent(anime.id)}/episodes" class="table-btn" title="Quản lý tập phim">🎞️ Tập</a>
            <button type="button" class="table-btn ${isHidden ? 'table-btn-success' : 'table-btn-danger'} btn-toggle-vis" title="${isHidden ? 'Mở lại phim' : 'Ẩn phim khỏi trang người dùng'}">
              ${isHidden ? '👁️ Mở lại' : '🚫 Ẩn'}
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-anime')?.addEventListener('click', () => {
        openAdminAnimeEditModal(anime.id);
      });

      tr.querySelector('.btn-toggle-vis')?.addEventListener('click', async () => {
        const nextHidden = !isHidden;
        const confirmMsg = nextHidden
          ? `Bạn có chắc muốn ẨN bộ phim "${titleEn}" khỏi toàn bộ giao diện người xem?`
          : `Bạn có chắc muốn MỞ LẠI bộ phim "${titleEn}" cho người xem truy cập?`;

        showConfirmModal({
          title: nextHidden ? 'Xác nhận ẩn phim' : 'Xác nhận mở lại phim',
          message: confirmMsg,
          onConfirm: async () => {
            const toggleRes = await LinimeAPI.toggleAdminAnimeVisibility(anime.id, nextHidden);
            if (toggleRes.success) {
              showToast(toggleRes.message || 'Cập nhật trạng thái thành công');
              await loadAdminAnimeList(currentAdminAnimePage);
            } else {
              showToast(toggleRes.message || 'Lỗi cập nhật trạng thái');
            }
          }
        });
      });

      tbody.appendChild(tr);
    });
  }
}

async function openAdminAnimeEditModal(animeId) {
  const modal = document.getElementById('admin-anime-edit-modal');
  if (!modal) return;

  const idInput = document.getElementById('admin-edit-anime-id');
  const titleViInput = document.getElementById('admin-edit-title-vi');
  const titleEnInput = document.getElementById('admin-edit-title-en');
  const descInput = document.getElementById('admin-edit-desc');
  const posterInput = document.getElementById('admin-edit-poster');
  const bannerInput = document.getElementById('admin-edit-banner');
  const genresInput = document.getElementById('admin-edit-genres');
  const statusSelect = document.getElementById('admin-edit-status');
  const notesInput = document.getElementById('admin-edit-notes');
  const hiddenCheckbox = document.getElementById('admin-edit-hidden');

  // Reset values
  if (idInput) idInput.value = animeId;
  if (titleViInput) titleViInput.value = 'Đang tải...';

  modal.classList.add('active');

  const res = await LinimeAPI.getAdminAnimeDetail(animeId);
  if (!res.success) {
    showToast(res.message || 'Lỗi tải chi tiết anime');
    modal.classList.remove('active');
    return;
  }

  const { anime, override } = res;
  if (idInput) idInput.value = anime.id;
  if (titleViInput) titleViInput.value = override?.title_vietnamese || anime.title?.vietnamese || '';
  if (titleEnInput) titleEnInput.value = override?.title_english || anime.title?.english || anime.name || '';
  if (descInput) descInput.value = override?.description || anime.description || '';
  if (posterInput) posterInput.value = override?.cover_image || anime.coverImage || '';
  if (bannerInput) bannerInput.value = override?.banner_image || anime.bannerImage || '';
  if (genresInput) {
    const genres = override?.genres || anime.genres || [];
    genresInput.value = Array.isArray(genres) ? genres.join(', ') : genres;
  }
  if (statusSelect) statusSelect.value = override?.status || anime.status || '';
  if (notesInput) notesInput.value = override?.notes || '';
  if (hiddenCheckbox) hiddenCheckbox.checked = Boolean(override?.is_hidden);
}

async function loadAdminEpisodes(animeSlug) {
  currentAdminEpisodeSlug = animeSlug;
  const tbody = document.getElementById('admin-episodes-tbody');
  const titleEl = document.getElementById('admin-episodes-anime-title');
  const subEl = document.getElementById('admin-episodes-anime-sub');

  if (titleEl) titleEl.textContent = `Quản lý Tập phim: ${animeSlug}`;
  if (subEl) subEl.textContent = `Kiểm tra nguồn phát, chỉnh sửa link nhúng hoặc ẩn tập phim hỏng cho "${animeSlug}".`;

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách tập...</td></tr>`;
  }

  const res = await LinimeAPI.getAdminEpisodes(animeSlug);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách tập'}</td></tr>`;
    return;
  }

  const { anime, episodes } = res;
  if (anime && titleEl) {
    titleEl.textContent = `Quản lý Tập: ${anime.title?.english || anime.name || animeSlug}`;
  }

  if (!episodes || episodes.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Phim này chưa có danh sách tập nào.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    episodes.forEach(ep => {
      const tr = document.createElement('tr');
      const isHidden = Boolean(ep.is_hidden);
      const isOverridden = Boolean(ep.is_overridden);
      const embedUrl = ep.embedUrl || '';

      let healthBadge = `<span class="badge-health-unchecked">Chưa kiểm tra</span>`;
      if (ep.last_check_status === 'healthy') {
        healthBadge = `<span class="badge-health-ok">✓ Hoạt động</span>`;
      } else if (ep.last_check_status === 'broken') {
        healthBadge = `<span class="badge-health-broken">⚠️ Lỗi link</span>`;
      }

      tr.innerHTML = `
        <td><strong style="color: #fff; font-size: 13.5px;">Tập ${ep.episodeNumber}</strong></td>
        <td>${ep.title || 'Tập ' + ep.episodeNumber}</td>
        <td>
          <div style="font-size: 11.5px; font-family: monospace; color: ${isOverridden ? '#f4d07a' : 'var(--text-muted)'}; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${isOverridden ? '⚡ (Custom) ' : ''}${embedUrl || '—'}
          </div>
        </td>
        <td class="col-health-status">${healthBadge}</td>
        <td>
          ${isHidden
            ? `<span class="badge-status-hidden">Đang ẩn</span>`
            : `<span class="badge-status-visible">Hiển thị</span>`}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button type="button" class="table-btn btn-check-ep" title="Kiểm tra trực tiếp kết nối nguồn">🔍 Check</button>
            <button type="button" class="table-btn btn-edit-ep" title="Sửa link embed hoặc ghi chú">✏️ Sửa</button>
            <button type="button" class="table-btn ${isHidden ? 'table-btn-success' : 'table-btn-danger'} btn-toggle-ep-vis" title="${isHidden ? 'Bật lại tập này' : 'Ẩn tập này'}">
              ${isHidden ? '👁️ Hiện' : '🚫 Ẩn'}
            </button>
          </div>
        </td>
      `;

      // Check button
      tr.querySelector('.btn-check-ep')?.addEventListener('click', async () => {
        const healthCol = tr.querySelector('.col-health-status');
        if (healthCol) healthCol.innerHTML = `<span style="font-size: 11px; color: var(--text-muted);">Đang check...</span>`;
        const checkRes = await LinimeAPI.checkAdminEpisode(animeSlug, ep.episodeNumber, embedUrl);
        if (checkRes.success) {
          if (healthCol) {
            healthCol.innerHTML = checkRes.status === 'healthy'
              ? `<span class="badge-health-ok">✓ Hoạt động (${checkRes.httpStatus || 200})</span>`
              : `<span class="badge-health-broken">⚠️ Lỗi (${checkRes.httpStatus || 'N/A'})</span>`;
          }
          showToast(`Tập ${ep.episodeNumber}: ${checkRes.status === 'healthy' ? 'Nguồn hoạt động tốt' : 'Nguồn phản hồi lỗi'}`);
        } else {
          if (healthCol) healthCol.innerHTML = `<span class="badge-health-broken">⚠️ Lỗi check</span>`;
          showToast(checkRes.message || 'Lỗi kiểm tra nguồn phát');
        }
      });

      // Edit button
      tr.querySelector('.btn-edit-ep')?.addEventListener('click', () => {
        openAdminEpisodeEditModal(animeSlug, ep);
      });

      // Toggle visibility
      tr.querySelector('.btn-toggle-ep-vis')?.addEventListener('click', async () => {
        const nextHidden = !isHidden;
        const updateRes = await LinimeAPI.updateAdminEpisode(animeSlug, ep.episodeNumber, { is_hidden: nextHidden });
        if (updateRes.success) {
          showToast(`Tập ${ep.episodeNumber}: Đã ${nextHidden ? 'ẩn' : 'mở lại'}`);
          await loadAdminEpisodes(animeSlug);
        } else {
          showToast(updateRes.message || 'Lỗi cập nhật tập phim');
        }
      });

      tbody.appendChild(tr);
    });
  }
}

function openAdminEpisodeEditModal(animeSlug, ep) {
  const modal = document.getElementById('admin-ep-edit-modal');
  if (!modal) return;

  const animeIdInput = document.getElementById('admin-ep-edit-anime-id');
  const epNumInput = document.getElementById('admin-ep-edit-num');
  const subtitleEl = document.getElementById('admin-ep-modal-subtitle');
  const embedInput = document.getElementById('admin-ep-edit-embed');
  const notesInput = document.getElementById('admin-ep-edit-notes');
  const hiddenCheckbox = document.getElementById('admin-ep-edit-hidden');
  const checkResultDiv = document.getElementById('admin-ep-check-result');

  if (animeIdInput) animeIdInput.value = animeSlug;
  if (epNumInput) epNumInput.value = ep.episodeNumber;
  if (subtitleEl) subtitleEl.textContent = `Tập ${ep.episodeNumber} · ${animeSlug}`;
  if (embedInput) embedInput.value = ep.embedUrl || '';
  if (notesInput) notesInput.value = ep.notes || '';
  if (hiddenCheckbox) hiddenCheckbox.checked = Boolean(ep.is_hidden);
  if (checkResultDiv) {
    checkResultDiv.style.display = 'none';
    checkResultDiv.textContent = '';
  }

  modal.classList.add('active');
}

async function loadAdminSync() {
  const tbody = document.getElementById('admin-sync-logs-tbody');
  const runningBanner = document.getElementById('admin-sync-running-banner');
  const singleBtn = document.getElementById('admin-sync-single-btn');
  const recentBtn = document.getElementById('admin-sync-recent-btn');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Đang tải nhật ký...</td></tr>`;
  }

  const res = await LinimeAPI.getAdminSyncLogs(20);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #ff5252;">${res.message || 'Lỗi tải nhật ký đồng bộ'}</td></tr>`;
    return;
  }

  const logs = res.logs || [];
  const hasRunning = logs.some(l => l.status === 'running');
  if (runningBanner) runningBanner.style.display = hasRunning ? 'flex' : 'none';
  if (singleBtn) singleBtn.disabled = hasRunning;
  if (recentBtn) recentBtn.disabled = hasRunning;

  if (logs.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Chưa có nhật ký đồng bộ nào trong hệ thống.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const isRunning = log.status === 'running';
      const statusHtml = isRunning
        ? `<span class="badge-report-in_progress">⏳ Đang chạy</span>`
        : (log.status === 'success'
          ? `<span class="badge-report-resolved">✓ Thành công</span>`
          : `<span class="badge-report-dismissed" style="background: rgba(255,51,75,0.15); color: #ff5c72;">⚠️ Thất bại</span>`);

      let durationStr = '—';
      if (log.started_at && log.finished_at) {
        const ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime();
        durationStr = `${(ms / 1000).toFixed(1)}s`;
      } else if (isRunning) {
        durationStr = 'Đang tiến hành...';
      }

      const startedStr = log.started_at ? new Date(log.started_at).toLocaleString('vi-VN') : '—';
      const detailStr = log.error_message
        ? `<span style="color: #ff5c72;">${log.error_message}</span>`
        : (log.details ? `<span style="font-size: 11px; font-family: monospace;">${typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}</span>` : '—');

      tr.innerHTML = `
        <td><strong style="color: #fff;">${log.sync_type === 'single' ? 'Anime đơn lẻ' : 'Catalog mới'}</strong></td>
        <td><code>${log.target_slug || 'catalog'}</code></td>
        <td>${statusHtml}</td>
        <td>${log.items_synced || 0}</td>
        <td>${durationStr}</td>
        <td>${startedStr}</td>
        <td>${detailStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

async function loadAdminReports() {
  const tbody = document.getElementById('admin-reports-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải phản ánh...</td></tr>`;
  }

  const res = await LinimeAPI.getAdminReports(currentAdminReportFilter);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách phản ánh'}</td></tr>`;
    return;
  }

  const reports = res.reports || [];
  if (reports.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không có báo cáo sự cố nào theo bộ lọc này.</td></tr>`;
    return;
  }

  const typeLabels = {
    video_error: 'Lỗi video / Link hỏng',
    audio_error: 'Lỗi âm thanh',
    subtitle_error: 'Lỗi phụ đề',
    buffering: 'Giật lag / Buffer',
    other: 'Khác'
  };

  if (tbody) {
    tbody.innerHTML = '';
    reports.forEach(rep => {
      const tr = document.createElement('tr');
      const statusBadge = `<span class="badge-report-${rep.status}">${rep.status}</span>`;
      const createdStr = rep.created_at ? new Date(rep.created_at).toLocaleString('vi-VN') : '—';

      tr.innerHTML = `
        <td>
          <strong style="color: #fff;">${rep.anime_title || rep.anime_id}</strong>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${rep.anime_id}</div>
        </td>
        <td>Tập ${rep.episode_number}</td>
        <td><span style="font-size: 12px; font-weight: 500;">${typeLabels[rep.issue_type] || rep.issue_type}</span></td>
        <td>
          <div style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #eee; font-size: 12.5px;">
            ${rep.description ? `"${rep.description}"` : '<span style="color: var(--text-muted);">Không có mô tả</span>'}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${createdStr}</span></td>
        <td style="text-align: right;">
          <button type="button" class="table-btn table-btn-primary btn-process-report">🛠️ Xử lý</button>
        </td>
      `;

      tr.querySelector('.btn-process-report')?.addEventListener('click', () => {
        openAdminReportProcessModal(rep);
      });

      tbody.appendChild(tr);
    });
  }
}

function openAdminReportProcessModal(rep) {
  const modal = document.getElementById('admin-report-process-modal');
  if (!modal) return;

  const idInput = document.getElementById('admin-report-process-id');
  const subEl = document.getElementById('admin-report-modal-sub');
  const animeEl = document.getElementById('admin-report-detail-anime');
  const typeEl = document.getElementById('admin-report-detail-type');
  const epEl = document.getElementById('admin-report-detail-ep');
  const descEl = document.getElementById('admin-report-detail-desc');
  const statusSelect = document.getElementById('admin-report-process-status');
  const notesText = document.getElementById('admin-report-process-notes');

  const typeLabels = {
    video_error: 'Lỗi video',
    audio_error: 'Lỗi âm thanh',
    subtitle_error: 'Lỗi phụ đề',
    buffering: 'Giật lag',
    other: 'Khác'
  };

  if (idInput) idInput.value = rep.id;
  if (subEl) subEl.textContent = `Báo lỗi #${rep.id} · ${new Date(rep.created_at).toLocaleString('vi-VN')}`;
  if (animeEl) animeEl.textContent = rep.anime_title || rep.anime_id;
  if (typeEl) typeEl.textContent = typeLabels[rep.issue_type] || rep.issue_type;
  if (epEl) epEl.textContent = `Tập ${rep.episode_number} · Người gửi: ${rep.user_id ? 'User' : 'Khách'}${rep.reporter_ip ? ` (${rep.reporter_ip})` : ''}`;
  if (descEl) descEl.textContent = rep.description ? `"${rep.description}"` : 'Người dùng không để lại mô tả bổ sung.';
  if (statusSelect) statusSelect.value = rep.status || 'pending';
  if (notesText) notesText.value = rep.admin_notes || '';

  modal.classList.add('active');
}

// ==========================================
// 6. USERS MANAGEMENT (ENHANCED PHASE 4)
// ==========================================
let currentAdminUserStatus = 'all';
let currentAdminUserSearch = '';

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách tài khoản...</td></tr>`;
  }

  const res = await LinimeAPI.getAdminUsers({
    q: currentAdminUserSearch,
    status: currentAdminUserStatus === 'all' ? '' : currentAdminUserStatus
  });

  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách người dùng'}</td></tr>`;
    return;
  }

  const users = res.users || [];
  if (users.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không tìm thấy người dùng nào phù hợp.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=e50914&color=fff&bold=true`;
      const avatarSrc = u.avatar || fallbackAvatar;
      const isAdmin = u.role === 'admin';
      const isSelf = state.user && state.user.id === u.id;
      const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

      tr.innerHTML = `
        <td>
          <img src="${avatarSrc}" alt="${u.name || 'Avatar'}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; display: block;" onerror="this.src='${fallbackAvatar}'">
        </td>
        <td><strong style="color: #fff;">${u.name || '—'}</strong></td>
        <td><span style="font-size: 12.5px; color: var(--text-muted);">${u.email || '—'}</span></td>
        <td>
          ${isAdmin
            ? `<span class="badge-role" style="font-size: 11px;">Admin</span>`
            : `<span style="font-size: 12px; color: var(--text-muted);">Người dùng</span>`}
        </td>
        <td>
          ${u.is_banned
            ? `<span class="badge-user-banned" title="${u.ban_reason ? 'Lý do: ' + u.ban_reason : 'Đã bị khóa'}">Bị khóa</span>`
            : `<span class="badge-user-active">Hoạt động</span>`}
        </td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${createdStr}</span></td>
        <td style="text-align: right;">
          ${isSelf
            ? `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">(Tài khoản của bạn)</span>`
            : `<div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button type="button" class="table-btn ${isAdmin ? 'table-btn-danger' : 'table-btn-primary'} btn-change-role">
                  ${isAdmin ? 'Hạ User' : 'Lên Admin'}
                </button>
                ${u.is_banned
                  ? `<button type="button" class="table-btn table-btn-primary btn-unban-user" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;">Mở khóa</button>`
                  : `<button type="button" class="table-btn table-btn-danger btn-ban-user">Khóa</button>`}
              </div>`}
        </td>
      `;

      tr.querySelector('.btn-change-role')?.addEventListener('click', () => {
        const targetRole = isAdmin ? 'user' : 'admin';
        const actionText = isAdmin ? 'hạ quyền xuống Người dùng (User)' : 'nâng quyền lên Quản trị viên (Admin)';

        showConfirmModal({
          title: 'Xác nhận thay đổi vai trò',
          message: `Bạn có chắc muốn ${actionText} cho tài khoản "${u.name || u.email}"?`,
          onConfirm: async () => {
            const updateRes = await LinimeAPI.updateAdminUserRole(u.id, targetRole);
            if (updateRes.success) {
              showToast(updateRes.message || 'Cập nhật quyền thành công');
              await loadAdminUsers();
            } else {
              showToast(updateRes.message || 'Lỗi cập nhật quyền');
            }
          }
        });
      });

      tr.querySelector('.btn-unban-user')?.addEventListener('click', () => {
        showConfirmModal({
          title: 'Mở khóa tài khoản',
          message: `Bạn có chắc muốn mở khóa cho tài khoản "${u.name || u.email}"?`,
          onConfirm: async () => {
            const banRes = await LinimeAPI.banAdminUser(u.id, { is_banned: false });
            if (banRes.success) {
              showToast(banRes.message || 'Đã mở khóa tài khoản');
              await loadAdminUsers();
            } else {
              showToast(banRes.message || 'Lỗi mở khóa');
            }
          }
        });
      });

      tr.querySelector('.btn-ban-user')?.addEventListener('click', () => {
        openBanUserModal(u);
      });

      tbody.appendChild(tr);
    });
  }
}

function openBanUserModal(user) {
  const modal = document.getElementById('admin-user-ban-modal');
  const userIdInput = document.getElementById('admin-ban-user-id');
  const userNameInput = document.getElementById('admin-ban-user-name');
  const reasonInput = document.getElementById('admin-ban-reason-input');

  if (userIdInput) userIdInput.value = user.id;
  if (userNameInput) userNameInput.value = `${user.name || 'Người dùng'} (${user.email || user.id})`;
  if (reasonInput) reasonInput.value = '';

  modal?.classList.add('active');
}

// ==========================================
// 7. HOMEPAGE CONFIG PANEL (PHASE 4)
// ==========================================
async function loadAdminHomepage() {
  const spotlightInput = document.getElementById('admin-homepage-spotlight-input');
  const sectionsList = document.getElementById('admin-homepage-sections-list');

  const res = await LinimeAPI.getAdminHomepageConfig();
  if (!res.success) {
    showToast(res.message || 'Lỗi tải cấu hình trang chủ');
    return;
  }

  const { spotlight_slugs = [], sections_config = [] } = res.data || {};

  if (spotlightInput) {
    spotlightInput.value = spotlight_slugs.join(', ');
  }

  if (sectionsList) {
    sectionsList.innerHTML = '';
    const defaultSections = [
      { id: 'latest', title: 'Mới Cập Nhật', enabled: true, order: 1 },
      { id: 'trending', title: 'Xu Hướng & Nổi Bật', enabled: true, order: 2 },
      { id: 'seasonal', title: 'Anime Theo Mùa', enabled: true, order: 3 },
      { id: 'single', title: 'Anime Lẻ Đặc Sắc', enabled: true, order: 4 },
      { id: 'series', title: 'Anime Bộ Nổi Bật', enabled: true, order: 5 }
    ];

    const currentSections = sections_config.length ? sections_config : defaultSections;
    currentSections.sort((a, b) => (a.order || 0) - (b.order || 0));

    currentSections.forEach((sec, idx) => {
      const item = document.createElement('div');
      item.className = 'admin-section-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-weight: 700; color: var(--text-muted); font-size: 13px; width: 24px;">#${idx + 1}</span>
          <input type="number" class="sec-order-input" value="${sec.order || idx + 1}" min="1" max="20" style="width: 50px; padding: 4px 6px; background: #16161b; border: 1px solid var(--border-line); border-radius: 6px; color: #fff; font-size: 12px; text-align: center;">
          <strong style="color: #fff; font-size: 13.5px;">${sec.title || sec.id}</strong>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">(${sec.id})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">Hiển thị:</span>
          <label class="switch-toggle">
            <input type="checkbox" class="sec-enable-chk" ${sec.enabled !== false ? 'checked' : ''} data-sec-id="${sec.id}" data-sec-title="${sec.title || sec.id}">
            <span class="slider-round"></span>
          </label>
        </div>
      `;
      sectionsList.appendChild(item);
    });
  }

  // Nút Lưu cấu hình
  const saveBtn = document.getElementById('admin-save-homepage-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      const slugs = (spotlightInput?.value || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const items = sectionsList ? Array.from(sectionsList.querySelectorAll('.admin-section-item')) : [];
      const newSections = items.map((item, idx) => {
        const orderInput = item.querySelector('.sec-order-input');
        const chk = item.querySelector('.sec-enable-chk');
        return {
          id: chk?.getAttribute('data-sec-id') || `sec_${idx}`,
          title: chk?.getAttribute('data-sec-title') || 'Danh mục',
          enabled: Boolean(chk?.checked),
          order: parseInt(orderInput?.value, 10) || idx + 1
        };
      });

      const updateRes = await LinimeAPI.updateAdminHomepageConfig({
        spotlight_slugs: slugs,
        sections_config: newSections
      });

      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu cấu hình';

      if (updateRes.success) {
        showToast(updateRes.message || 'Đã lưu cấu hình trang chủ thành công');
      } else {
        showToast(updateRes.message || 'Lỗi lưu cấu hình');
      }
    };
  }
}

// ==========================================
// 8. FEEDBACK MANAGEMENT PANEL (PHASE 4)
// ==========================================
let currentFeedbackStatus = 'all';

async function loadAdminFeedback(status = currentFeedbackStatus) {
  currentFeedbackStatus = status;
  const tbody = document.getElementById('admin-feedback-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải phản hồi...</td></tr>`;
  }

  const res = await LinimeAPI.getAdminFeedback({ status: status === 'all' ? '' : status });
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải phản hồi'}</td></tr>`;
    return;
  }

  const feedbackList = res.feedback || [];
  if (!feedbackList.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không có phản hồi nào trong mục này.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    feedbackList.forEach(fb => {
      const tr = document.createElement('tr');
      const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleString('vi-VN') : '—';
      let statusBadge = '<span class="badge-role" style="font-size: 11px;">Chờ xem</span>';
      if (fb.status === 'reviewed') statusBadge = '<span class="badge-report-in_progress">Đã đọc</span>';
      if (fb.status === 'resolved') statusBadge = '<span class="badge-report-resolved">Đã xử lý</span>';

      tr.innerHTML = `
        <td><strong style="color: #fff;">${fb.name || 'Khách'}</strong></td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${fb.email || '—'}</span></td>
        <td><span style="font-size: 12.5px; color: #fff;">${fb.subject || 'Góp ý'}</span></td>
        <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fb.message || ''}">
          <span style="font-size: 12.5px; color: var(--text-muted);">${fb.message || ''}</span>
        </td>
        <td>${statusBadge}</td>
        <td><span style="font-size: 11.5px; color: var(--text-muted);">${dateStr}</span></td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            ${fb.status === 'pending'
              ? `<button type="button" class="table-btn table-btn-primary btn-mark-reviewed" title="Đánh dấu đã đọc">Đã đọc</button>`
              : ''}
            ${fb.status !== 'resolved'
              ? `<button type="button" class="table-btn table-btn-primary btn-mark-resolved" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;" title="Đánh dấu đã giải quyết/xử lý">Xử lý</button>`
              : '<span style="font-size: 11px; color: #2ecc71;">✓ Xong</span>'}
          </div>
        </td>
      `;

      tr.querySelector('.btn-mark-reviewed')?.addEventListener('click', async () => {
        const uRes = await LinimeAPI.updateAdminFeedback(fb.id, { status: 'reviewed' });
        if (uRes.success) {
          showToast('Đã đánh dấu là đã đọc');
          await loadAdminFeedback(currentFeedbackStatus);
        } else {
          showToast(uRes.message || 'Lỗi cập nhật');
        }
      });

      tr.querySelector('.btn-mark-resolved')?.addEventListener('click', async () => {
        const uRes = await LinimeAPI.updateAdminFeedback(fb.id, { status: 'resolved' });
        if (uRes.success) {
          showToast('Đã đánh dấu là đã giải quyết');
          await loadAdminFeedback(currentFeedbackStatus);
        } else {
          showToast(uRes.message || 'Lỗi cập nhật');
        }
      });

      tbody.appendChild(tr);
    });
  }
}

// ==========================================
// 9. AUDIT LOGS PANEL (PHASE 4)
// ==========================================
let currentAuditPage = 1;

async function loadAdminAuditLogs(page = 1) {
  currentAuditPage = page;
  const tbody = document.getElementById('admin-audit-tbody');
  const searchInput = document.getElementById('admin-audit-search');
  const actionFilter = document.getElementById('admin-audit-action-filter');
  const paginationRow = document.getElementById('admin-audit-pagination');
  const pageInfo = document.getElementById('admin-audit-page-info');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải nhật ký kiểm toán...</td></tr>`;
  }

  const q = searchInput?.value || '';
  const action = actionFilter?.value || '';

  const res = await LinimeAPI.getAdminAuditLogs({ q, action, page, limit: 25 });
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải nhật ký'}</td></tr>`;
    return;
  }

  const logs = res.logs || [];
  if (!logs.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có nhật ký nào được ghi lại.</td></tr>`;
    if (paginationRow) paginationRow.style.display = 'none';
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—';
      let actionClass = 'audit-badge-other';
      if (log.action.includes('CREATE') || log.action.includes('RESOLVE')) actionClass = 'audit-badge-create';
      else if (log.action.includes('UPDATE')) actionClass = 'audit-badge-update';
      else if (log.action.includes('BAN') || log.action.includes('DELETE')) actionClass = 'audit-badge-ban';

      let detailsStr = '';
      if (log.details) {
        try {
          const parsed = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
          detailsStr = JSON.stringify(parsed);
        } catch {
          detailsStr = String(log.details);
        }
      }

      tr.innerHTML = `
        <td><span style="font-size: 11.5px; color: var(--text-muted);">${dateStr}</span></td>
        <td>
          <strong style="color: #fff; font-size: 13px;">${log.admin_name || 'Admin'}</strong>
          ${log.admin_email ? `<div style="font-size: 11px; color: var(--text-muted);">${log.admin_email}</div>` : ''}
        </td>
        <td><span class="audit-badge ${actionClass}">${log.action}</span></td>
        <td>
          <span style="font-size: 12px; color: #fff;">${log.target_type || '—'}</span>
          ${log.target_id ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">#${log.target_id}</span>` : ''}
        </td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailsStr}">
          <code style="font-size: 11px; color: var(--text-muted);">${detailsStr}</code>
        </td>
        <td><span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${log.ip_address || '—'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (paginationRow && res.pagination) {
    paginationRow.style.display = 'flex';
    if (pageInfo) pageInfo.textContent = `Trang ${res.pagination.page} / ${res.pagination.totalPages} (${res.pagination.totalItems} nhật ký)`;
    const prevBtn = document.getElementById('admin-audit-prev-btn');
    const nextBtn = document.getElementById('admin-audit-next-btn');
    if (prevBtn) prevBtn.disabled = res.pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = res.pagination.page >= res.pagination.totalPages;
  }
}

// ==========================================
// 10. SYSTEM SETTINGS PANEL (PHASE 4)
// ==========================================
async function loadAdminSettings() {
  const nameInput = document.getElementById('admin-setting-sitename');
  const logoInput = document.getElementById('admin-setting-logo');
  const emailInput = document.getElementById('admin-setting-email');
  const announcementInput = document.getElementById('admin-setting-announcement');
  const maintenanceChk = document.getElementById('admin-setting-maintenance');
  const saveBtn = document.getElementById('admin-save-settings-btn');

  const res = await LinimeAPI.getAdminSettings();
  if (res.success && res.settings) {
    const s = res.settings;
    if (nameInput) nameInput.value = s.site_name || '';
    if (logoInput) logoInput.value = s.site_logo || '';
    if (emailInput) emailInput.value = s.contact_email || '';
    if (announcementInput) announcementInput.value = s.site_announcement || '';
    if (maintenanceChk) maintenanceChk.checked = Boolean(s.maintenance_mode);
  }

  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      const payload = {
        site_name: nameInput?.value?.trim() || 'Linime',
        site_logo: logoInput?.value?.trim() || '',
        contact_email: emailInput?.value?.trim() || '',
        site_announcement: announcementInput?.value?.trim() || '',
        maintenance_mode: Boolean(maintenanceChk?.checked)
      };

      const updateRes = await LinimeAPI.updateAdminSettings(payload);
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu cấu hình';

      if (updateRes.success) {
        showToast(updateRes.message || 'Đã lưu cài đặt hệ thống thành công');
      } else {
        showToast(updateRes.message || 'Lỗi lưu cài đặt');
      }
    };
  }
}

// ==========================================
// USER ACCOUNT & PLAYER SETTINGS VIEW (PHASE 4)
// ==========================================
async function loadAccountView() {
  const unauthView = document.getElementById('account-unauth');
  const contentView = document.getElementById('account-content');

  if (!state.user) {
    if (unauthView) unauthView.style.display = 'block';
    if (contentView) contentView.style.display = 'none';
    document.getElementById('account-login-btn')?.addEventListener('click', () => {
      document.getElementById('login-modal')?.classList.add('active');
    });
    return;
  }

  if (unauthView) unauthView.style.display = 'none';
  if (contentView) contentView.style.display = 'block';

  // Tải thông tin mới nhất từ máy chủ
  const res = await LinimeAPI.getAccountProfile();
  if (res.success && res.user) {
    state.user = res.user;
  }

  const u = state.user;
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=e50914&color=fff&bold=true`;
  const avatarSrc = u.avatar || fallbackAvatar;

  const avatarImg = document.getElementById('account-avatar-img');
  if (avatarImg) {
    avatarImg.onerror = () => { avatarImg.src = fallbackAvatar; };
    avatarImg.src = avatarSrc;
  }

  const nameEl = document.getElementById('account-profile-name');
  if (nameEl) nameEl.textContent = u.name || 'Người dùng';

  const emailEl = document.getElementById('account-profile-email');
  if (emailEl) emailEl.textContent = u.email || '—';

  const roleEl = document.getElementById('account-profile-role');
  if (roleEl) {
    roleEl.textContent = u.role === 'admin' ? 'Quản trị viên' : 'Thành viên';
    roleEl.className = u.role === 'admin' ? 'badge-role' : 'badge-role badge-report-dismissed';
  }

  const providerEl = document.getElementById('account-profile-provider');
  if (providerEl) providerEl.textContent = u.provider === 'google' ? 'Google OAuth' : 'Nội bộ';

  const createdEl = document.getElementById('account-profile-created');
  if (createdEl) createdEl.textContent = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

  // Form chỉnh sửa hồ sơ
  const nameInput = document.getElementById('account-input-name');
  if (nameInput) nameInput.value = u.name || '';

  const avatarInput = document.getElementById('account-input-avatar');
  if (avatarInput) avatarInput.value = u.avatar || '';

  const profileForm = document.getElementById('account-profile-form');
  if (profileForm) {
    profileForm.onsubmit = async (e) => {
      e.preventDefault();
      const newName = nameInput?.value?.trim();
      const newAvatar = avatarInput?.value?.trim() || null;
      if (!newName) {
        showToast('Tên hiển thị không được để trống');
        return;
      }

      const updateRes = await LinimeAPI.updateAccountProfile({ name: newName, avatar: newAvatar });
      if (updateRes.success && updateRes.user) {
        state.user = updateRes.user;
        updateUserUI();
        if (nameEl) nameEl.textContent = state.user.name;
        if (avatarImg) avatarImg.src = state.user.avatar || fallbackAvatar;
        showToast('Cập nhật thông tin cá nhân thành công!');
      } else {
        showToast(updateRes.message || 'Lỗi cập nhật hồ sơ');
      }
    };
  }

  // Tùy chọn xem phim (Player Preferences)
  const ps = u.player_settings || {};
  const autoNextChk = document.getElementById('pref-auto-next');
  const autoPlayChk = document.getElementById('pref-auto-play');
  const defaultSpeedSel = document.getElementById('pref-default-speed');
  const preferredQualitySel = document.getElementById('pref-preferred-quality');

  if (autoNextChk) autoNextChk.checked = ps.autoNext !== false;
  if (autoPlayChk) autoPlayChk.checked = ps.autoPlay !== false;
  if (defaultSpeedSel) defaultSpeedSel.value = String(ps.defaultSpeed || 1);
  if (preferredQualitySel) preferredQualitySel.value = ps.preferredQuality || 'auto';

  const saveSettingsBtn = document.getElementById('save-player-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.onclick = async () => {
      const newSettings = {
        autoNext: Boolean(autoNextChk?.checked),
        autoPlay: Boolean(autoPlayChk?.checked),
        defaultSpeed: parseFloat(defaultSpeedSel?.value) || 1,
        preferredQuality: preferredQualitySel?.value || 'auto'
      };

      const updateRes = await LinimeAPI.updateAccountProfile({ player_settings: newSettings });
      if (updateRes.success && updateRes.user) {
        state.user.player_settings = newSettings;
        showToast('Đã lưu tùy chọn xem phim vào tài khoản!');
      } else {
        showToast(updateRes.message || 'Lỗi lưu tùy chọn xem');
      }
    };
  }

  // Danh sách phiên hoạt động
  await renderAccountSessions();

  // Nút đăng xuất các thiết bị khác
  const revokeBtn = document.getElementById('revoke-others-btn');
  if (revokeBtn) {
    revokeBtn.onclick = () => {
      showConfirmModal({
        title: 'Đăng xuất khỏi thiết bị khác',
        message: 'Bạn có chắc chắn muốn thu hồi quyền truy cập của tất cả các phiên đăng nhập khác?',
        onConfirm: async () => {
          const revRes = await LinimeAPI.revokeOtherSessions();
          if (revRes.success) {
            showToast(revRes.message || 'Đã đăng xuất các thiết bị khác');
            await renderAccountSessions();
          } else {
            showToast(revRes.message || 'Lỗi thu hồi phiên đăng nhập');
          }
        }
      });
    };
  }
}

async function renderAccountSessions() {
  const sessionsContainer = document.getElementById('account-sessions-list');
  if (!sessionsContainer) return;

  sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">Đang tải danh sách thiết bị...</div>`;

  const res = await LinimeAPI.getAccountSessions();
  if (!res.success) {
    sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #ff5252; font-size: 13px;">${res.message || 'Lỗi tải danh sách phiên'}</div>`;
    return;
  }

  const sessions = res.sessions || [];
  if (!sessions.length) {
    sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">Không tìm thấy phiên làm việc nào.</div>`;
    return;
  }

  sessionsContainer.innerHTML = '';
  sessions.forEach(sess => {
    const card = document.createElement('div');
    card.className = `session-card-item ${sess.isCurrent ? 'current' : ''}`;
    const createdStr = sess.createdAt ? new Date(sess.createdAt).toLocaleString('vi-VN') : '—';

    card.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span class="session-device-icon">${sess.userAgent?.includes('Mobile') ? '📱' : '💻'}</span>
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <strong style="color: #fff; font-size: 13px;">${sess.userAgent ? sess.userAgent.split(' ')[0] : 'Trình duyệt Web'}</strong>
            ${sess.isCurrent ? '<span class="badge-user-active" style="font-size: 10.5px;">Thiết bị hiện tại</span>' : ''}
          </div>
          <div class="session-meta-sub">IP: ${sess.ipAddress || '—'} · Đăng nhập: ${createdStr}</div>
        </div>
      </div>
    `;
    sessionsContainer.appendChild(card);
  });
}

// ==========================================
// HELP & FAQ / FEEDBACK VIEW (PHASE 4)
// ==========================================
function loadHelpView() {
  // Accordion toggle
  const faqList = document.getElementById('faq-list');
  if (faqList) {
    faqList.querySelectorAll('.faq-header').forEach(header => {
      header.onclick = () => {
        const item = header.closest('.faq-item');
        if (item) {
          const isOpen = item.classList.contains('open');
          faqList.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
          if (!isOpen) item.classList.add('open');
        }
      };
    });
  }

  // Pre-fill user information if logged in
  const nameInput = document.getElementById('feedback-name');
  const emailInput = document.getElementById('feedback-email');
  if (state.user) {
    if (nameInput && !nameInput.value) nameInput.value = state.user.name || '';
    if (emailInput && !emailInput.value) emailInput.value = state.user.email || '';
  }

  // Form submit
  const form = document.getElementById('help-feedback-form');
  const submitBtn = document.getElementById('feedback-submit-btn');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const messageInput = document.getElementById('feedback-message');
      const subjectInput = document.getElementById('feedback-subject');

      const message = messageInput?.value?.trim();
      if (!message) {
        showToast('Nội dung phản hồi không được để trống');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';
      }

      const res = await LinimeAPI.sendFeedback({
        name: nameInput?.value?.trim() || undefined,
        email: emailInput?.value?.trim() || undefined,
        subject: subjectInput?.value || 'Góp ý chung',
        message
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi Phản Hồi';
      }

      if (res.success) {
        showToast(res.message || 'Cảm ơn bạn đã gửi phản hồi!');
        if (messageInput) messageInput.value = '';
      } else {
        showToast(res.message || 'Lỗi gửi phản hồi');
      }
    };
  }
}

function initAdminView() {
  // Navigation sidebar clicks
  document.querySelectorAll('#admin-nav-group .admin-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-admin-tab');
      if (tab) {
        router.navigate(`/admin/${tab}`);
      }
    });
  });

  // Open Admin button in user dropdown
  document.getElementById('open-admin-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.hidden = true;
    router.navigate('/admin/dashboard');
  });

  // Guard login button
  document.getElementById('admin-guard-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });

  // Dashboard refresh
  document.getElementById('admin-dashboard-refresh-btn')?.addEventListener('click', loadAdminDashboard);

  // Anime Management filters
  const animeSearchInput = document.getElementById('admin-anime-search');
  const animeVisSelect = document.getElementById('admin-anime-visibility-filter');
  const animeResetBtn = document.getElementById('admin-anime-filter-reset');
  const animePrevBtn = document.getElementById('admin-anime-prev-btn');
  const animeNextBtn = document.getElementById('admin-anime-next-btn');

  let animeSearchTimeout;
  animeSearchInput?.addEventListener('input', () => {
    clearTimeout(animeSearchTimeout);
    animeSearchTimeout = setTimeout(() => {
      loadAdminAnimeList(1);
    }, 350);
  });

  animeVisSelect?.addEventListener('change', () => {
    loadAdminAnimeList(1);
  });

  animeResetBtn?.addEventListener('click', () => {
    if (animeSearchInput) animeSearchInput.value = '';
    if (animeVisSelect) animeVisSelect.value = 'all';
    loadAdminAnimeList(1);
  });

  animePrevBtn?.addEventListener('click', () => {
    if (currentAdminAnimePage > 1) {
      loadAdminAnimeList(currentAdminAnimePage - 1);
    }
  });

  animeNextBtn?.addEventListener('click', () => {
    loadAdminAnimeList(currentAdminAnimePage + 1);
  });

  // Anime Edit Modal Events
  const animeEditModal = document.getElementById('admin-anime-edit-modal');
  const closeAnimeEditBtn = document.getElementById('close-admin-anime-modal-btn');
  const cancelAnimeEditBtn = document.getElementById('admin-anime-edit-cancel');
  const animeEditForm = document.getElementById('admin-anime-edit-form');

  const closeAnimeModal = () => animeEditModal?.classList.remove('active');
  closeAnimeEditBtn?.addEventListener('click', closeAnimeModal);
  cancelAnimeEditBtn?.addEventListener('click', closeAnimeModal);
  animeEditModal?.addEventListener('click', (e) => {
    if (e.target === animeEditModal) closeAnimeModal();
  });

  animeEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const animeId = document.getElementById('admin-edit-anime-id')?.value;
    if (!animeId) return;

    const payload = {
      title_vietnamese: document.getElementById('admin-edit-title-vi')?.value.trim(),
      title_english: document.getElementById('admin-edit-title-en')?.value.trim(),
      description: document.getElementById('admin-edit-desc')?.value.trim(),
      cover_image: document.getElementById('admin-edit-poster')?.value.trim(),
      banner_image: document.getElementById('admin-edit-banner')?.value.trim(),
      genres: document.getElementById('admin-edit-genres')?.value.split(',').map(s => s.trim()).filter(Boolean),
      status: document.getElementById('admin-edit-status')?.value || undefined,
      notes: document.getElementById('admin-edit-notes')?.value.trim(),
      is_hidden: Boolean(document.getElementById('admin-edit-hidden')?.checked)
    };

    const saveBtn = document.getElementById('admin-anime-edit-save');
    if (saveBtn) saveBtn.textContent = 'Đang lưu...';

    const res = await LinimeAPI.updateAdminAnime(animeId, payload);
    if (saveBtn) saveBtn.textContent = 'Lưu thay đổi';

    if (res.success) {
      showToast('Cập nhật thông tin anime thành công!');
      closeAnimeModal();
      await loadAdminAnimeList(currentAdminAnimePage);
    } else {
      showToast(res.message || 'Lỗi lưu thông tin anime');
    }
  });

  // Episode Edit Modal Events
  const epEditModal = document.getElementById('admin-ep-edit-modal');
  const closeEpEditBtn = document.getElementById('close-admin-ep-modal-btn');
  const cancelEpEditBtn = document.getElementById('admin-ep-edit-cancel');
  const epEditForm = document.getElementById('admin-ep-edit-form');
  const epTestLinkBtn = document.getElementById('admin-ep-test-link-btn');

  const closeEpModal = () => epEditModal?.classList.remove('active');
  closeEpEditBtn?.addEventListener('click', closeEpModal);
  cancelEpEditBtn?.addEventListener('click', closeEpModal);
  epEditModal?.addEventListener('click', (e) => {
    if (e.target === epEditModal) closeEpModal();
  });

  epTestLinkBtn?.addEventListener('click', async () => {
    const animeSlug = document.getElementById('admin-ep-edit-anime-id')?.value;
    const epNum = document.getElementById('admin-ep-edit-num')?.value;
    const embedUrl = document.getElementById('admin-ep-edit-embed')?.value.trim();
    const resultDiv = document.getElementById('admin-ep-check-result');

    if (!embedUrl) {
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.color = '#ff9800';
        resultDiv.textContent = 'Vui lòng nhập đường dẫn nhúng trước khi kiểm tra.';
      }
      return;
    }

    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = 'var(--text-muted)';
      resultDiv.textContent = 'Đang kiểm tra kết nối nguồn...';
    }

    const res = await LinimeAPI.checkAdminEpisode(animeSlug, epNum, embedUrl);
    if (resultDiv) {
      if (res.status === 'healthy') {
        resultDiv.style.color = '#2ecc71';
        resultDiv.textContent = `✓ Nguồn phát hoạt động tốt (HTTP ${res.httpStatus || 200})`;
      } else {
        resultDiv.style.color = '#ff5c72';
        resultDiv.textContent = `⚠️ Link không phản hồi bình thường: ${res.message || 'Mã HTTP ' + (res.httpStatus || 'lỗi')}`;
      }
    }
  });

  epEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const animeSlug = document.getElementById('admin-ep-edit-anime-id')?.value;
    const epNum = document.getElementById('admin-ep-edit-num')?.value;
    if (!animeSlug || !epNum) return;

    const payload = {
      embed_url: document.getElementById('admin-ep-edit-embed')?.value.trim() || null,
      notes: document.getElementById('admin-ep-edit-notes')?.value.trim(),
      is_hidden: Boolean(document.getElementById('admin-ep-edit-hidden')?.checked)
    };

    const saveBtn = document.getElementById('admin-ep-edit-save');
    if (saveBtn) saveBtn.textContent = 'Đang lưu...';

    const res = await LinimeAPI.updateAdminEpisode(animeSlug, epNum, payload);
    if (saveBtn) saveBtn.textContent = 'Lưu tập phim';

    if (res.success) {
      showToast(`Đã lưu cấu hình Tập ${epNum}!`);
      closeEpModal();
      await loadAdminEpisodes(animeSlug);
    } else {
      showToast(res.message || 'Lỗi lưu cấu hình tập phim');
    }
  });

  // Data Sync Panel Events
  document.getElementById('admin-sync-refresh-btn')?.addEventListener('click', loadAdminSync);

  // Single Anime Sync
  document.getElementById('admin-sync-single-btn')?.addEventListener('click', async () => {
    const slugInput = document.getElementById('admin-sync-single-slug');
    const statusDiv = document.getElementById('admin-sync-single-status');
    const slug = slugInput?.value.trim();

    if (!slug) {
      showToast('Vui lòng nhập slug anime cần đồng bộ');
      return;
    }

    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = 'var(--text-muted)';
      statusDiv.textContent = `⏳ Đang đồng bộ "${slug}" từ máy chủ...`;
    }

    const res = await LinimeAPI.syncAdminAnime(slug);
    if (res.success) {
      if (statusDiv) {
        statusDiv.style.color = '#2ecc71';
        statusDiv.textContent = `✓ ${res.message || 'Đồng bộ hoàn tất'}`;
      }
      showToast(`Đã đồng bộ thành công "${slug}"`);
      if (slugInput) slugInput.value = '';
    } else {
      if (statusDiv) {
        statusDiv.style.color = '#ff5c72';
        statusDiv.textContent = `⚠️ ${res.message || 'Đồng bộ thất bại'}`;
      }
      showToast(res.message || 'Lỗi đồng bộ anime');
    }
    await loadAdminSync();
  });

  // Recent Catalog Sync
  document.getElementById('admin-sync-recent-btn')?.addEventListener('click', async () => {
    const pageSelect = document.getElementById('admin-sync-recent-page');
    const statusDiv = document.getElementById('admin-sync-recent-status');
    const page = Number(pageSelect?.value || 1);

    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = 'var(--text-muted)';
      statusDiv.textContent = `⏳ Đang đồng bộ danh mục phim trang ${page}...`;
    }

    const res = await LinimeAPI.syncAdminRecent(page);
    if (res.success) {
      if (statusDiv) {
        statusDiv.style.color = '#2ecc71';
        statusDiv.textContent = `✓ ${res.message || 'Đồng bộ catalog hoàn tất'}`;
      }
      showToast(`Đã đồng bộ danh mục trang ${page}`);
    } else {
      if (statusDiv) {
        statusDiv.style.color = '#ff5c72';
        statusDiv.textContent = `⚠️ ${res.message || 'Đồng bộ thất bại'}`;
      }
      showToast(res.message || 'Lỗi đồng bộ danh mục');
    }
    await loadAdminSync();
  });

  // Reports Panel Events
  document.getElementById('admin-reports-refresh-btn')?.addEventListener('click', loadAdminReports);

  // Status Filter Pills
  document.querySelectorAll('#admin-reports-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-reports-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAdminReportFilter.status = btn.getAttribute('data-report-status') || 'all';
      loadAdminReports();
    });
  });

  // Issue Type Filter
  document.getElementById('admin-reports-type-filter')?.addEventListener('change', (e) => {
    currentAdminReportFilter.issue_type = e.target.value;
    loadAdminReports();
  });

  // Report Process Modal Events
  const reportModal = document.getElementById('admin-report-process-modal');
  const closeReportModalBtn = document.getElementById('close-admin-report-modal-btn');
  const cancelReportModalBtn = document.getElementById('admin-report-process-cancel');
  const reportProcessForm = document.getElementById('admin-report-process-form');

  const closeReportModal = () => reportModal?.classList.remove('active');
  closeReportModalBtn?.addEventListener('click', closeReportModal);
  cancelReportModalBtn?.addEventListener('click', closeReportModal);
  reportModal?.addEventListener('click', (e) => {
    if (e.target === reportModal) closeReportModal();
  });

  reportProcessForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reportId = document.getElementById('admin-report-process-id')?.value;
    if (!reportId) return;

    const payload = {
      status: document.getElementById('admin-report-process-status')?.value || 'pending',
      admin_notes: document.getElementById('admin-report-process-notes')?.value.trim()
    };

    const res = await LinimeAPI.updateAdminReport(reportId, payload);
    if (res.success) {
      showToast('Đã cập nhật trạng thái phản ánh!');
      closeReportModal();
      await loadAdminReports();
      await loadAdminDashboard();
    } else {
      showToast(res.message || 'Lỗi cập nhật phản ánh');
    }
  });

  // Users Refresh
  document.getElementById('admin-users-refresh-btn')?.addEventListener('click', loadAdminUsers);

  // Users Search & Status Filter (Phase 4)
  const userSearchInput = document.getElementById('admin-users-search-input');
  let userSearchTimeout;
  userSearchInput?.addEventListener('input', () => {
    clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(() => {
      currentAdminUserSearch = userSearchInput.value.trim();
      loadAdminUsers();
    }, 350);
  });

  document.querySelectorAll('#admin-users-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-users-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAdminUserStatus = btn.getAttribute('data-user-status') || 'all';
      loadAdminUsers();
    });
  });

  // Ban User Modal Events (Phase 4)
  const banModal = document.getElementById('admin-user-ban-modal');
  const closeBanModalBtn = document.getElementById('close-admin-ban-modal-btn');
  const cancelBanModalBtn = document.getElementById('admin-ban-cancel-btn');
  const banForm = document.getElementById('admin-ban-modal-form');

  const closeBanModal = () => banModal?.classList.remove('active');
  closeBanModalBtn?.addEventListener('click', closeBanModal);
  cancelBanModalBtn?.addEventListener('click', closeBanModal);
  banModal?.addEventListener('click', (e) => {
    if (e.target === banModal) closeBanModal();
  });

  banForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('admin-ban-user-id')?.value;
    const reason = document.getElementById('admin-ban-reason-input')?.value.trim();
    if (!userId) return;

    if (!reason) {
      showToast('Vui lòng nhập lý do khóa tài khoản');
      return;
    }

    const res = await LinimeAPI.banAdminUser(userId, { is_banned: true, ban_reason: reason });
    if (res.success) {
      showToast('Đã khóa tài khoản người dùng thành công');
      closeBanModal();
      await loadAdminUsers();
    } else {
      showToast(res.message || 'Lỗi khóa tài khoản');
    }
  });

  // Feedback Panel Events (Phase 4)
  document.getElementById('admin-feedback-refresh-btn')?.addEventListener('click', () => loadAdminFeedback(currentFeedbackStatus));
  document.querySelectorAll('#admin-feedback-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-feedback-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const st = btn.getAttribute('data-feedback-status') || 'all';
      loadAdminFeedback(st);
    });
  });

  // Audit Logs Panel Events (Phase 4)
  document.getElementById('admin-audit-refresh-btn')?.addEventListener('click', () => loadAdminAuditLogs(currentAuditPage));
  const auditSearchInput = document.getElementById('admin-audit-search');
  let auditSearchTimeout;
  auditSearchInput?.addEventListener('input', () => {
    clearTimeout(auditSearchTimeout);
    auditSearchTimeout = setTimeout(() => {
      loadAdminAuditLogs(1);
    }, 350);
  });
  document.getElementById('admin-audit-action-filter')?.addEventListener('change', () => {
    loadAdminAuditLogs(1);
  });
  document.getElementById('admin-audit-prev-btn')?.addEventListener('click', () => {
    if (currentAuditPage > 1) loadAdminAuditLogs(currentAuditPage - 1);
  });
  document.getElementById('admin-audit-next-btn')?.addEventListener('click', () => {
    loadAdminAuditLogs(currentAuditPage + 1);
  });
}

async function restoreUserSession() {
  const token = LinimeAPI.getToken();
  if (!token) {
    state.user = null;
    updateUserUI();
    return;
  }

  try {
    const res = await LinimeAPI.getMe();
    if (res.success && res.user) {
      state.user = res.user;
      localStorage.setItem('anidoki_user', JSON.stringify(res.user));
    } else {
      state.user = null;
      state.watchlistIds = [];
      LinimeAPI.clearToken();
      localStorage.removeItem('anidoki_user');
      localStorage.removeItem('linime_user');
      if (res.code === 'SESSION_EXPIRED') {
        showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (res.code === 'ACCOUNT_BANNED') {
        showToast(res.message || 'Tài khoản của bạn đã bị khóa.');
      }
    }
  } catch {
    state.user = null;
  }
  updateUserUI();
}

function initLoginModal() {
  const modal = document.getElementById('login-modal');
  const openLoginBtn = document.getElementById('open-login-btn');
  const userDropdown = document.getElementById('user-dropdown');
  const logoutBtn = document.getElementById('logout-btn');
  const googleBtn = document.getElementById('google-login-btn');

  // Đóng dropdown khi bấm vào các mục bên trong
  userDropdown?.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', () => {
      userDropdown.hidden = true;
    });
  });

  const handleLoginSuccess = async (user) => {
    state.user = user;
    localStorage.setItem('anidoki_user', JSON.stringify(user));
    updateUserUI();
    modal.classList.remove('active');
    showToast(`Đăng nhập thành công! Chào mừng ${user.name}`);
    if (googleBtn) {
      googleBtn.disabled = false;
      const span = googleBtn.querySelector('span');
      if (span) span.textContent = 'Tiếp tục với Google';
    }
    await refreshWatchlistCount();
    await loadContinueWatching();
  };

  // Khởi tạo Google SDK khi script đã tải
  if (window.google) {
    initGoogleServices(handleLoginSuccess);
  } else {
    window.addEventListener('load', () => initGoogleServices(handleLoginSuccess));
  }

  // Click nút User / Đăng nhập
  openLoginBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.user) {
      userDropdown.hidden = !userDropdown.hidden;
    } else {
      modal.classList.add('active');
    }
  });

  // Đóng dropdown khi click bên ngoài
  document.addEventListener('click', (e) => {
    if (userDropdown && !userDropdown.hidden && !userDropdown.contains(e.target) && e.target !== openLoginBtn) {
      userDropdown.hidden = true;
    }
  });

  // Nút Đăng xuất
  logoutBtn?.addEventListener('click', async () => {
    await LinimeAPI.logout();
    state.user = null;
    state.watchlistIds = [];
    localStorage.removeItem('anidoki_user');
    localStorage.removeItem('linime_user');
    updateUserUI();
    await refreshWatchlistCount();
    await loadContinueWatching();
    showToast('Đã đăng xuất tài khoản.');
  });

  document.getElementById('close-login-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  // Bấm Đăng nhập bằng Google (Chỉ chấp nhận luồng xác thực Google thực tế)
  googleBtn?.addEventListener('click', async () => {
    if (!googleTokenClient && window.google?.accounts?.oauth2) {
      initGoogleServices(handleLoginSuccess);
    }

    if (googleTokenClient) {
      const span = googleBtn.querySelector('span');
      if (span) span.textContent = 'Đang mở cửa sổ Google...';
      googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } else if (window.google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      showToast('Không thể kết nối đến Google Identity Services. Vui lòng kiểm tra chặn quảng cáo/kết nối mạng và thử lại.');
      if (googleBtn) {
        const span = googleBtn.querySelector('span');
        if (span) span.textContent = 'Tiếp tục với Google';
      }
    }
  });
}

// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  registerRoutes();
  initMovies();
  initHeader();
  initGenreDropdown();
  await restoreUserSession();
  await refreshWatchlistCount();
  await loadSpotlight();
  await loadCatalogs();
  initDetailEvents();
  initPlayerControls();
  initReportModal();
  await initBrowseView();
  initLibraryView();
  initHistoryView();
  initSearchModal();
  initWatchlistDrawer();
  initLoginModal();
  initAdminView();

  // Kích hoạt route hiện tại trên URL
  router.handleRoute();
});

