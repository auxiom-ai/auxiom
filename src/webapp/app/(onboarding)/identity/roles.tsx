
"use client";
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { updateUserRole } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { useOnboarding } from '../context/OnboardingContext'


export  function Roles() {
  //const [state, formAction, pending] = useActionState<ActionState, FormData>(
  //    updateUserRole,
  //    { error: '' }
  //  );

  const designations = ["Student", "Researcher", "Clinician", "Educator", "Professional", "Other"];
  const [selected, setSelected] = useState<string[]>([]);
  const { setCurrentPage } = useOnboarding()
  const router = useRouter();

  interface ToggleSelectionProps {
    designation: string;
  }

  const toggleSelection = ({ designation }: ToggleSelectionProps) => {
    setSelected((prev: string[]) =>
      prev.includes(designation)
        ? prev.filter((item) => item !== designation) // Remove if already selected
        : [...prev, designation] // Add if not selected
    );
  };

  const handleSubmit = async () => {
    try {
      await updateUserRole(selected);
      toast({
        title: "Information updated",
        description: "Your identification has been saved.",
      })
      // handle navigation for layout.tsx
      setCurrentPage(2)
      router.push('/occupation');
    } catch (error) {
      toast({
        title: "Error",
        description: "There was a problem saving your information.",
        variant: "destructive",
      })
    }
  };

  return (
    <main>
    <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-black sm:text-4xl">
                What brings you to Auxiom?
              </h1>
              <p className="mt-4 text-base text-gray-700">
                Select as many as apply.
              </p>
            </div>
          </div>
        </div>
    </section>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2">
            {designations.map((designation) => (
              <Button
                className={`${selected.includes(designation) ? 'bg-gray-600 hover:bg-800 hover:border-black hover:border-3' : 'bg-gray-800 hover:bg-gray-600 hover:border-black hover:border-5'} text-white rounded-full text-xl px-10 py-5 inline-flex items-center justify-center`}
                key={designation}
                onClick={() => toggleSelection({ designation })}
              >
                {designation}
              </Button>
            ))}
          </div>
          <div className="flex justify-end py-5">
            <Button 
              className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-full font-semibold hover:bg-gray-600 transition duration-300"
              type = "submit"
              onClick = {handleSubmit}>
                Submit
            </Button>
          </div>
    </div>

    </main>
  );
}