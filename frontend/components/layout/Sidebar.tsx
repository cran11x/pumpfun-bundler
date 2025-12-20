"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Rocket, 
  Wallet, 
  TrendingDown, 
  Settings,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Launch Token", href: "/launch", icon: Rocket },
  { name: "Wallets", href: "/wallets", icon: Wallet },
  { name: "Sell Tokens", href: "/sell", icon: TrendingDown },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-gradient-to-b from-[#0f0f1a] to-[#0a0a12] border-r border-[#00ff41]/20 flex flex-col z-30">
      {/* Header */}
      <div className="p-5 border-b border-[#00ff41]/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#00ff41] to-[#00d4ff] rounded-xl flex items-center justify-center shadow-lg shadow-[#00ff41]/20">
            <Rocket className="w-5 h-5 text-[#0a0a0f]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">cran11x</h1>
            <p className="text-[10px] text-[#00d4ff] font-medium">Bundler</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                isActive
                  ? "bg-gradient-to-r from-[#00ff41]/20 to-[#00ff41]/5 text-[#00ff41] shadow-sm shadow-[#00ff41]/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className={cn("w-4 h-4 flex-shrink-0", isActive && "drop-shadow-[0_0_6px_#00ff41]")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#00ff41]/10 space-y-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#00ff41]/5">
          <Activity className="w-4 h-4 text-[#00ff41]" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 font-medium">System Status</p>
            <p className="text-xs text-[#00ff41] font-semibold">Online</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse shadow-sm shadow-[#00ff41]" />
        </div>
        <div className="text-center pt-2">
          <p className="text-[10px] text-gray-500">
            Made by <span className="text-[#00d4ff] font-semibold">cran11x</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
