"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { submitStocks } from "@/lib/actions";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../context/OnboardingContext";

export function Stocks() {
  const [stocks, setStocks] = useState<string>(""); // State to store textarea input
  const router = useRouter();
  const { setCurrentPage } = useOnboarding();

  const handleTextareaChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setStocks(event.target.value); // Update state when textarea changes
  };

  const handleSubmit = async () => {
    try {
      const ret = await submitStocks({ stocks });

      if (!ret.success) {
        toast({
          title: "Error",
          description: ret.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Your stocks have been saved.",
        });

        setCurrentPage(4);
        router.push("/day");
      }
    } catch (error) {
      console.error("Error submitting stocks:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <main>
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-black sm:text-4xl whitespace-nowrap">
                Tell us about your company interests 
              </h1>
              <p className="mt-4 text-base text-gray-700">
                Enter any stock tickers you'd like to track (optional)
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <div className="flex flex-wrap gap-2">
          <Textarea
            placeholder="Examples: AAPL, TSLA, AMZN, etc."
            className="w-full h-40 text-black bg-black bg-opacity-10 rounded-xl p-8 backdrop-filter backdrop-blur-lg border-none"
            value={stocks} // Bind textarea value to state
            onChange={handleTextareaChange} // Update state on change
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