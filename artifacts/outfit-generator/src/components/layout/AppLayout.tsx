import React from "react";
import { Link, useLocation } from "wouter";
import { Shirt, Sparkles, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWardrobeStats } from "@/hooks/useLocalDB";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useGetWardrobeStats();

  const wardrobeCount = stats?.byCategory
    ? stats.byCategory
        .filter((c: { category: string }) =>
          ["outfits", "beauty", "toiletries", "essentials"].includes(c.category)
        )
        .reduce((sum: number, c: { count: number }) => sum + c.count, 0)
    : undefined;

  const navItems = [
    { href: "/",         label: "Cleaning", icon: Shirt,    badge: wardrobeCount },
    { href: "/generate", label: "Generate", icon: Sparkles  },
    { href: "/saved",    label: "Saved",    icon: Bookmark  },
    { href: "/account",  label: "Settings", icon: Settings  },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-background">

      {/* ── Sidebar navigation — iPad+ only ─────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:w-20 lg:w-52 shrink-0 bg-white border-r-[3px] border-black">
        {/* App logo */}
        <div className="px-3 py-4 border-b-[3px] border-black flex items-center justify-center lg:justify-start gap-2.5 min-h-[64px]">
          <span className="text-2xl leading-none">🧹</span>
          <span className="hidden lg:block font-display font-bold text-sm uppercase tracking-tight leading-tight">
            My Digital<br />Cleaning
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 p-2 pt-3">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-3",
                  "px-2 py-3 rounded-xl border-2 transition-all duration-200 relative",
                  isActive
                    ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                    : "border-transparent hover:bg-muted active:scale-95"
                )}
              >
                <div className="relative shrink-0">
                  <Icon
                    className={cn("w-5 h-5 lg:w-6 lg:h-6", isActive ? "text-black" : "text-muted-foreground")}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {item.badge !== undefined && item.badge > 0 && (
                    <div className="absolute -top-2 -right-2 bg-secondary text-black text-[9px] font-bold border-2 border-black w-4 h-4 flex items-center justify-center rounded-full">
                      {item.badge > 99 ? "99+" : item.badge}
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-[9px] lg:text-xs font-bold uppercase tracking-wider leading-tight text-center lg:text-left",
                  isActive ? "text-black" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content column ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative min-h-[100dvh] md:min-h-0">

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-[90px] md:pb-0">
          {children}
        </main>

        {/* ── Bottom navigation — phone only ─────────────────────────────── */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t-[3px] border-black p-3 pb-safe z-[40]">
          <ul className="flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  <Link href={item.href} className="flex flex-col items-center gap-1 group">
                    <div
                      className={cn(
                        "p-2.5 rounded-full border-2 transition-all duration-200 ease-spring relative",
                        isActive
                          ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-1"
                          : "bg-transparent border-transparent group-hover:bg-muted group-active:scale-95"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-6 h-6",
                          isActive ? "text-black" : "text-muted-foreground",
                          item.href === "/generate" && isActive ? "animate-pulse" : ""
                        )}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      {item.badge !== undefined && item.badge > 0 && (
                        <div className="absolute -top-2 -right-2 bg-secondary text-black text-[10px] font-bold border-2 border-black w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          {item.badge > 99 ? "99+" : item.badge}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider transition-colors",
                        isActive ? "text-black" : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
