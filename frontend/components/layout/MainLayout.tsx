"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ReactNode } from "react";

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Fixed sidebar - 224px wide (w-56 = 14rem = 224px) */}
      <Sidebar />
      
      {/* Main content area - exactly offset by 224px */}
      <div 
        className="min-h-screen flex flex-col"
        style={{ marginLeft: '224px' }}
      >
        <Header />
        <main className="flex-1 p-6 md:p-8 w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
