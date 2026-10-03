import { Buffer } from 'buffer';

let sessionCookies = '';
let sessionToken = '';
let csrfToken = '';
let lastSessionTime = 0;

// Giải mã chuỗi mã hóa XOR của Linime
export function decryptSourcePayload(cipherText, tokenBase64) {
  if (!cipherText || !tokenBase64) return null;
  try {
    const key = Buffer.from(tokenBase64, 'base64').toString('latin1').split('').reverse().join('');
    const cipherBytes = Buffer.from(cipherText, 'base64');
    const len = cipherBytes.length;
    const result = Buffer.alloc(len);

    for (let i = 0; i < len; i++) {
      result[i] = cipherBytes[i] ^ key.charCodeAt(i % key.length) ^ ((i * 3) % 256);
    }

    return JSON.parse(result.toString('utf-8'));
  } catch (err) {
    console.error('Lỗi giải mã stream payload:', err);
    return null;
  }
}

// Làm mới phiên kết nối tới Linime (lấy session cookie, token và csrf)
export async function ensureLinimeSession(animeId = 21, episodeNumber = 1) {
  const now = Date.now();
  // Giữ phiên trong 10 phút
  if (sessionCookies && sessionToken && csrfToken && (now - lastSessionTime < 600000)) {
    return { sessionCookies, sessionToken, csrfToken };
  }

  try {
    const res = await fetch(`https://linime.lol/watch/${animeId}/ep-${episodeNumber}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    sessionCookies = setCookies.map(c => c.split(';')[0]).join('; ');

    const html = await res.text();
    const tokenMatch = html.match(/token:\s*'([^']+)'/);
    const csrfMatch = html.match(/name="csrf-token" content="([^"]+)"/);

    if (tokenMatch) sessionToken = tokenMatch[1];
    if (csrfMatch) csrfToken = csrfMatch[1];
    lastSessionTime = now;

    console.log('✅ Đã thiết lập phiên kết nối Linime Streaming thành công.');
    return { sessionCookies, sessionToken, csrfToken };
  } catch (err) {
    console.error('❌ Không thể khởi tạo phiên Linime:', err);
    return { sessionCookies: '', sessionToken: '', csrfToken: '' };
  }
}

// Lấy danh sách tập thực tế từ Linime API
export async function getLiveEpisodes(animeId) {
  try {
    const res = await fetch(`https://linime.lol/api/watch/${animeId}/episodes`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && Array.isArray(data.episodes) && data.episodes.length > 0) {
      return data;
    }
  } catch (err) {
    console.error(`Lỗi lấy danh sách tập từ Linime cho anime ${animeId}:`, err);
  }
  return null;
}

// Lấy nguồn phát thực tế từ Linime (kèm cơ chế tự động thử server phụ nếu server chính bận)
export async function getLiveSources(animeId, episodeNumber = 1, language = 'sub', provider = 'Megaplay') {
  const session = await ensureLinimeSession(animeId, episodeNumber);

  const candidateProviders = [provider, 'Megaplay', 'Yuki', 'Zuna', 'Sora', 'Zenith'].filter((p, i, arr) => arr.indexOf(p) === i);

  for (const currentProvider of candidateProviders) {
    try {
      const res = await fetch('https://linime.lol/api/watch/sources', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Cookie': session.sessionCookies,
          'X-CSRF-Token': session.csrfToken,
          'Referer': `https://linime.lol/watch/${animeId}/ep-${episodeNumber}`
        },
        body: JSON.stringify({
          anime_id: animeId,
          episode_number: episodeNumber,
          language: language,
          provider: currentProvider
        })
      });

      const data = await res.json();
      if (data.ct) {
        const decrypted = decryptSourcePayload(data.ct, session.sessionToken);
        if (decrypted && (decrypted.video_link || (decrypted.hls_sources && decrypted.hls_sources.length > 0))) {
          // Rewrite video link sang proxy nội bộ của ta
          if (decrypted.video_link && decrypted.video_link.startsWith('/api/stream-proxy')) {
            decrypted.proxy_stream_url = decrypted.video_link;
          }
          decrypted.used_provider = currentProvider;
          return decrypted;
        }
      }

      // Nếu lỗi là do không có tập này (ví dụ anime chỉ có 1 tập mà đòi tập 12)
      if (data.error && data.error.includes('not found')) {
        return { error: data.error, anime_id: animeId, episode_number: episodeNumber };
      }
    } catch (err) {
      console.warn(`Thử provider ${currentProvider} không thành công:`, err.message);
    }
  }

  return null;
}

// Proxy stream m3u8 và TS segment
export async function proxyStream(reqUrl, referer, res) {
  const session = await ensureLinimeSession();

  try {
    // Nếu reqUrl là đường dẫn tương đối dạng /api/stream-proxy?url=...
    let target = reqUrl;
    if (reqUrl.startsWith('/api/stream-proxy')) {
      target = `https://linime.lol${reqUrl}`;
    }

    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': session.sessionCookies,
        'Referer': referer || 'https://linime.lol/watch/21/ep-1'
      }
    });

    let contentType = upstream.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    if (target.includes('.vtt')) {
      contentType = 'text/vtt; charset=utf-8';
    } else if (target.includes('.m3u8') || contentType.includes('mpegurl')) {
      contentType = 'application/vnd.apple.mpegurl; charset=utf-8';
    } else if (target.includes('.ts') || target.includes('.jpg') || target.includes('.png')) {
      contentType = 'video/mp2t';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Nếu là file playlist .m3u8, viết lại URL các file con đi qua proxy của chúng ta
    if (contentType.includes('mpegurl') || target.includes('.m3u8')) {
      let bodyText = await upstream.text();
      
      // Rewrite URL trong file m3u8
      const lines = bodyText.split('\n');
      const rewritten = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          // Xử lý URI trong thẻ (ví dụ #EXT-X-KEY:URI="..." hoặc #EXT-X-MEDIA:URI="...")
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (m, uri) => {
              const absUri = new URL(uri, target).href;
              return `URI="/api/stream-proxy?url=${encodeURIComponent(absUri)}&referer=${encodeURIComponent(referer || 'https://megaplay.buzz/')}"`;
            });
          }
          return line;
        }

        // Dòng chứa URL chunk TS hoặc master sub-playlist
        const absChunkUrl = new URL(trimmed, target).href;
        return `/api/stream-proxy?url=${encodeURIComponent(absChunkUrl)}&referer=${encodeURIComponent(referer || 'https://megaplay.buzz/')}`;
      }).join('\n');

      return res.send(rewritten);
    }

    // Nếu là file nhị phân (video .ts chunk hoặc phụ đề .vtt)
    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Lỗi stream proxy:', err);
    res.status(502).send('Bad Gateway in Stream Proxy');
  }
}
