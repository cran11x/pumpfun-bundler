"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWalletStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { getWallets, getBalances, createWallets, fundWallets } from "@/lib/api";
import { Wallet, Plus, DollarSign, RefreshCw } from "lucide-react";

export default function WalletsPage() {
  const { wallets, balances, setWallets, setBalances, loading, setLoading } = useWalletStore();
  const [creating, setCreating] = useState(false);
  const [funding, setFunding] = useState(false);

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
      const walletsData = await getWallets();
      console.log("Loaded wallets data:", walletsData);
      console.log("Wallets array:", walletsData.wallets);
      const walletsArray = walletsData.wallets || [];
      console.log(`Setting ${walletsArray.length} wallets to state`);
      setWallets(walletsArray);
      
      const balancesData = await getBalances();
      setBalances(balancesData.balances || {});
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
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

  const handleFundWallets = async () => {
    setFunding(true);
    try {
      await fundWallets();
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
      <div className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallets ({wallets.length})
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
    </MainLayout>
  );
}

