"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWalletStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { getWallets, getBalances, createWallets, fundWallets, getMainWallet } from "@/lib/api";
import { Wallet, Plus, DollarSign, RefreshCw, Copy, Check, Crown, X } from "lucide-react";

export default function WalletsPage() {
  const { wallets, balances, setWallets, setBalances, loading, setLoading } = useWalletStore();
  const [creating, setCreating] = useState(false);
  const [funding, setFunding] = useState(false);
  const [mainWallet, setMainWallet] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("0.1");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    console.log("Wallets state updated:", wallets);
    console.log("Number of wallets in state:", wallets.length);
  }, [wallets]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load wallets first
      const walletsData = await getWallets();
      console.log("Loaded wallets data:", walletsData);
      console.log("Wallets array:", walletsData.wallets);
      const walletsArray = walletsData.wallets || [];
      console.log(`Setting ${walletsArray.length} wallets to state`);
      setWallets(walletsArray);
      
      // Load balances and main wallet in parallel, but don't fail if one fails
      try {
        const [balancesData, mainWalletData] = await Promise.allSettled([
          getBalances(),
          getMainWallet()
        ]);
        
        if (balancesData.status === 'fulfilled') {
          setBalances(balancesData.value.balances || {});
        } else {
          console.warn("Failed to load balances:", balancesData.reason);
          setBalances({});
        }
        
        if (mainWalletData.status === 'fulfilled') {
          setMainWallet(mainWalletData.value);
        } else {
          console.warn("Failed to load main wallet:", mainWalletData.reason);
        }
      } catch (error) {
        console.warn("Failed to load additional data:", error);
      }
    } catch (error) {
      console.error("Failed to load wallets:", error);
      // Don't show error if wallets loaded successfully
      if (wallets.length === 0) {
        alert(`Failed to load wallets: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMake sure API server is running on http://localhost:3001`);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleCreateWallets = async () => {
    const countInput = prompt("How many wallets do you want to create? (1-24)", "12");
    
    if (!countInput) {
      return; // User cancelled
    }
    
    const count = parseInt(countInput);
    
    if (isNaN(count) || count < 1 || count > 24) {
      alert("Please enter a number between 1 and 24");
      return;
    }
    
    if (!confirm(`This will create ${count} new wallets. Existing wallets will be replaced. Continue?`)) {
      return;
    }
    
    setCreating(true);
    try {
      const result = await createWallets(count);
      console.log("Create wallets result:", result);
      
      // Small delay to ensure files are written to disk
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reload data to show new wallets
      console.log("Reloading data after wallet creation...");
      await loadData();
      
      // Get current wallets from store after reload
      const currentWallets = useWalletStore.getState().wallets;
      console.log("Wallets after reload:", currentWallets);
      
      if (currentWallets.length === 0) {
        alert(`Wallets created but not loaded. Please click Refresh button.`);
      } else {
        alert(`Successfully created and loaded ${currentWallets.length} wallet(s)!`);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || error.toString();
      alert(`Failed to create wallets: ${errorMessage}`);
      console.error("Failed to create wallets:", error);
      if (error.response) {
        console.error("Response data:", error.response.data);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleFundWallets = () => {
    setShowFundModal(true);
  };

  const handleFundConfirm = async () => {
    setShowFundModal(false);
    setFunding(true);
    try {
      const amountPerWallet = fundAmount.trim() ? parseFloat(fundAmount.trim()) : undefined;
      
      if (amountPerWallet !== undefined && (isNaN(amountPerWallet) || amountPerWallet <= 0)) {
        alert("Please enter a valid positive number for SOL amount.");
        setFunding(false);
        return;
      }
      
      await fundWallets(amountPerWallet);
      alert("Funding wallets initiated! This may take a few moments.");
      await loadData();
    } catch (error: any) {
      alert(`Failed to fund wallets: ${error.message || error.toString()}`);
      console.error("Failed to fund wallets:", error);
    } finally {
      setFunding(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold terminal-text mb-2">Wallet Management</h1>
            <p className="text-gray-400">Create, fund, and manage your wallets</p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" variant="primary" onClick={handleCreateWallets} disabled={creating}>
              <Plus className="w-4 h-4 mr-2" />
              Create Wallets
            </Button>
            <Button type="button" variant="secondary" onClick={handleFundWallets} disabled={funding}>
              <DollarSign className="w-4 h-4 mr-2" />
              Fund Wallets
            </Button>
          </div>
        </div>

        {/* Main Wallet Card */}
        {mainWallet && (
          <Card className="border-[#00ff41]/30 bg-gradient-to-br from-[#00ff41]/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                Main Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dev Wallet */}
              <div className="glass border border-[#00ff41]/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#00ff41] bg-[#00ff41]/20 px-2 py-1 rounded">
                      DEV WALLET
                    </span>
                    <span className="text-xs text-gray-400">{mainWallet.wallet.role}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(mainWallet.wallet.publicKey)}
                    className="p-2 hover:bg-[#00ff41]/10 rounded transition-colors"
                  >
                    {copied === mainWallet.wallet.publicKey ? (
                      <Check className="w-4 h-4 text-[#00ff41]" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <div className="terminal-text text-sm text-[#00ff41] mb-2 break-all">
                  {mainWallet.wallet.publicKey}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Balance:</span>
                  <span className={`text-lg font-bold ${
                    mainWallet.wallet.balance > 0.1 
                      ? "text-[#00ff41]" 
                      : mainWallet.wallet.balance > 0 
                        ? "text-yellow-400" 
                        : "text-red-400"
                  }`}>
                    {mainWallet.wallet.balance.toFixed(4)} SOL
                  </span>
                </div>
              </div>

              {/* Payer Wallet */}
              {!mainWallet.isSame && (
                <div className="glass border border-[#00d4ff]/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#00d4ff] bg-[#00d4ff]/20 px-2 py-1 rounded">
                        PAYER WALLET
                      </span>
                      <span className="text-xs text-gray-400">{mainWallet.payer.role}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(mainWallet.payer.publicKey)}
                      className="p-2 hover:bg-[#00d4ff]/10 rounded transition-colors"
                    >
                      {copied === mainWallet.payer.publicKey ? (
                        <Check className="w-4 h-4 text-[#00d4ff]" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <div className="terminal-text text-sm text-[#00d4ff] mb-2 break-all">
                    {mainWallet.payer.publicKey}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Balance:</span>
                    <span className={`text-lg font-bold ${
                      mainWallet.payer.balance > 0.1 
                        ? "text-[#00d4ff]" 
                        : mainWallet.payer.balance > 0 
                          ? "text-yellow-400" 
                          : "text-red-400"
                    }`}>
                      {mainWallet.payer.balance.toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              )}

              {mainWallet.isSame && (
                <div className="text-xs text-gray-500 text-center py-2">
                  Dev wallet and Payer wallet are the same
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Sub Wallets ({wallets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : wallets.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No wallets found. Create wallets to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((wallet) => {
                  const balance = balances[wallet.publicKey] || 0;
                  return (
                    <div
                      key={wallet.publicKey}
                      className="glass border border-[#00ff41]/20 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="terminal-text text-sm text-[#00ff41] mb-1">
                          {wallet.publicKey}
                        </div>
                        <div className="text-xs text-gray-400">
                          Balance: <span className="text-[#00d4ff]">{balance.toFixed(4)} SOL</span>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded text-xs ${
                        balance > 0.01 
                          ? "bg-[#00ff41]/20 text-[#00ff41]" 
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {balance > 0.01 ? "Funded" : "Low Balance"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fund Wallets Modal */}
      {showFundModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-[#00ff41]/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#00ff41]" />
                  Fund Wallets
                </CardTitle>
                <button
                  onClick={() => setShowFundModal(false)}
                  className="p-2 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SOL Amount Per Wallet
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                  placeholder="0.1"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2">
                  Enter the amount of SOL to send to each wallet. Leave empty to use simulated buy amounts if configured.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleFundConfirm}
                  disabled={funding}
                  className="flex-1"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  {funding ? "Funding..." : "Fund Wallets"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowFundModal(false)}
                  disabled={funding}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}

