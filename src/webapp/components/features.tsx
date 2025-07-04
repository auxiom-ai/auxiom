import { Database, Fingerprint, Podcast } from 'lucide-react';
import RotatingTopics from './rotating-topics'; // Import the RotatingTopics component

export default function Features() {
  return (
    <>
      {/* RotatingTopics Component */}
      <RotatingTopics />

      {/* Features Section */}
      <section className="py-16 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
    </>
  );
}