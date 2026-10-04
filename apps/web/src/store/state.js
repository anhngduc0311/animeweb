// Central Application State
export const state = {
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
  user: JSON.parse(localStorage.getItem('linime_user') || localStorage.getItem('anidoki_user') || 'null')
};

export function getUser() {
  return state.user;
}

export function setUser(user) {
  state.user = user;
  if (user) {
    localStorage.setItem('linime_user', JSON.stringify(user));
    localStorage.setItem('anidoki_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('linime_user');
    localStorage.removeItem('anidoki_user');
    state.watchlistIds = [];
  }
}
