import { getKeywords, getAccountStatus } from "@/lib/actions";
import { getUser, fetchUserPodcasts } from "@/lib/db/queries";
import { redirect } from "next/navigation";
import LearningProgress from "./history";

// WebSocket endpoint for podcast streaming
const WS_ENDPOINT = `ws://127.0.0.1:3000/api/podcast-streaming`; // Updated WebSocket URL to use port 3000

interface LearningProgressProps {
  podcasts: {
    id: number;
    title: string;
    episodeNumber: number;
    date: string;
    duration: string;
    listened: boolean;
    articles: { title: string; description: string; url: string }[];
    script: { text: string }[];
  }[];
}

export default async function Page() {
  const currentKeywords: string[] = await getKeywords();
  const isActive: boolean = await getAccountStatus();

  const user = await getUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (!user.verified) {
    redirect("/sign-in");
  }

  if (!isActive && currentKeywords.length === 0) {
    redirect("/identity");
  }

  if (!isActive) {
    redirect("/keywords");
  }

  const userPodcasts = await fetchUserPodcasts(user.id);

  const formattedPodcasts = userPodcasts.map((podcast) => ({
    id: podcast.id,
    title: podcast.title,
    episodeNumber: podcast.episodeNumber,
    date: podcast.date.toISOString(),
    duration: "0:00",
    audioFileUrl: podcast.audioFileUrl ?? "",
    listened: podcast.completed,
    articles: podcast.articles as { title: string; description: string; url: string }[],
    script: podcast.script as { text: string }[],
  }));

  return (
    <div>
      <LearningProgress 
        podcasts={formattedPodcasts} 
      />
    </div>
  );
}

// API route for WebSocket streaming will be in /app/api/podcast-stream/route.ts