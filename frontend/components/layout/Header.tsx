"use client";

import { useHealthStore } from "@/lib/store";
import { Wifi, WifiOff, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const { rpc, jito, network, slot } = useHealthStore();

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-5 md:px-6 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-[#00ff41]/10">
      <div>
        <h2 className="text-lg md:text-xl font-bold text-white">Dashboard</h2>
        <p className="text-xs text-gray-400">Welcome back</p>
      </div>

      <div className="flex items-center gap-3">
        {/* RPC */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          rpc ? "bg-[#00ff41]/10 text-[#00ff41]" : "bg-red-500/10 text-red-400"
        }`}>
          {rpc ? (
            <Wifi className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">RPC</span>
        </div>

        {/* Jito */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          jito ? "bg-[#00d4ff]/10 text-[#00d4ff]" : "bg-red-500/10 text-red-400"
        }`}>
          <Circle className={cn("w-2 h-2 fill-current", jito ? "text-[#00d4ff]" : "text-red-400")} />
          <span className="hidden sm:inline">Jito</span>
        </div>

        {/* Network */}
        {network !== "unknown" && (
          <div className="hidden md:flex items-center px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-xs font-semibold uppercase tracking-wide">
            {network}
          </div>
        )}

        {/* Slot */}
        {slot && (
          <div className="hidden lg:block text-xs text-gray-400 font-mono bg-white/5 px-3 py-1.5 rounded-lg">
            #{slot.toLocaleString()}
          </div>
        )}
      </div>
    </header>
  );
}
