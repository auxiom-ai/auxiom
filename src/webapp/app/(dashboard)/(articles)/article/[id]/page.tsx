import { getArticleById } from "@/lib/actions";
import { getSimilarArticles } from "@/lib/db/queries";
import ArticlePage from "./article";

export default async function Page({params}: {params: Promise<{ id: string }>}) {

  const { id } = await params;
  const ID = parseInt(id, 10)
  const article = await getArticleById(ID);

  if (!article) {
    return (
      <div>
        <h2>Article not found</h2>
      </div>
    );
  }

  const formattedArticle = {
    id: article.id,
    title: article.title || "Untitled",
    summary: article.summary,
    content: article.content,
    people: Array.isArray(article.people) ? article.people
    .map((name: string) =>
      name
      .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
    ) : [],
    topics: Array.isArray(article.topics) ? article.topics
    .map((name: string) =>
      name
      .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
    ) : [],
    tags: Array.isArray(article.tags) ? article.tags
    .map((name: string) =>
      name
      .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
    ) : [],
    date: article.date.toISOString(),
    duration: article.duration,
    featured: article.featured,
    sources: Array.isArray(article.sources) ? article.sources.map((source: any) => ({
      type: source.type || "unknown",
      title: source.title || "Untitled",
      url: source.url || "#",
      source: source.source || "Unknown",
    })) : []
  };

  const rawRelated = await getSimilarArticles(article.embedding);
  const relatedArticles = Array.isArray(rawRelated)
    ? rawRelated.map((item: any) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        topics: Array.isArray(item.topics) ? item.topics : [],
        duration: item.duration,
      }))
    : [];

  return (
    <div>
      <ArticlePage article = {formattedArticle} related = {relatedArticles} />
    </div>
  );
}
