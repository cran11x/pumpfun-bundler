"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useHealthStore, useWalletStore } from "@/lib/store";
import { useEffect } from "react";
import { healthCheck, getBalances } from "@/lib/api";
import { Activity, Wallet, Rocket, TrendingDown, Zap, Shield, CheckCircle2, XCircle } from "lucide-react";

export default function Dashboard() {
  const { setHealth, rpc, jito, network } = useHealthStore();
  const { setBalances, balances } = useWalletStore();

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await healthCheck();
        setHealth(health);
      } catch (error) {
        console.error("Health check failed:", error);
      }
    };

    const loadBalances = async () => {
      try {
        const data = await getBalances();
        setBalances(data.balances || {});
      } catch (error) {
        console.error("Failed to load balances:", error);
      }
    };

    checkHealth();
    loadBalances();

    const interval = setInterval(() => {
      checkHealth();
      loadBalances();
    }, 30000);

    return () => clearInterval(interval);
  }, [setHealth, setBalances]);

  const totalBalance = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
  const walletCount = Object.keys(balances).length;
  const avgBalance = walletCount > 0 ? totalBalance / walletCount : 0;

  return (
    <MainLayout>
      <div className="space-y-6 p-2">
        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            Dashboard
          </h1>
          <p className="text-sm text-gray-400">
            Monitor your system status and manage your token operations
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {/* System Status */}
          <Card glow="green">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#00ff41]/10">
                  <Activity className="w-5 h-5 text-[#00ff41]" />
                </div>
                <span>System Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-400">RPC Connection</span>
                  <div className="flex items-center gap-2">
                    {rpc ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#00ff41]" />
                        <span className="text-sm font-medium text-[#00ff41]">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-red-400">Disconnected</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-sm text-gray-400">Jito Block Engine</span>
                  <div className="flex items-center gap-2">
                    {jito ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#00ff41]" />
                        <span className="text-sm font-medium text-[#00ff41]">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-red-400">Disconnected</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-sm text-gray-400">Network</span>
                  <span className="text-sm font-semibold text-[#00d4ff] uppercase tracking-wide">
                    {network}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Overview */}
          <Card glow="cyan">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#00d4ff]/10">
                  <Wallet className="w-5 h-5 text-[#00d4ff]" />
                </div>
                <span>Wallet Overview</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-400">Total Wallets</span>
                  <span className="text-lg font-bold text-white">{walletCount}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-sm text-gray-400">Total Balance</span>
                  <span className="text-base font-bold text-[#00d4ff] font-mono">
                    {totalBalance.toFixed(4)} SOL
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-sm text-gray-400">Average Balance</span>
                  <span className="text-sm font-medium text-gray-300 font-mono">
                    {avgBalance.toFixed(4)} SOL
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/10">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <span>Quick Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <a href="/launch">
                  <Button variant="primary" className="w-full justify-start">
                    <Rocket className="w-4 h-4 mr-2" />
                    Launch Token
                  </Button>
                </a>
                <a href="/wallets">
                  <Button variant="secondary" className="w-full justify-start">
                    <Wallet className="w-4 h-4 mr-2" />
                    Manage Wallets
                  </Button>
                </a>
                <a href="/sell">
                  <Button variant="ghost" className="w-full justify-start">
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Sell Tokens
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-orange-500/10">
                <Shield className="w-5 h-5 text-orange-400" />
              </div>
              <span>Recent Activity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 flex items-center justify-center">
                <Activity className="w-10 h-10 text-gray-500" />
              </div>
              <p className="text-base font-medium text-gray-400 mb-1">
                No recent activity
              </p>
              <p className="text-sm text-gray-500">
                Launch your first token to see activity here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
