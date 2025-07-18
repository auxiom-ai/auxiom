"use client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { type CarouselApi } from "@/components/ui/carousel";
import React from "react";
import { submitDay, setAccountStatus } from "@/lib/actions";
import { toast } from '@/hooks/use-toast';


export function Delivery() {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const router = useRouter();

  React.useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const handleSubmit = async () => {

    try {
      await submitDay(current);
      const ret = await setAccountStatus(true);
      if (ret.error) {
        toast({
          title: "Onboarding Incomplete",
          description: "Please complete all onboarding steps.",
          variant: "destructive"
        });
        return;
      } else {
        toast({
          title: "Onboarding Complete",
          description: "Thank you for creating your Auxiom account."
        });
        router.push('/pricing');
      }
    } catch (error) {
      toast({
        title: "Onboarding Incomplete",
        description: "Unexpected error, please try again later.",
        variant: "destructive"
      });
      return;
    }
  };

  return (
    <main>
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-black mb-6 sm:text-4xl">
                What day would you like your weekly podcast delivered?
              </h1>
              <p className="mt-4 text-base text-gray-700">
                Our free plan offers one short podcast per week.
                Upgrade your plan to get a longer podcast and access to more features.
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2"></div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2 justify-center">
          <Carousel
            className="max-w-sm"
            opts={{
              loop: true,
              align: 'center',
            }}
            setApi={setApi}
          >
            <CarouselContent>
              {days.map((day, index) => (
                <CarouselItem key={index} className="pl-1 basis-1/2">
                  <div className="p-1">
                    <div className={`rounded-3xl backdrop-filter backdrop-blur-lg transition-all duration-300 ${index === current
                        ? 'bg-black bg-opacity-30 scale-100'
                        : 'bg-black bg-opacity-10 scale-90'
                      }`}>
                      <div className="flex aspect-square items-center justify-center p-6">
                        <span className='text-2xl font-semibold transition-all duration-300 text-black'>
                          {day}
                        </span>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex bg-black text-black bg-opacity-20 rounded-full backdrop-filter backdrop-blur-lg border-none hover:bg-gray-700 transition duration-300" /> 
            <CarouselNext className="hidden md:flex bg-black text-black bg-opacity-20 rounded-full backdrop-filter backdrop-blur-lg border-none hover:bg-gray-700 transition duration-300" />
          </Carousel>
        </div>
        <div className="flex justify-end py-5">
          <Button onClick={handleSubmit} className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-full font-semibold hover:bg-gray-600 transition duration-300">
            Submit
          </Button>
        </div>
      </div>
    </main>
  );
}

