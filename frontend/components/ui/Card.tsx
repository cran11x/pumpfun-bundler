import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: "green" | "cyan" | "none";
}

export function Card({ children, className, glow = "none" }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-6 md:p-7 transition-all duration-300",
        "bg-gradient-to-br from-[#12121a] via-[#0f0f16] to-[#0d0d14]",
        "border border-white/5",
        "hover:border-white/10 hover:shadow-xl",
        glow === "green" && "border-[#00ff41]/20 hover:border-[#00ff41]/30 shadow-lg shadow-[#00ff41]/10",
        glow === "cyan" && "border-[#00d4ff]/20 hover:border-[#00d4ff]/30 shadow-lg shadow-[#00d4ff]/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-base md:text-lg font-semibold text-white flex items-center gap-2", className)}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}
