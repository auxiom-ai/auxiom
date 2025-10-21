import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { addToNewsletter } from '@/lib/actions';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function Footer() {
  const [email, setEmail] = useState('')
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await addToNewsletter({ email })
      if (!res) {
        throw new Error('Error adding email to newsletter')
      } else {
        toast({
          title: "Added to Newsletter",
          description: "Thank you for staying in touch!",
        })
      }
      setEmail('')
    } catch (error) {
      toast({
        title: "Error",
        description: "Email already exists in newsletter.",
        variant: "destructive",
      })
    }
  }
  
  return (
    <footer className="bg-black bg-opacity-10 text-black py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Stay in Touch</h2>
            <form onSubmit = {handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-xl bg-black bg-opacity-10 border border-gray-800 focus:outline-none focus:ring-2 focus:ring-black"
              />
              <Button type="submit" className="w-full bg-gray-800 hover:bg-gray-600 text-white transition duration-300 rounded-xl">
                Submit
              </Button>
            </form>
          </div>

          
          <div className="space-y-6 md:pl-8">
            <div className="flex items-center">
              <Image 
                src="/logo.svg" 
                alt="Company Logo" 
                width={40}
                height={40}
              />
              <span className="ml-2 text-2xl font-semibold">AUXIOM</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Link href="/about" className="hover:text-gray-600 transition-colors">About</Link>
              <Link href="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} AUXIOM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

