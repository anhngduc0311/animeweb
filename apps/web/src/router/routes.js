import { router } from '../router.js';
import { switchView } from '../utils/ui.js';
import { loadBrowseView } from '../views/BrowseView.js';
import { openAnimeDetail } from '../views/DetailView.js';
import { openPlayerByRoute } from '../views/PlayerView.js';
import { loadLibraryView } from '../views/LibraryView.js';
import { loadHistoryView } from '../views/HistoryView.js';
import { loadAccountView } from '../views/AccountView.js';
import { loadHelpView } from '../views/HelpView.js';
import { loadAdminView } from '../views/AdminView.js';

import { startSpotlightTimer } from '../views/HomeView.js';

// SPA ROUTE REGISTRATION
// ==========================================
export function registerRoutes() {
  router
    .addRoute('/', () => {
      switchView('view-home');
      document.title = 'anidoki — Xem anime online';
      startSpotlightTimer();
    })
    .addRoute('/browse', (route) => {
      switchView('view-browse');
      document.title = 'Khám Phá Anime | anidoki';
      return loadBrowseView(route);
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
      return loadLibraryView();
    })
    .addRoute('/history', () => {
      switchView('view-history');
      document.title = 'Lịch Sử Xem Phim | anidoki';
      return loadHistoryView();
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


