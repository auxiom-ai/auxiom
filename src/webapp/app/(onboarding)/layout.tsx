"use client";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { redirect } from "next/navigation";
import React, { useState } from "react";
import Image from "next/image";
import { Toaster } from "@/components/ui/toaster";
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <LayoutContent>{children}</LayoutContent>
    </OnboardingProvider>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { currentPage, setCurrentPage } = useOnboarding()

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (page === 1) {
      redirect("/identity")
    } else if (page === 2) {
      redirect("/occupation")
    } else if (page === 3) {
      redirect("/keywords")
    } else if (page === 4) {
      redirect("/stocks")
    } else if (page === 5) {
    redirect("/day")
  }
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < 5) {
      handlePageChange(currentPage + 1)
    }
  }

  return (
    <div className="min-h-screen bg-amber-100/40">
      <div className="flex h-screen flex-col md:flex-col md:overflow-hidden">
        <header>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center">
            <Image
              src="/logo.svg"
              alt="Company Logo"
              width={50}
              height={50}
            />
            <span className="ml-2 text-4xl text-black">Onboarding</span>
          </div>
        </header>
        <div className="flex-grow p-6 overflow-y-auto md:p-12">{children}</div>
        <section className="p-4 md:p-10 flex-shrink-0">
          <div className="flex justify-center items-center h-full text-black">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious className="text-xl font-bold hover:bg-black hover:bg-opacity-10 " href="#" onClick={handlePreviousPage} />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="/identity" onClick={() => setCurrentPage(1)}>1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="/occupation" onClick={() => setCurrentPage(2)}>2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="/keywords" onClick={() => setCurrentPage(3)}>3</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="/stocks" onClick={() => setCurrentPage(4)}>4</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="/day" onClick={() => setCurrentPage(5)}>5</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext className="text-xl font-bold hover:bg-black hover:bg-opacity-10" href="#" onClick={handleNextPage} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </section>
      </div>
      <Toaster />
    </div>
  );
}

