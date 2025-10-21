'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/lib/auth';
import { ArrowRight, BookOpen, Newspaper,  Database, Fingerprint, Podcast } from 'lucide-react';
import Link from 'next/link';
import Title from '../../components/title';
import PopupWidget from "@/components/popup-demo";
import RotatingTopics from '@/components/rotating-topics';

type Article = {
  id: string;
  title: string;
  summary: string;
  topics: string[];
};

type HomePageProps = {
  articles: Article[];
};

export default function HomePage({ articles = [] }: HomePageProps) {
  const { user, setUser } = useUser();
  const [isPopupExpanded, setIsPopupExpanded] = useState(false);
    
  const togglePopup = () => {
    setIsPopupExpanded(!isPopupExpanded);
  };
  return (
    <main>
      <Title user= {user}/>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Newspaper className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-black sm:text-4xl mb-4">Know What Your Government is Doing</h2>
            <p className="max-w-3xl mx-auto text-lg text-gray-700 mb-8">
              Discover the latest bills, policies, and legislative actions that impact the issues you care about. No lens, just the facts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/feed">
                <Button className="bg-primary hover:bg-primary/90 text-white transition duration-300 rounded-full text-lg px-8 py-3 inline-flex items-center justify-center">
                  <BookOpen className="mr-2 h-5 w-5" />
                  Explore Articles
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>

        {/* Featured Articles Preview */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {articles.map((article) => (
              <div key={article.id} className="bg-black bg-opacity-10 rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
                {article.topics.length > 0 && (
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-2">
                    {article.topics[0]}
                  </span>
                )}
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                  {article.title}
                </h3>
                <p className="text-gray-600 text-sm line-clamp-2">
                  {article.summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Podcast className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-black sm:text-4xl mb-4">All in a Weekly 5 Minute Podcast</h2>
            <p className="max-w-3xl mx-auto text-lg text-gray-700 mb-8">
              Listen to our charismatic AI hosts cut through the legislative noise and deliver the most relevant updates on the issues you care about.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                onClick={togglePopup}
                className="bg-primary hover:bg-primary/90 text-white transition duration-300 rounded-full text-lg px-8 py-3 inline-flex items-center justify-center">
                  <Podcast className="mr-2 h-5 w-5" />
                  Demo
              </Button>
            </div>
          </div>

          {/* RotatingTopics Component */}
          <RotatingTopics />

          <div className="lg:grid lg:grid-cols-3 lg:gap-8">
            <div className="bg-black bg-opacity-10 p-8 rounded-lg">
              <div className="flex items-center justify-center h-12 w-12 rounded-md border-2 border-gray-800 text-gray-700">
                <Database className="h-6 w-6" />
              </div>
              <div className="mt-5">
                <h2 className="text-lg font-medium text-black">
                  Primary Data Sources
                </h2>
                <p className="mt-2 text-base text-gray-700">
                  Auxiom analyzes legislative documents, financial data, and research papers to find the root of the action.
                </p>
              </div>
            </div>

            <div className="bg-black bg-opacity-10 p-8 rounded-lg mt-10 lg:mt-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md border-2 border-gray-800 text-gray-700">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div className="mt-5">
                <h2 className="text-lg font-medium text-black">
                  Personalized Content
                </h2>
                <p className="mt-2 text-base text-gray-700">
                  Your personalized content is curated with developments that are most relevant to you,
                  reducing informational overload.
                </p>
              </div>
            </div>

            <div className="bg-black bg-opacity-10 p-8 rounded-lg mt-10 lg:mt-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md border-2 border-gray-800 text-gray-700">
                <Podcast className="h-6 w-6" />
              </div>
              <div className="mt-5">
                <h2 className="text-lg font-medium text-black">
                  Podcast Generation
                </h2>
                <p className="mt-2 text-base text-gray-700">
                  Auxiom composes hundreds of pages of documents into a 5 minute weekly podcast
                  episode with our personable hosts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-black sm:text-4xl">
                Curious? Sign up for free!
              </h2>
              <p className="mt-3 max-w-3xl text-lg text-gray-700">
                Our free plan offers a taste of what Auxiom can do for you. Sign up today to 
                receive weekly updates on the legeislative actions affecting the issues you care about.
              </p>
            </div>
            <div className="mt-8 lg:mt-0 flex justify-center lg:justify-end">
              <Link
                href='/pricing'
                target="_blank"
              >
                <Button className="bg-gray-800 hover:bg-gray-600 text-white transition duration-300 rounded-full text-xl px-12 py-6 inline-flex items-center justify-center">
                  View Plans
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <PopupWidget isExpanded={isPopupExpanded} onToggle={togglePopup} />
    </main>
  );
}
