"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { submitInterests } from "@/lib/actions";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../context/OnboardingContext";

export function Interests() {
  // we store roles right now because we may want to display a more complex page to professionals in the future
  const [keywords, setKeywords] = useState<string>(""); // State to store textarea input
  const [additionalKeywords, setAdditionalKeywords] = useState<string>(""); // State to store additional textarea input
  const router = useRouter();
  const { setCurrentPage, nextPage } = useOnboarding();

  const handleTextareaChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setKeywords(event.target.value); // Update state when textarea changes
  };

  const handleAdditionalTextareaChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setAdditionalKeywords(event.target.value); // Update state when additional textarea changes
  };

  const handleSubmit = async () => {
    try {
      const ret = await submitInterests({ keywords, additionalKeywords });

      if (ret.error) {
        toast({
          title: "Error",
          description: ret.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Your interests have been saved.",
        });

        setCurrentPage(5);
        nextPage();
      }
    } catch (error) {
      console.error("Error submitting interests:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <main>
      <section className="py-8"> {/* Reduced padding here */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-black sm:text-4xl">
                Tell us about your interests
              </h1>
              <p className="mt-4 text-base text-gray-700">
                Enter 5-10 interests that describe your research, projects, or
                work.
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <div className="flex flex-wrap gap-2">
          <Textarea
            placeholder="Examples: Orbital Dynamics, Drug-Resistant Epilepsy, Game Theory, Combinatorics, Generative Image Models, etc."
            className="w-full h-40 text-black bg-black bg-opacity-10 rounded-xl p-8 backdrop-filter backdrop-blur-lg border-none"
            value={keywords} // Bind textarea value to state
            onChange={handleTextareaChange} // Update state on change
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center mb-4">
          <div>
            <p className="mt-4 text-base text-gray-700">
              Are you interested in any stocks? (optional)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Textarea
            placeholder="Examples: AAPL, TSLA, AMZN, etc."
            className="w-full h-40 text-black bg-black bg-opacity-10 rounded-xl p-8 backdrop-filter backdrop-blur-lg border-none"
            value={additionalKeywords} // Bind additional textarea value to state
            onChange={handleAdditionalTextareaChange} // Update state on change
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2"></div>
        <div className="flex justify-end py-5">
          <Button
            onClick={handleSubmit}
            className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-full font-semibold hover:bg-gray-600 transition duration-300"
          >
            Submit
          </Button>
        </div>
      </div>
    </main>
  );
}
