-- Khởi tạo Schema PostgreSQL cho Linime Anime Streaming Web

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    avatar TEXT,
    provider VARCHAR(50) DEFAULT 'local',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS animes (
    id INTEGER PRIMARY KEY,
    title_vietnamese VARCHAR(255),
    title_english VARCHAR(255) NOT NULL,
    title_romaji VARCHAR(255),
    title_native VARCHAR(255),
    logo TEXT,
    cover_image TEXT NOT NULL,
    banner_image TEXT,
    score NUMERIC(3, 1) DEFAULT 0,
    studio VARCHAR(255),
    genres JSONB DEFAULT '[]',
    format VARCHAR(50) DEFAULT 'TV',
    duration VARCHAR(50),
    status VARCHAR(100),
    year INTEGER,
    start_date VARCHAR(100),
    total_episodes INTEGER,
    current_episode INTEGER,
    next_airing_episode INTEGER,
    next_airing_at BIGINT,
    next_airing_offset INTEGER,
    description TEXT,
    is_trending BOOLEAN DEFAULT FALSE,
    is_spotlight BOOLEAN DEFAULT FALSE,
    is_movie BOOLEAN DEFAULT FALSE,
    season VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS episodes (
    id SERIAL PRIMARY KEY,
    anime_id INTEGER REFERENCES animes(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title VARCHAR(255),
    duration VARCHAR(50),
    video_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anime_id, episode_number)
);

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) DEFAULT 'usr_001',
    anime_id INTEGER REFERENCES animes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS watch_history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) DEFAULT 'usr_001',
    anime_id INTEGER REFERENCES animes(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    progress_seconds INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, anime_id)
);

-- Index tối ưu truy vấn tìm kiếm và lọc
CREATE INDEX IF NOT EXISTS idx_animes_trending ON animes(is_trending);
CREATE INDEX IF NOT EXISTS idx_animes_spotlight ON animes(is_spotlight);
CREATE INDEX IF NOT EXISTS idx_animes_status ON animes(status);
CREATE INDEX IF NOT EXISTS idx_animes_format ON animes(format);
CREATE INDEX IF NOT EXISTS idx_episodes_anime_id ON episodes(anime_id);
