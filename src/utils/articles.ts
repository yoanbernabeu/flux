import type { Article, FeedType, MonthlyData } from '../types/index.ts';

export function loadAllArticles(): Article[] {
  const modules = import.meta.glob<MonthlyData>('/data/*.json', { eager: true });
  const articles: Article[] = [];

  for (const mod of Object.values(modules)) {
    if (mod.articles) {
      articles.push(...mod.articles);
    }
  }

  // Sort by date, newest first
  articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return articles;
}

export function getAllCategories(articles: Article[]): string[] {
  const cats = new Set<string>();
  for (const article of articles) {
    for (const cat of article.categories) {
      cats.add(cat);
    }
  }
  return Array.from(cats).sort();
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getAllSources(articles: Article[]): { name: string; slug: string; url: string; categories: string[]; count: number }[] {
  const sourceMap = new Map<string, { name: string; url: string; categories: Set<string>; count: number }>();

  for (const article of articles) {
    const existing = sourceMap.get(article.source);
    if (existing) {
      existing.count++;
      for (const cat of article.categories) {
        existing.categories.add(cat);
      }
    } else {
      sourceMap.set(article.source, {
        name: article.source,
        url: article.sourceUrl,
        categories: new Set(article.categories),
        count: 1,
      });
    }
  }

  return Array.from(sourceMap.values())
    .map((s) => ({ ...s, slug: slugify(s.name), categories: Array.from(s.categories) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function getRelatedArticles(article: Article, allArticles: Article[], limit = 4): Article[] {
  return allArticles
    .filter((a) => a.id !== article.id && a.categories.some((c) => article.categories.includes(c)))
    .slice(0, limit);
}

export function getFreshnessBadge(pubDate: string): { label: string; class: string } | null {
  const now = Date.now();
  const published = new Date(pubDate).getTime();
  const hoursAgo = (now - published) / (1000 * 60 * 60);

  if (hoursAgo < 24) {
    return { label: 'Nouveau', class: 'bg-emerald-700 text-white border border-emerald-600 shadow-lg shadow-emerald-700/30 backdrop-blur-sm' };
  }
  if (hoursAgo < 72) {
    return { label: 'Récent', class: 'bg-blue-500 text-white border border-blue-400 shadow-lg shadow-blue-500/30 backdrop-blur-sm' };
  }
  return null;
}

export function getMetaDescription(text: string, maxLength = 155): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): { data: T[]; totalPages: number; currentPage: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const data = items.slice(start, start + pageSize);

  return { data, totalPages, currentPage };
}

// Category color mapping for placeholder gradients
const categoryGradients: Record<string, string> = {
  Programmation: 'from-violet-600 to-purple-800',
  IA: 'from-emerald-600 to-teal-800',
  DevOps: 'from-orange-600 to-red-800',
  Cybersécurité: 'from-red-600 to-rose-800',
  Cloud: 'from-sky-600 to-blue-800',
  Web: 'from-amber-600 to-yellow-800',
};

export function getCategoryGradient(categories: string[]): string {
  for (const cat of categories) {
    if (categoryGradients[cat]) return categoryGradients[cat];
  }
  return 'from-zinc-600 to-zinc-800';
}

const categoryColors: Record<string, string> = {
  Programmation: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  IA: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  DevOps: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Cybersécurité: 'bg-red-500/20 text-red-400 border-red-500/30',
  Cloud: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  Web: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export function getCategoryColor(category: string): string {
  return categoryColors[category] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
}

const typeLabels: Record<FeedType, string> = {
  blog: 'Article',
  podcast: 'Podcast',
  youtube: 'YouTube',
};

const typeColors: Record<FeedType, string> = {
  blog: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  podcast: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
  youtube: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function getTypeLabel(type: FeedType): string {
  return typeLabels[type] || 'Article';
}

export function getTypeColor(type: FeedType): string {
  return typeColors[type] || typeColors.blog;
}

export function getAllTypes(articles: Article[]): FeedType[] {
  const types = new Set<FeedType>();
  for (const article of articles) {
    types.add(article.type || 'blog');
  }
  return Array.from(types).sort();
}
