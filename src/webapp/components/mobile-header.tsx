"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, TextSearch, Scroll, Settings, LibraryBig, Menu } from 'lucide-react'
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navItems = [
  { name: "Podcasts", href: "/dashboard/podcasts", icon: LibraryBig },
  { name: "Pulse", href: "/dashboard/pulse", icon: Activity },
  { name: "Note", href: "/dashboard/note", icon: Scroll },
  { name: "Insight", href: "/dashboard/insight", icon: TextSearch },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function MobileHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200/30 px-4 md:hidden">
      <h1 className="text-2xl font-semibold text-black">Dashboard</h1>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {navItems.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                className={pathname === item.href ? "bg-slate-100" : ""}
                onClick={() => setOpen(false)}
              >
                <item.icon className="mr-2 h-5 w-5" />
                {item.name}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

