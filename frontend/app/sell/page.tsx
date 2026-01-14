"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { getMintBalances, sellPumpFun, sellRaydium } from "@/lib/api";
import { TrendingDown, Loader2 } from "lucide-react";

export default function SellPage() {
  const [percentage, setPercentage] = useState(50);
  const [sellingGlobal, setSellingGlobal] = useState(false);
  const [sellingByWallet, setSellingByWallet] = useState<Record<string, boolean>>({});
  const [sellType, setSellType] = useState<"pumpfun" | "raydium">("pumpfun");
  const [marketId, setMarketId] = useState("");
  const [mint, setMint] = useState("");
  const [ownedTokens, setOwnedTokens] = useState<{ mint: string; uiAmount?: number | null }[]>([]);
  const [sellMode, setSellMode] = useState<"per-wallet" | "single" | "multi">("per-wallet");
  const [executionMode, setExecutionMode] = useState<"consolidated" | "per-wallet">("consolidated");
  const [walletSelection, setWalletSelection] = useState<"all" | "select">("all");
  const [percentageMode, setPercentageMode] = useState<"same" | "different">("same");
  const [autoFund, setAutoFund] = useState(true);
  const [availableWallets, setAvailableWallets] = useState<{ publicKey: string; label?: string }[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [walletPercentages, setWalletPercentages] = useState<Record<string, number>>({});
  const [dryRun, setDryRun] = useState(false);
  const [jitoTip, setJitoTip] = useState("0.01");
  const [mintBalances, setMintBalances] = useState<Record<string, { uiAmount: number; decimals: number; amount: string }>>({});
  const [perWalletPct, setPerWalletPct] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    // Best-effort: load tokens owned by dev wallet/payer so user can pick a mint quickly.
    (async () => {
      try {
        const res = await fetch("http://localhost:3001/api/tokens/owned");
        const json = await res.json();
        const tokens: { mint: string; uiAmount?: number | null }[] = [];
        for (const owner of json?.data ?? []) {
          for (const t of owner?.tokens ?? []) {
            if (t?.mint) tokens.push({ mint: t.mint, uiAmount: t.uiAmount });
          }
        }
        // Deduplicate by mint
        const seen = new Set<string>();
        const deduped = tokens.filter((t) => {
          if (seen.has(t.mint)) return false;
          seen.add(t.mint);
          return true;
        });
        setOwnedTokens(deduped);
      } catch {
        // ignore; user can paste mint manually
      }
    })();
  }, []);

  useEffect(() => {
    // Load dev + bundler wallets for wallet selection UI
    (async () => {
      try {
        const [mainRes, subRes] = await Promise.all([
          fetch("http://localhost:3001/api/wallets/main").then((r) => r.json()).catch(() => null),
          fetch("http://localhost:3001/api/wallets").then((r) => r.json()).catch(() => null),
        ]);
        const devPk = mainRes?.wallet?.publicKey as string | undefined;
        const subs = (subRes?.wallets ?? []) as { publicKey: string }[];
        const list: { publicKey: string; label?: string }[] = [];
        if (devPk) list.push({ publicKey: devPk, label: "Dev Wallet" });
        for (const w of subs) {
          if (!w?.publicKey) continue;
          if (w.publicKey === devPk) continue;
          list.push({ publicKey: w.publicKey, label: "Bundler Wallet" });
        }
        setAvailableWallets(list);
        // Default selected wallet for quick mode
        if (!selectedWallet && list.length > 0) setSelectedWallet(list[0].publicKey);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshBalances = async () => {
    if (sellType !== "pumpfun") return;
    if (!mint.trim()) return;
    setLoadingBalances(true);
    try {
      const resp = await getMintBalances(mint.trim());
      const map: Record<string, { uiAmount: number; decimals: number; amount: string }> = {};
      for (const b of resp?.balances ?? []) {
        map[b.ownerPubkey] = {
          uiAmount: typeof b.uiAmount === "number" ? b.uiAmount : 0,
          decimals: typeof b.decimals === "number" ? b.decimals : 0,
          amount: typeof b.amount === "string" ? b.amount : "0",
        };
      }
      setMintBalances(map);
    } catch {
      setMintBalances({});
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    // Load per-wallet token balances for selected mint (Pump.Fun only)
    refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, sellType]);

  const sellOneWallet = async (walletPk: string, pct: number) => {
    if (!mint.trim()) {
      alert("Mint is required");
      return;
    }
    setSellingByWallet((prev) => ({ ...prev, [walletPk]: true }));
    try {
      const parsedTip = parseFloat(jitoTip);
      await sellPumpFun({
        percentage: pct,
        mint: mint.trim(),
        mode: "quick",
        wallet: walletPk,
        autoFundWallets: true,
        dryRun,
        jitoTip: Number.isFinite(parsedTip) ? parsedTip : undefined,
      } as any);
      alert(`${dryRun ? "DRY RUN " : ""}Sell sent for ${walletPk.slice(0, 6)}…${walletPk.slice(-6)} (${pct}%)`);
      await refreshBalances();
    } catch (e: any) {
      alert(`Sell failed: ${e?.message ?? String(e)}`);
    } finally {
      setSellingByWallet((prev) => ({ ...prev, [walletPk]: false }));
    }
  };

  const handleSell = async () => {
    if (sellType === "raydium" && !marketId.trim()) {
      alert("Market ID is required for Raydium");
      return;
    }
    if (sellType === "pumpfun" && mint.trim().length === 0) {
      alert("Mint is required for Pump.Fun sell (paste token mint)");
      return;
    }
    if (sellType === "pumpfun" && sellMode === "single" && !selectedWallet) {
      alert("Select a wallet for Single Wallet sell");
      return;
    }
    
    setSellingGlobal(true);
    try {
      if (sellType === "pumpfun") {
        const parsedTip = parseFloat(jitoTip);
        const base = { percentage, mint: mint.trim() };

        if (sellMode === "single") {
          await sellPumpFun({
            ...base,
            mode: "quick",
            wallet: selectedWallet,
            autoFundWallets: autoFund,
            dryRun,
            jitoTip: Number.isFinite(parsedTip) ? parsedTip : undefined,
          });
        } else if (sellMode === "multi") {
          const wallets =
            walletSelection === "select" ? selectedWallets : undefined;
          const wp =
            percentageMode === "different" ? walletPercentages : undefined;

          await sellPumpFun({
            ...base,
            mode: executionMode, // consolidated | per-wallet
            wallets,
            walletPercentages: wp,
            autoFundWallets: executionMode === "per-wallet" ? autoFund : undefined,
            dryRun,
            jitoTip: Number.isFinite(parsedTip) ? parsedTip : undefined,
          });
        } else {
          alert("Use the per-wallet buttons below to sell little by little.");
        }
      } else {
        await sellRaydium({ percentage, marketId });
      }
      alert("Sell initiated! Check console for details.");
      await refreshBalances();
    } catch (error: any) {
      alert(`Sell failed: ${error.message || error.toString()}`);
      console.error("Sell error:", error);
    } finally {
      setSellingGlobal(false);
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

              {sellType === "pumpfun" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token Mint *
                  </label>
                  {ownedTokens.length > 0 && (
                    <select
                      value={mint}
                      onChange={(e) => setMint(e.target.value)}
                      className="w-full px-5 py-3 mb-2 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    >
                      <option value="">Select a token mint…</option>
                      {ownedTokens.map((t) => (
                        <option key={t.mint} value={t.mint}>
                          {t.mint.slice(0, 6)}…{t.mint.slice(-6)} {t.uiAmount != null ? `(${t.uiAmount})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    required
                    value={mint}
                    onChange={(e) => setMint(e.target.value)}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="Paste token mint (e.g. 9uaZikqP...)"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Note: Pump.Fun sell works only while the token is still on the bonding curve (pre‑migration).
                  </p>
                </div>
              )}

              {sellType === "pumpfun" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sell Mode
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={sellMode === "per-wallet" ? "primary" : "ghost"}
                      onClick={() => setSellMode("per-wallet")}
                      className="flex-1"
                    >
                      Per-wallet
                    </Button>
                    <Button
                      type="button"
                      variant={sellMode === "single" ? "primary" : "ghost"}
                      onClick={() => setSellMode("single")}
                      className="flex-1"
                    >
                      Single wallet
                    </Button>
                    <Button
                      type="button"
                      variant={sellMode === "multi" ? "primary" : "ghost"}
                      onClick={() => setSellMode("multi")}
                      className="flex-1"
                    >
                      Multi-wallet
                    </Button>
                  </div>
                </div>
              )}

              {sellType === "pumpfun" && sellMode === "single" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Wallet (advanced) *
                  </label>
                  <select
                    value={selectedWallet}
                    onChange={(e) => setSelectedWallet(e.target.value)}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                  >
                    <option value="">Select wallet…</option>
                    {availableWallets.map((w) => (
                      <option key={w.publicKey} value={w.publicKey}>
                        {w.label ? `${w.label} ` : ""}
                        {w.publicKey.slice(0, 6)}…{w.publicKey.slice(-6)}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-300 mt-3">
                    <input
                      type="checkbox"
                      checked={autoFund}
                      onChange={(e) => setAutoFund(e.target.checked)}
                    />
                    Auto-fund wallet for fees (recommended)
                  </label>
                </div>
              )}

              {sellType === "pumpfun" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={dryRun}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (!next) {
                          const ok = confirm("⚠️ This will send a REAL sell transaction on MAINNET. Continue?");
                          if (!ok) return;
                        }
                        setDryRun(next);
                      }}
                    />
                    Dry-run (simulate only, no real sell)
                  </label>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Jito Tip (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={jitoTip}
                      onChange={(e) => setJitoTip(e.target.value)}
                      className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                      placeholder="0.01"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Increase this if you see “bundle dropped”.
                    </p>
                  </div>
                </div>
              )}

              {sellType === "pumpfun" && sellMode === "multi" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Execution Mode
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={executionMode === "consolidated" ? "primary" : "ghost"}
                        onClick={() => setExecutionMode("consolidated")}
                        className="flex-1"
                      >
                        Consolidated
                      </Button>
                      <Button
                        type="button"
                        variant={executionMode === "per-wallet" ? "primary" : "ghost"}
                        onClick={() => setExecutionMode("per-wallet")}
                        className="flex-1"
                      >
                        Per-Wallet
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Consolidated merges tokens to one wallet then sells (one trader). Per-Wallet sells from each wallet separately (multiple traders).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Wallets
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={walletSelection === "all" ? "primary" : "ghost"}
                        onClick={() => setWalletSelection("all")}
                        className="flex-1"
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant={walletSelection === "select" ? "primary" : "ghost"}
                        onClick={() => setWalletSelection("select")}
                        className="flex-1"
                      >
                        Select
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Percentage Mode
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={percentageMode === "same" ? "primary" : "ghost"}
                        onClick={() => setPercentageMode("same")}
                        className="flex-1"
                      >
                        Same for all
                      </Button>
                      <Button
                        type="button"
                        variant={percentageMode === "different" ? "primary" : "ghost"}
                        onClick={() => setPercentageMode("different")}
                        className="flex-1"
                      >
                        Different per wallet
                      </Button>
                    </div>
                  </div>

                  {executionMode === "per-wallet" && (
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={autoFund}
                        onChange={(e) => setAutoFund(e.target.checked)}
                      />
                      Auto-fund wallets for fees (recommended)
                    </label>
                  )}

                  {walletSelection === "select" && availableWallets.length > 0 && (
                    <div className="space-y-2">
                      {availableWallets.map((w) => {
                        const checked = selectedWallets.includes(w.publicKey);
                        const pct = walletPercentages[w.publicKey] ?? percentage;
                        return (
                          <div key={w.publicKey} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selectedWallets, w.publicKey]
                                  : selectedWallets.filter((x) => x !== w.publicKey);
                                setSelectedWallets(next);
                              }}
                            />
                            <div className="flex-1 text-sm text-gray-300">
                              {w.label ? `${w.label} ` : ""}
                              {w.publicKey.slice(0, 6)}…{w.publicKey.slice(-6)}
                            </div>
                            {percentageMode === "different" && (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={pct}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setWalletPercentages((prev) => ({ ...prev, [w.publicKey]: v }));
                                }}
                                className="w-20 px-2 py-1 bg-[#0f0f1a] border border-[#00ff41]/20 rounded text-white focus:outline-none focus:border-[#00ff41]"
                              />
                            )}
                          </div>
                        );
                      })}
                      {percentageMode === "different" && (
                        <p className="text-xs text-gray-500 mt-2">
                          For wallets without a custom %, the slider value will be used.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(sellType !== "pumpfun" || sellMode !== "per-wallet") && (
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
              )}

              <div className="pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleSell}
                  disabled={
                    sellingGlobal ||
                    (sellType === "raydium" && !marketId.trim()) ||
                    (sellType === "pumpfun" && (!mint.trim() || (sellMode === "single" && !selectedWallet) || sellMode === "per-wallet"))
                  }
                >
                  {sellingGlobal ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-5 h-5 mr-2" />
                      {sellType === "pumpfun" && sellMode === "single" ? `Sell ${percentage}%` : `Sell ${percentage}%`}
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

        {sellType === "pumpfun" && mint.trim() && sellMode === "per-wallet" && (
          <Card>
            <CardHeader>
              <CardTitle>Per-wallet quick buttons (sell little by little)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {loadingBalances ? "Loading balances…" : "Balances are best-effort (RPC)."}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={refreshBalances} disabled={loadingBalances}>
                  Refresh balances
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...availableWallets]
                  .sort((a, b) => {
                    const ab = (mintBalances[a.publicKey]?.uiAmount ?? 0) > 0 ? 1 : 0;
                    const bb = (mintBalances[b.publicKey]?.uiAmount ?? 0) > 0 ? 1 : 0;
                    if (ab !== bb) return bb - ab; // balances first
                    const aDev = a.label === "Dev Wallet" ? 1 : 0;
                    const bDev = b.label === "Dev Wallet" ? 1 : 0;
                    if (aDev !== bDev) return bDev - aDev;
                    return a.publicKey.localeCompare(b.publicKey);
                  })
                  .map((w) => {
                  const isDev = w.label === "Dev Wallet";
                  const bal = mintBalances[w.publicKey]?.uiAmount ?? 0;
                  const pct = perWalletPct[w.publicKey] ?? 5;
                  const disabled = sellingGlobal || !!sellingByWallet[w.publicKey] || bal <= 0;
                  return (
                    <div
                      key={w.publicKey}
                      className={
                        isDev
                          ? "border border-[#00d4ff]/40 bg-[#0f0f1a] rounded-lg p-4 ring-1 ring-[#00d4ff]/30"
                          : "border border-[#00ff41]/20 rounded-lg p-4 bg-[#0f0f1a]"
                      }
                    >
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-300">
                          <span className={isDev ? "text-[#00d4ff]" : "text-gray-300"}>
                            {w.label ?? "Wallet"} {w.publicKey.slice(0, 6)}…{w.publicKey.slice(-6)}
                          </span>
                          {isDev && (
                            <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30">
                              DEV
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">bal: {bal}</div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        {[5, 10, 25].map((p) => (
                          <Button
                            key={p}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setPerWalletPct((prev) => ({ ...prev, [w.publicKey]: p }))}
                          >
                            {p}%
                          </Button>
                        ))}
                      </div>

                      <div className="flex gap-2 mt-3 items-center">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={pct}
                          onChange={(e) => setPerWalletPct((prev) => ({ ...prev, [w.publicKey]: Number(e.target.value) }))}
                          className="w-20 px-2 py-2 bg-[#0f0f1a] border border-[#00ff41]/20 rounded text-white focus:outline-none focus:border-[#00ff41]"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          className="flex-1"
                          disabled={disabled}
                          onClick={() => sellOneWallet(w.publicKey, pct)}
                        >
                          {sellingByWallet[w.publicKey] ? "Selling..." : `Sell ${pct}%`}
                        </Button>
                      </div>

                      {bal <= 0 && (
                        <div className="text-xs text-gray-500 mt-2">
                          No tokens in this wallet for this mint.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

