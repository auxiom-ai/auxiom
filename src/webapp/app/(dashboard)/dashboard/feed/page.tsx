import { getAllArticles } from "@/lib/actions";
import ArticlesPage from "../../(articles)/feed/content";

export default async function Page() {

  const articles = await getAllArticles();
  
  const formattedArticles = articles.map((article) => ({
    id: Number(article.id),
    title: String(article.title),
    summary: String(article.summary),
    people: Array.isArray(article.people)
      ? article.people
        .filter((name: string) => name && name.toLowerCase() !== "none")
        .map((name: string) =>
          name
            .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
        )
      : [],
    topics: Array.isArray(article.topics)
      ? article.topics
        .map((name: string) =>
          name
            .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
        )
      : [],
    tags: Array.isArray(article.tags)
      ? article.tags
        .map((name: string) =>
          name
            .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
        )
      : [],
    date: article.date instanceof Date
      ? article.date.toISOString()
      : typeof article.date === "string"
        ? new Date(article.date).toISOString()
        : "",
    duration: Number(article.duration),
    featured: Boolean(article.featured)
  }));
  
  return (
    <div>
      <ArticlesPage articles = {formattedArticles} />
    </div>
  );
}
