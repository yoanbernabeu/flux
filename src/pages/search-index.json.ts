import { loadAllArticles } from '../utils/articles';

export async function GET() {
  const articles = loadAllArticles();
  const index = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    source: a.source,
    sourceUrl: a.sourceUrl,
    categories: a.categories,
    pubDate: a.pubDate,
    image: a.image || '',
    link: a.link,
    type: a.type || 'blog',
    ...(a.audioUrl ? { audioUrl: a.audioUrl } : {}),
    ...(a.duration ? { duration: a.duration } : {}),
  }));
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
}
