'use client'

import React, { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'

type OnboardingContextType = {
  currentPage: number
  setCurrentPage: (page: number) => void
  nextPage: () => void
  totalPages: number
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export const steps = [
  { title: "Identity", path: "/" },
  { title: "Occupation", path: "/profile" },
  { title: "Topics", path: "/topics" },
  { title: "Keywords", path: "/keywords" },
  { title: "Stocks", path: "/stocks" },
  { title: "Delivery", path: "/delivery" }
] as const;

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setCurrentPage] = useState(1)
  const router = useRouter()
  const totalPages = 6  // Make sure this matches the number of steps

  const nextPage = () => {
    if (currentPage < totalPages) {
      const nextStep = steps[currentPage]
      console.log('Moving to:', nextStep);
      setCurrentPage(currentPage + 1)
      router.push(nextStep.path)
    }
  }

  return (
    <OnboardingContext.Provider value={{ currentPage, setCurrentPage, nextPage, totalPages }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export const useOnboarding = () => {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider')
  }
  return context
}

