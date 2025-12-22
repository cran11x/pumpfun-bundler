"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { sellPumpFun, sellRaydium } from "@/lib/api";
import { TrendingDown, Loader2 } from "lucide-react";

export default function SellPage() {
  const [percentage, setPercentage] = useState(50);
  const [selling, setSelling] = useState(false);
  const [sellType, setSellType] = useState<"pumpfun" | "raydium">("pumpfun");
  const [marketId, setMarketId] = useState("");

  const handleSell = async () => {
    if (sellType === "raydium" && !marketId.trim()) {
      alert("Market ID is required for Raydium");
      return;
    }
    
    setSelling(true);
    try {
      if (sellType === "pumpfun") {
        await sellPumpFun({ percentage });
      } else {
        await sellRaydium({ percentage, marketId });
      }
      alert("Sell initiated! Check console for details.");
    } catch (error: any) {
      alert(`Sell failed: ${error.message || error.toString()}`);
      console.error("Sell error:", error);
    } finally {
      setSelling(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-2">
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">Sell Tokens</h1>
          <p className="text-gray-400">Sell your tokens on Pump.Fun or Raydium</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sell Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Platform
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={sellType === "pumpfun" ? "primary" : "ghost"}
                    onClick={() => setSellType("pumpfun")}
                    className="flex-1"
                  >
                    Pump.Fun
                  </Button>
                  <Button
                    type="button"
                    variant={sellType === "raydium" ? "primary" : "ghost"}
                    onClick={() => setSellType("raydium")}
                    className="flex-1"
                  >
                    Raydium
                  </Button>
                </div>
              </div>

              {sellType === "raydium" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Market ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={marketId}
                    onChange={(e) => setMarketId(e.target.value)}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="Enter market ID"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sell Percentage: {percentage}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleSell}
                  disabled={selling || (sellType === "raydium" && !marketId.trim())}
                >
                  {selling ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-5 h-5 mr-2" />
                      Sell {percentage}%
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-400">
                <p>
                  <strong className="text-[#00ff41]">Pump.Fun:</strong> Sell tokens before migration
                  to Raydium. Works with bonding curve.
                </p>
                <p>
                  <strong className="text-[#00d4ff]">Raydium:</strong> Sell tokens after migration.
                  Requires market ID from migration.
                </p>
                <p className="text-xs text-gray-500 mt-4">
                  ⚠️ Maximum 25% sell per transaction to prevent high price impact.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

