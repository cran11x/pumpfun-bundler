"use client";

import { useHealthStore, useNetworkStore } from "@/lib/store";
import { Wifi, WifiOff, Circle, FlaskConical, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import Link from "next/link";

export function Header() {
  const { rpc, jito, slot } = useHealthStore();
  const { network, isDevnet, fetchNetwork } = useNetworkStore();

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-5 md:px-6 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-[#00ff41]/10">
      <div>
        <h2 className="text-lg md:text-xl font-bold text-white">Dashboard</h2>
        <p className="text-xs text-gray-400">Welcome back</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Network Badge - Prominent indicator */}
        <Link href="/settings">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105",
            isDevnet 
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse" 
              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          )}>
            {isDevnet ? (
              <FlaskConical className="w-4 h-4" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            <span>{network === "unknown" ? "..." : network}</span>
          </div>
        </Link>

        {/* Devnet Warning Banner */}
        {isDevnet && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs">
            <span>Test Mode - Free SOL</span>
          </div>
        )}

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
