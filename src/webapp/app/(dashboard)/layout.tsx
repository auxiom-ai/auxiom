'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Gem, LayoutDashboard, Menu } from 'lucide-react';
import { useUser } from '@/lib/auth';
import { ActionLink } from '@/components/ui/action-link';
import { Footer } from '@/components/ui/Footer';
import { Toaster } from '@/components/ui/toaster';
import Image from 'next/image';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function NavDropdown({ user }: { user: any }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="bg-gray-800 text-white">
          <Menu className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Link href="/pricing" className="flex items-center">
            <Gem className="mr-2 h-4 w-4" />
            Plans
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          {user ? (
            <Link href="/dashboard/podcasts" className="flex items-center">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          ) : (
          <Link href="/sign-up" className="flex items-center">
            Sign Up
          </Link>
          )}
          
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header() {
  const { user, setUser } = useUser();
  const isLargeScreen = useMediaQuery('(min-width: 768px)');

  return (
    <header>
      <div className="max-w-7xl mx-auto px-4 sm:px-2 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <Image 
            src="/logo.svg" 
            alt="Company Logo" 
            width={50}
            height={50}
          />
          <span className="ml-2 text-4xl font-semibold text-black">AUXIOM</span>
        </Link>
        <div className="flex items-center space-x-4">
          {isLargeScreen ? (
            <>
              <ActionLink href="/pricing" icon={Gem}>
                Plans
              </ActionLink>
              {user ? (
                <Button
                  asChild
                  className="bg-gray-800 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-full transition duration-300"
                >
                  <ActionLink href="/dashboard/podcasts" icon={LayoutDashboard}>Dashboard</ActionLink>
                </Button>
              ) : (
                <Button
                  asChild
                  className="bg-gray-800 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-full transition duration-300"
                >
                  <ActionLink href="/sign-in">Sign In</ActionLink>
                </Button>
              )}
            </>
          ) : (
            <NavDropdown user={user} />
          )}
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-amber-100/30">
      <Header />
      <main className="flex-grow">
        {children}
        <Toaster />
      </main>
      <Footer />
    </div>
  );
}
