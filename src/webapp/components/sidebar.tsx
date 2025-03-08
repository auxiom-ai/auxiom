"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Scroll, Settings, LibraryBig } from 'lucide-react'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { name: "Podcasts", href: "/dashboard/podcasts", icon: LibraryBig },
  { name: "Pulse", href: "/dashboard/pulse", icon: Activity },
  { name: "Note", href: "/dashboard/note", icon: Scroll },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col w-64">
      <div className="flex h-14 items-center border-b border-gray-200/30 px-4">
      <h1 className="text-3xl font-semibold text-black">Dashboard</h1>
      </div>
      <nav className="flex-1 space-y-2 p-4">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
        <Button
          variant="ghost"
          className={cn(
          "w-full justify-start text-black text-lg",
          pathname === item.href
            ? "bg-slate-600/30 hover:bg-slate-400/30"
            : "hover:bg-slate-400/30"
          )}
        >
          <item.icon className="mr-2 h-5 w-5" />
          {item.name}
        </Button>
        </Link>
      ))}
      </nav>
    </div>
  )
}

