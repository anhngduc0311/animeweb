import { LinimeAPI } from '../api.js';
import { state } from '../store/state.js';
import { router } from '../router.js';
import { showToast } from '../utils/ui.js';
import { renderCard } from './MovieCard.js';
import { updateUserUI } from './AuthModal.js';
import { seriesKey } from '../../../../shared/series.js';
import { openAnimeDetail } from '../views/DetailView.js';

// HEADER SCROLL & WATCHLIST BADGE
// ==========================================
export function initHeader() {
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

export function initGenreDropdown() {
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

export async function refreshWatchlistCount() {
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


// LIVE SEARCH MODAL (API SEARCH)
// ==========================================
export function initSearchModal() {
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
export function initWatchlistDrawer() {
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



