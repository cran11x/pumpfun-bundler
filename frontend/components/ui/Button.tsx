import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center",
        variant === "primary" &&
          "bg-[#00ff41] text-[#0a0a0f] hover:bg-[#00ff41]/90 hover:shadow-lg hover:shadow-[#00ff41]/20 active:scale-[0.98]",
        variant === "secondary" &&
          "bg-[#00d4ff] text-[#0a0a0f] hover:bg-[#00d4ff]/90 hover:shadow-lg hover:shadow-[#00d4ff]/20 active:scale-[0.98]",
        variant === "destructive" &&
          "bg-[#ff0040] text-white hover:bg-[#ff0040]/90 hover:shadow-lg hover:shadow-[#ff0040]/20 active:scale-[0.98]",
        variant === "ghost" &&
          "bg-transparent text-[#00ff41] hover:bg-[#00ff41]/10 border border-[#00ff41]/30 hover:border-[#00ff41]/50 active:scale-[0.98]",
        size === "sm" && "px-4 py-2.5 text-sm",
        size === "md" && "px-5 py-3 text-base",
        size === "lg" && "px-7 py-4 text-lg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
