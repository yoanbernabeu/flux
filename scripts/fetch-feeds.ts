import RSSParser from 'rss-parser';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { parse } from 'yaml';
import { createHash } from 'crypto';
import type { FeedsConfig, Article, MonthlyData } from '../src/types/index.ts';

const DATA_DIR = 'data';
const FEEDS_FILE = 'feeds.yaml';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const CONCURRENCY = 5;
const MIN_DATE = new Date('2026-01-01T00:00:00Z');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': USER_AGENT,
  },
});

function generateId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function resolveUrl(url: string, baseUrl: string): string {
  if (isAbsoluteUrl(url)) return url;
  try {
    if (!isAbsoluteUrl(baseUrl)) return url;
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function extractImage(item: RSSParser.Item, feedLink: string, isPodcast = false): string | null {
  // For podcasts, use itunes:image (per-episode or feed-level)
  const itunesImage = (item as any).itunes?.image;
  if (itunesImage) return resolveUrl(itunesImage, feedLink);

  // Try enclosure only for non-podcasts (podcast enclosures are audio files)
  if (!isPodcast && item.enclosure?.url) return resolveUrl(item.enclosure.url, feedLink);

  // Try media content
  const mediaContent = (item as any)['media:content'];
  if (mediaContent?.$.url) return resolveUrl(mediaContent.$.url, feedLink);

  // Try media thumbnail
  const mediaThumbnail = (item as any)['media:thumbnail'];
  if (mediaThumbnail?.$.url) return resolveUrl(mediaThumbnail.$.url, feedLink);

  // Try to extract first image from content
  const content = item['content:encoded'] || item.content || '';
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return resolveUrl(imgMatch[1], feedLink);

  return null;
}

function truncateDescription(text: string | undefined, maxLength = 300): string {
  if (!text) return '';
  // Strip HTML tags
  const clean = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<RSSParser.Output<RSSParser.Item> | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // First try parseURL directly
      if (attempt === 1) {
        const feed = await parser.parseURL(url);
        return feed;
      }
      // On retry, fetch raw text and strip BOM/whitespace before parsing
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`Status code ${response.status}`);
      }
      let text = await response.text();
      // Strip UTF-8 BOM and leading whitespace
      text = text.replace(/^\uFEFF/, '').replace(/^[\s\S]*?(<\?xml)/, '$1');
      const feed = await parser.parseString(text);
      return feed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠ Tentative ${attempt}/${MAX_RETRIES} échouée pour ${url}: ${message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
      }
    }
  }
  console.error(`  ✗ Échec définitif pour ${url}, passage au flux suivant.`);
  return null;
}

function loadExistingArticleIds(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(DATA_DIR)) return ids;

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data: MonthlyData = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf-8'));
      for (const article of data.articles) {
        ids.add(article.id);
      }
    } catch {
      // Skip corrupted files
    }
  }
  return ids;
}

function loadExistingData(): Map<string, MonthlyData> {
  const dataMap = new Map<string, MonthlyData>();
  if (!existsSync(DATA_DIR)) return dataMap;

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data: MonthlyData = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf-8'));
      dataMap.set(data.month, data);
    } catch {
      // Skip corrupted files
    }
  }
  return dataMap;
}

interface YouTubeVideo {
  title: string;
  description: string;
  videoId: string;
  publishedAt: string;
  thumbnail: string;
}

async function fetchYouTubeVideos(channelId: string): Promise<YouTubeVideo[]> {
  // The uploads playlist ID is the channel ID with "UC" replaced by "UU"
  const uploadsPlaylistId = 'UU' + channelId.slice(2);
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=15&key=${YOUTUBE_API_KEY}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    title: item.snippet.title,
    description: item.snippet.description,
    videoId: item.snippet.resourceId.videoId,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails?.maxres?.url
      || item.snippet.thumbnails?.high?.url
      || item.snippet.thumbnails?.medium?.url
      || null,
  }));
}

async function main() {
  console.log('🚀 Démarrage de la récupération des flux RSS...\n');

  // Load feeds config
  const config: FeedsConfig = parse(readFileSync(FEEDS_FILE, 'utf-8'));
  console.log(`📋 ${config.feeds.length} flux configurés\n`);

  // Load existing article IDs for deduplication
  const existingIds = loadExistingArticleIds();
  const existingData = loadExistingData();
  console.log(`📦 ${existingIds.size} articles existants en base\n`);

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  let newArticleCount = 0;

  async function processFeed(feedConfig: FeedsConfig['feeds'][number]): Promise<Article[]> {
    const articles: Article[] = [];
    const feedType = feedConfig.type || 'blog';

    console.log(`📡 Récupération: ${feedConfig.name}`);

    // YouTube feeds: use YouTube Data API
    if (feedType === 'youtube') {
      if (!YOUTUBE_API_KEY) {
        console.warn(`  ⚠ YOUTUBE_API_KEY non définie, flux YouTube ignoré.`);
        return articles;
      }

      try {
        const videos = await fetchYouTubeVideos(feedConfig.url);
        console.log(`  → ${videos.length} vidéos trouvées (${feedConfig.name})`);

        for (const video of videos) {
          const link = `https://www.youtube.com/watch?v=${video.videoId}`;
          const id = generateId(link);
          if (existingIds.has(id)) continue;

          const parsedDate = new Date(video.publishedAt);
          if (parsedDate.getTime() < MIN_DATE.getTime()) continue;
          if (parsedDate.getTime() > Date.now()) continue;

          articles.push({
            id,
            title: video.title,
            description: truncateDescription(video.description),
            link,
            pubDate: parsedDate.toISOString(),
            source: feedConfig.name,
            sourceUrl: `https://www.youtube.com/channel/${feedConfig.url}`,
            categories: feedConfig.categories,
            image: video.thumbnail,
            type: 'youtube',
            videoId: video.videoId,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ Erreur YouTube API pour ${feedConfig.name}: ${message}`);
      }
      return articles;
    }

    // RSS/Atom feeds
    const feed = await fetchWithRetry(feedConfig.url);
    if (!feed) return articles;

    const items = feed.items || [];
    console.log(`  → ${items.length} articles trouvés (${feedConfig.name})`);

    for (const item of items) {
      const rawLink = item.link;
      if (!rawLink) continue;
      const baseUrl = (feed.link && isAbsoluteUrl(feed.link)) ? feed.link : feedConfig.url;
      const link = resolveUrl(rawLink, baseUrl);

      const id = generateId(link);
      if (existingIds.has(id)) continue;

      const pubDate = item.pubDate || item.isoDate || new Date().toISOString();
      const parsedDate = new Date(pubDate);
      if (parsedDate.getTime() < MIN_DATE.getTime()) continue;
      if (parsedDate.getTime() > Date.now()) continue;

      articles.push({
        id,
        title: item.title || 'Sans titre',
        description: truncateDescription(item.contentSnippet || item.content || item.summary),
        link,
        pubDate: new Date(pubDate).toISOString(),
        source: feedConfig.name,
        sourceUrl: feedConfig.url,
        categories: feedConfig.categories,
        image: extractImage(item, item.link || feed.link || feedConfig.url, feedType === 'podcast')
          || (feedType === 'podcast' && (feed as any).itunes?.image ? (feed as any).itunes.image : null),
        type: feedType,
        ...(feedType === 'podcast' && item.enclosure?.url ? { audioUrl: item.enclosure.url } : {}),
        ...(feedType === 'podcast' && (item as any).itunes?.duration ? { duration: (item as any).itunes.duration } : {}),
      });
    }
    return articles;
  }

  // Process feeds in parallel batches
  for (let i = 0; i < config.feeds.length; i += CONCURRENCY) {
    const batch = config.feeds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((f) => processFeed(f)));

    for (const articles of results) {
      for (const article of articles) {
        if (existingIds.has(article.id)) continue;
        const monthKey = getMonthKey(article.pubDate);
        if (!existingData.has(monthKey)) {
          existingData.set(monthKey, { month: monthKey, articles: [] });
        }
        existingData.get(monthKey)!.articles.push(article);
        existingIds.add(article.id);
        newArticleCount++;
      }
    }
  }

  // Sort articles within each month by date (newest first) and write files
  for (const [monthKey, monthData] of existingData) {
    monthData.articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    writeFileSync(`${DATA_DIR}/${monthKey}.json`, JSON.stringify(monthData, null, 2));
  }

  console.log(`\n✅ Terminé ! ${newArticleCount} nouveaux articles ajoutés.`);
  console.log(`📊 Total: ${existingIds.size} articles dans ${existingData.size} fichier(s) mensuel(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
