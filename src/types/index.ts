export type FeedType = 'blog' | 'podcast' | 'youtube';

export interface FeedConfig {
  url: string;
  name: string;
  categories: string[];
  type?: FeedType;
}

export interface FeedsConfig {
  feeds: FeedConfig[];
}

export interface Article {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  categories: string[];
  image: string | null;
  type: FeedType;
  audioUrl?: string;
  duration?: string;
  videoId?: string;
}

export interface MonthlyData {
  month: string;
  articles: Article[];
}
