"use client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Delivery() {
  const router = useRouter();

  const handleSubmit = () => {
    // Handle the delivery submission logic here
    router.push("/next-page"); // Replace with the actual next page
  };

  return (
    <main>
      <section className="py-8"> {/* Reduced padding here */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-black sm:text-4xl">
                Delivery Information
              </h1>
              <p className="mt-4 text-base text-gray-700">
                Enter your delivery information.
              </p>
            </div>
          </div>
        </div>
      </section>
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