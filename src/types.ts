export type Article = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  score?: number;
};

export type CuratedArticle = Article & {
  reason: string;
};

export type CuratedCategory = {
  name: string;
  articles: CuratedArticle[];
};

export type CurationResult = {
  categories: CuratedCategory[];
  wildcard: CuratedArticle;
};

export type FeedbackWeights = Record<string, number>;

export type Topic = {
  name: string;
  keywords: string[];
  subreddits: string[];
  rss: string[];
};

export type Config = {
  topics: Topic[];
  feedback_weight_file: string;
  report_output_dir: string;
  articles_per_category: number;
};
