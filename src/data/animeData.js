// Dữ liệu Anime chất lượng cao chuẩn AniList / Linime với Artwork, Banner, và Đếm ngược
export const INITIAL_ANIME_DATA = [
  {
    id: 21,
    title: {
      vietnamese: "One Piece (Đảo Hải Tặc)",
      english: "ONE PIECE",
      romaji: "ONE PIECE",
      native: "ワンピース"
    },
    logo: "https://images.metahub.space/logo/medium/tt0388629/img",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx21-tWPEe3eQUjhD.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJSpdH.jpg",
    score: 8.7,
    studio: "Toei Animation",
    genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy"],
    format: "TV",
    duration: "24 min",
    status: "Currently Airing",
    year: 1999,
    startDate: "Oct 20, 1999",
    totalEpisodes: 1180,
    currentEpisode: 1180,
    nextAiring: {
      episode: 1181,
      // Thời điểm phát sóng tập kế tiếp (timestamp tính bằng giây hoặc tương đối)
      airingAt: Date.now() + (92 * 86400 + 7 * 60 + 24) * 1000
    },
    description: `Gol D. Roger là vua hải tặc huyền thoại, người đã tìm ra kho báu tối thượng mang tên One Piece. Trước khi bị hành quyết, ông đã tuyên bố rằng kho báu của mình được giấu ở Đại Hải Trình (Grand Line), mở ra Kỷ Nguyên Đại Hải Tặc. 
    Monkey D. Luffy, một cậu bé mang trong mình ước mơ cháy bỏng trở thành Vua Hải Tặc, cùng chiếc mũ rơm biểu tượng và khả năng co giãn cơ thể nhờ trái ác quỷ Gomu Gomu, bắt đầu cuộc hành trình phiêu lưu vượt đại dương, tập hợp những đồng đội tuyệt vời nhất trên con tàu Thousand Sunny.`,
    isTrending: true,
    isSpotlight: true,
    season: "FALL 2026",
    episodes: Array.from({ length: 24 }, (_, i) => ({
      number: 1180 - i,
      title: `Tập ${1180 - i}: Trận Chiến Quyết Định Tại Đảo Egghead`,
      thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJSpdH.jpg",
      duration: "23:50",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    }))
  },
  {
    id: 195516,
    title: {
      vietnamese: "Dược Sư Tự Sự Mùa 3",
      english: "The Apothecary Diaries Season 3",
      romaji: "Kusuriya no Hitorigoto 3rd Season",
      native: "薬屋のひとりごと 第3期"
    },
    logo: "https://image.tmdb.org/t/p/original/m9mFjU5y96v9vJj9eP3f6h1b2wA.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx195516-MJpUZlOberqH.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/195516-MJpUZlOberqH.jpg",
    score: 8.8,
    studio: "TOHO animation / OLM",
    genres: ["Drama", "Mystery", "Historical"],
    format: "TV",
    duration: "24 min",
    status: "Currently Airing",
    year: 2026,
    startDate: "Oct 2026",
    totalEpisodes: 24,
    currentEpisode: 3,
    nextAiring: {
      episode: 4,
      airingAt: Date.now() + (5 * 86400 + 14 * 3600 + 30 * 60) * 1000
    },
    description: `Sau những biến động tại hậu cung và những âm mưu thâm độc được vạch trần, Miêu Miêu tiếp tục vận dụng trí tuệ phi phàm cùng kiến thức sâu rộng về dược thảo, độc dược của mình để giải mã những bí ẩn nguy hiểm trong cung đình của Nhâm Thị.`,
    isTrending: true,
    isSpotlight: true,
    season: "FALL 2026",
    episodes: [
      { number: 3, title: "Tập 3: Mùi Hương Độc Bí Ẩn", duration: "24:10", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
      { number: 2, title: "Tập 2: Thử Độc Tại Ngự Hoa Viên", duration: "24:00", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
      { number: 1, title: "Tập 1: Trở Lại Hậu Cung", duration: "24:15", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" }
    ]
  },
  {
    id: 113415,
    title: {
      vietnamese: "Chú Thuật Hồi Chiến Mùa 3 (Culling Game)",
      english: "JUJUTSU KAISEN: Culling Game",
      romaji: "Jujutsu Kaisen: Shimetsu Kaiyuu",
      native: "呪術廻戦 死滅回游"
    },
    logo: "https://image.tmdb.org/t/p/original/tEmqJ1k4MdjuaKaetn8wGyZGcyC.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg",
    score: 8.9,
    studio: "MAPPA",
    genres: ["Action", "Supernatural", "Fantasy"],
    format: "TV",
    duration: "24 min",
    status: "Currently Airing",
    year: 2026,
    startDate: "Jul 2026",
    totalEpisodes: 24,
    currentEpisode: 12,
    nextAiring: {
      episode: 13,
      airingAt: Date.now() + (3 * 86400 + 8 * 3600) * 1000
    },
    description: `Sau Sự Kiện Shibuya thảm khốc, Kenjaku kích hoạt Trò Chơi Tử Diệt (Culling Game) buộc các chú thuật sư và nguyền hồn phải tàn sát lẫn nhau trong các kết giới khắp Nhật Bản. Yuji Itadori, Megumi Fushiguro cùng Yuta Okkotsu phải chạy đua với thời gian để cứu lấy Tsumiki và giải phong ấn cho Satoru Gojo.`,
    isTrending: true,
    isSpotlight: true,
    season: "FALL 2026",
    episodes: Array.from({ length: 12 }, (_, i) => ({
      number: 12 - i,
      title: `Tập ${12 - i}: Vùng Đất Chết Tokyo Đệ Nhất Kết Giới`,
      duration: "23:45",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
    }))
  },
  {
    id: 101922,
    title: {
      vietnamese: "Thanh Gươm Diệt Quỷ: Pháo Đài Vô Cực",
      english: "Demon Slayer: Kimetsu no Yaiba - Infinity Castle Arc",
      romaji: "Kimetsu no Yaiba: Mugen Jou-hen",
      native: "鬼滅の刃 無限城編"
    },
    logo: "https://image.tmdb.org/t/p/original/ecghlDeabR3X3Vv8tXIOeXHQvQe.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgLd.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg",
    score: 9.0,
    studio: "ufotable",
    genres: ["Action", "Fantasy", "Historical"],
    format: "MOVIE",
    duration: "115 min",
    status: "Finished Airing",
    year: 2026,
    startDate: "2026",
    totalEpisodes: 1,
    currentEpisode: 1,
    nextAiring: null,
    description: `Trận quyết chiến định mệnh giữa Quân Đoàn Diệt Quỷ và Quỷ Vương Kibutsuji Muzan cùng các Thượng Huyền Quỷ diễn ra trong Pháo Đài Vô Cực đầy biến hóa. Tanjiro và các Trụ Cột dốc toàn bộ sinh mạng để chấm dứt ngàn năm bóng tối.`,
    isTrending: true,
    isSpotlight: true,
    isMovie: true,
    season: "SUMMER 2026",
    episodes: [
      { number: 1, title: "Phim Chiếu Rạp: Hồi 1 - Rơi Vào Vô Cực Thành", duration: "115:00", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4" }
    ]
  },
  {
    id: 154587,
    title: {
      vietnamese: "Frieren: Pháp Sư Tiễn Táng Mùa 2",
      english: "Frieren: Beyond Journey's End Season 2",
      romaji: "Sousou no Frieren 2nd Season",
      native: "葬送のフリーレン 第2期"
    },
    logo: "https://image.tmdb.org/t/p/original/yR6pY2FjHl13UjN2O20hMtz0H2b.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n2hrHjcWvVIq.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-y5H0s88A8y8E.jpg",
    score: 9.1,
    studio: "Madhouse",
    genres: ["Adventure", "Drama", "Fantasy"],
    format: "TV",
    duration: "24 min",
    status: "Currently Airing",
    year: 2026,
    startDate: "Jan 2026",
    totalEpisodes: 16,
    currentEpisode: 8,
    nextAiring: {
      episode: 9,
      airingAt: Date.now() + (2 * 86400 + 4 * 3600) * 1000
    },
    description: `Hành trình về phương Bắc hướng tới vùng đất linh hồn Aureole của nữ pháp sư elf Frieren cùng đệ tử Fern và chiến binh Stark tiếp tục. Những ký ức xưa cũ về Dũng giả Himmel và bài học về sự thấu hiểu lòng người lại ùa về.`,
    isTrending: true,
    isSpotlight: false,
    season: "FALL 2026",
    episodes: Array.from({ length: 8 }, (_, i) => ({
      number: 8 - i,
      title: `Tập ${8 - i}: Ranh Giới Phương Bắc Và Bài Học Của Thời Gian`,
      duration: "24:20",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
    }))
  },
  {
    id: 171627,
    title: {
      vietnamese: "Chainsaw Man – Movie: Reze Arc",
      english: "Chainsaw Man – The Movie: Reze Arc",
      romaji: "Chainsaw Man: Reze-hen",
      native: "チェンソーマン 劇場版 レゼ篇"
    },
    logo: "https://image.tmdb.org/t/p/original/mKsk3o3vGk3h3lR3kK0P0b8cM2x.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171627-ZN9D7P46yHnw.png",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/171627-ZN9D7P46yHnw.png",
    score: 8.8,
    studio: "MAPPA",
    genres: ["Action", "Horror", "Romance", "Supernatural"],
    format: "MOVIE",
    duration: "95 min",
    status: "Finished Airing",
    year: 2026,
    startDate: "2026",
    totalEpisodes: 1,
    currentEpisode: 1,
    nextAiring: null,
    description: `Denji gặp gỡ Reze, một cô gái bí ẩn làm việc tại quán cà phê trong cơn mưa rào. Tình cảm rung động đầu đời bỗng chốc biến thành chiến trường khốc liệt khi danh tính thật của Reze - Quỷ Bom - được phơi bày.`,
    isTrending: true,
    isMovie: true,
    season: "SUMMER 2026",
    episodes: [
      { number: 1, title: "Bản Điện Ảnh Full HD: Quỷ Bom Reze & Bản Năng Người Cưa", duration: "95:00", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4" }
    ]
  },
  {
    id: 151807,
    title: {
      vietnamese: "Thăng Cấp Một Mình Mùa 2",
      english: "Solo Leveling Season 2 - Arise from the Shadow",
      romaji: "Ore dake Level Up na Ken Season 2",
      native: "俺だけレベルアップな件 2nd Season"
    },
    logo: "https://image.tmdb.org/t/p/original/jB6qU4WdG1J4r2fG1x0z3pQ3.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-u0u0c3k8Yt.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-banner.jpg",
    score: 8.6,
    studio: "A-1 Pictures",
    genres: ["Action", "Adventure", "Fantasy"],
    format: "TV",
    duration: "24 min",
    status: "Currently Airing",
    year: 2026,
    startDate: "Jan 2026",
    totalEpisodes: 13,
    currentEpisode: 10,
    nextAiring: {
      episode: 11,
      airingAt: Date.now() + (6 * 86400 + 2 * 3600) * 1000
    },
    description: `Sung Jinwoo thức tỉnh sức mạnh Chúa Tể Bóng Tối, dẫn dắt đội quân bóng ma trỗi dậy từ những hầm ngục cấp S nguy hiểm nhất hành tinh.`,
    isTrending: true,
    season: "WINTER 2026",
    episodes: Array.from({ length: 10 }, (_, i) => ({
      number: 10 - i,
      title: `Tập ${10 - i}: Đội Quân Bóng Tối Trỗi Dậy Cấp S`,
      duration: "24:00",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
    }))
  },
  {
    id: 16498,
    title: {
      vietnamese: "Đại Chiến Titan (Attack on Titan)",
      english: "Attack on Titan",
      romaji: "Shingeki no Kyojin",
      native: "進撃の巨人"
    },
    logo: "https://image.tmdb.org/t/p/original/csy774JSTIoo4KUkrFWtU9SHA8j.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-m5ZNG46Ccwh5.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg",
    score: 9.0,
    studio: "WIT Studio / MAPPA",
    genres: ["Action", "Drama", "Fantasy", "Mystery"],
    format: "TV",
    duration: "24 min",
    status: "Finished Airing",
    year: 2013,
    startDate: "Apr 7, 2013",
    totalEpisodes: 89,
    currentEpisode: 89,
    nextAiring: null,
    description: `Con người sống ẩn mình sau ba bức tường khổng lồ để tránh loài Titan ăn thịt người. Vào ngày bức tường thành Maria sụp đổ, Eren Yeager thề sẽ tiêu diệt tất cả Titan trên cõi đời này.`,
    isTrending: false,
    season: "SPRING 2013",
    episodes: Array.from({ length: 12 }, (_, i) => ({
      number: 12 - i,
      title: `Tập ${12 - i}: Vết Rách Thành Phố & Tự Do Tuyệt Đối`,
      duration: "24:00",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    }))
  },
  {
    id: 21519,
    title: {
      vietnamese: "Your Name. (Tên Cậu Là Gì?)",
      english: "Your Name.",
      romaji: "Kimi no Na wa.",
      native: "君の名は。"
    },
    logo: "https://image.tmdb.org/t/p/original/zKI7UKmsB5ywy6Rjs3wWvBfhafJ.png",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21519-XIrAlFnvGV7b.png",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21519-1ayMXgNlmByb.jpg",
    score: 8.9,
    studio: "CoMix Wave Films",
    genres: ["Drama", "Romance", "Supernatural"],
    format: "MOVIE",
    duration: "106 min",
    status: "Finished Airing",
    year: 2016,
    startDate: "Aug 26, 2016",
    totalEpisodes: 1,
    currentEpisode: 1,
    nextAiring: null,
    description: `Mitsuha là nữ sinh ở vùng quê mơ ước cuộc sống Tokyo náo nhiệt. Taki là nam sinh trung học ở Tokyo. Trong giấc mơ, họ hoán đổi thân xác cho nhau qua một sợi chỉ định mệnh musubi vượt thời gian.`,
    isTrending: false,
    isMovie: true,
    season: "SUMMER 2016",
    episodes: [
      { number: 1, title: "Bản Điện Ảnh Full HD: Sợi Chỉ Đỏ Vượt Không Gian", duration: "106:00", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" }
    ]
  },
  {
    id: 20954,
    title: {
      vietnamese: "Dáng Hình Âm Thanh (A Silent Voice)",
      english: "A Silent Voice",
      romaji: "Koe no Katachi",
      native: "聲の形"
    },
    logo: "https://images.metahub.space/logo/medium/tt5323662/img",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20954-sYRfE5jQRtSB.jpg",
    bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/20954-f30bHMXa5Qoe.jpg",
    score: 8.9,
    studio: "Kyoto Animation",
    genres: ["Drama", "Romance", "Slice of Life"],
    format: "MOVIE",
    duration: "130 min",
    status: "Finished Airing",
    year: 2016,
    startDate: "Sep 17, 2016",
    totalEpisodes: 1,
    currentEpisode: 1,
    nextAiring: null,
    description: `Shoya Ishida từng bắt nạt cô bạn khiếm thính Shoko Nishimiya thời tiểu học. Lên trung học, mang nỗi dằn vặt và cô độc, cậu quyết tâm tìm lại Shoko để chuộc lại lỗi lầm quá khứ.`,
    isTrending: false,
    isMovie: true,
    season: "FALL 2016",
    episodes: [
      { number: 1, title: "Bản Điện Ảnh Full HD: Thanh Âm Của Sự Tha Thứ", duration: "130:00", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" }
    ]
  }
];

// Helper lưu trữ Watchlist & Lịch sử xem
export const StorageManager = {
  getWatchlist() {
    try {
      return JSON.parse(localStorage.getItem('linime_watchlist') || '[]');
    } catch {
      return [];
    }
  },
  toggleWatchlist(animeId) {
    let list = this.getWatchlist();
    if (list.includes(animeId)) {
      list = list.filter(id => id !== animeId);
    } else {
      list.push(animeId);
    }
    localStorage.setItem('linime_watchlist', JSON.stringify(list));
    return list;
  },
  isInWatchlist(animeId) {
    return this.getWatchlist().includes(animeId);
  },
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem('linime_history') || '[]');
    } catch {
      return [];
    }
  },
  saveProgress(animeId, episodeNumber, currentTime, duration) {
    let history = this.getHistory();
    history = history.filter(item => item.animeId !== animeId);
    history.unshift({
      animeId,
      episodeNumber,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      updatedAt: Date.now()
    });
    // Lưu tối đa 20 mục gần nhất
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('linime_history', JSON.stringify(history));
    return history;
  }
};
