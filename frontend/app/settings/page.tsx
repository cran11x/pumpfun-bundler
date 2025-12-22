"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState, useEffect } from "react";
import { getConfig, updateConfig, createLUT, extendLUT } from "@/lib/api";
import { useNetworkStore } from "@/lib/store";
import { Settings, Save, RefreshCw, Globe, FlaskConical, AlertTriangle, ExternalLink } from "lucide-react";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    rpcUrl: "",
    jitoUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { network, isDevnet, fetchNetwork, setNetwork, loading: networkLoading } = useNetworkStore();

  useEffect(() => {
    loadConfig();
    fetchNetwork();
  }, [fetchNetwork]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getConfig();
      setConfig(data);
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig(config);
      alert("Configuration saved!");
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleNetworkChange = async (newNetwork: "mainnet" | "devnet") => {
    const result = await setNetwork(newNetwork);
    if (result.success && result.requiresRestart) {
      alert(`Network changed to ${newNetwork.toUpperCase()}!\n\nPlease restart the server for changes to take effect.`);
    }
  };

  const handleCreateLUT = async () => {
    if (!confirm("Create new Lookup Table? This will cost SOL.")) return;
    try {
      await createLUT(0.01);
      alert("LUT creation initiated! Check console for details.");
    } catch (error: any) {
      alert(`Failed to create LUT: ${error.message || error.toString()}`);
      console.error("LUT creation error:", error);
    }
  };

  const handleExtendLUT = async () => {
    if (!confirm("Extend Lookup Table? This will cost SOL.")) return;
    try {
      await extendLUT(0.01);
      alert("LUT extension initiated! Check console for details.");
    } catch (error: any) {
      alert(`Failed to extend LUT: ${error.message || error.toString()}`);
      console.error("LUT extension error:", error);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-2">
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">Settings</h1>
          <p className="text-gray-400">Configure your bundler settings</p>
        </div>

        {/* Devnet Warning Banner */}
        {isDevnet && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-400">Test Mode Active (Devnet)</h3>
              <p className="text-sm text-yellow-400/80 mt-1">
                You are using Solana Devnet. Transactions use free test SOL and have no real value.
                Get free SOL from the faucet to test your setup.
              </p>
              <a 
                href="https://faucet.solana.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-yellow-400 hover:text-yellow-300 underline"
              >
                Get Free Devnet SOL <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Network Toggle Card */}
          <Card className={isDevnet ? "border-yellow-500/30" : "border-emerald-500/30"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isDevnet ? (
                  <FlaskConical className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Globe className="w-5 h-5 text-emerald-400" />
                )}
                Network Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-400">
                Switch between Mainnet (real transactions) and Devnet (free testing).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleNetworkChange("mainnet")}
                  disabled={networkLoading}
                  className={`p-5 rounded-lg border-2 transition-all ${
                    network === "mainnet"
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-gray-600 bg-gray-800/50 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  <Globe className="w-8 h-8 mx-auto mb-2" />
                  <div className="font-bold">MAINNET</div>
                  <div className="text-xs opacity-70">Real transactions</div>
                </button>

                <button
                  onClick={() => handleNetworkChange("devnet")}
                  disabled={networkLoading}
                  className={`p-5 rounded-lg border-2 transition-all ${
                    network === "devnet"
                      ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                      : "border-gray-600 bg-gray-800/50 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  <FlaskConical className="w-8 h-8 mx-auto mb-2" />
                  <div className="font-bold">DEVNET</div>
                  <div className="text-xs opacity-70">Free testing</div>
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Current: <span className={isDevnet ? "text-yellow-400" : "text-emerald-400"}>{network.toUpperCase()}</span>
                {networkLoading && " (switching...)"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  RPC URL
                </label>
                <input
                  type="text"
                  value={config.rpcUrl}
                  onChange={(e) => setConfig({ ...config, rpcUrl: e.target.value })}
                  className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                  placeholder="https://mainnet.helius-rpc.com/?api-key=..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Jito Block Engine URL
                </label>
                <input
                  type="text"
                  value={config.jitoUrl}
                  onChange={(e) => setConfig({ ...config, jitoUrl: e.target.value })}
                  className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                  placeholder="amsterdam.mainnet.block-engine.jito.wtf"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="primary" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button type="button" variant="ghost" onClick={loadConfig} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>LUT Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-400">
                Lookup Tables (LUT) are required for bundling transactions. Create a new LUT for
                each launch or extend the existing one.
              </p>

              <div className="space-y-2">
                <Button type="button" variant="secondary" className="w-full" onClick={handleCreateLUT}>
                  Create New LUT
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={handleExtendLUT}>
                  Extend Existing LUT
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Devnet Faucet Card */}
          {isDevnet && (
            <Card className="border-yellow-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-400">
                  <FlaskConical className="w-5 h-5" />
                  Devnet Faucet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">
                  Get free Devnet SOL for testing. Copy your wallet address and paste it in the faucet.
                </p>

                <div className="space-y-2">
                  <a
                    href="https://faucet.solana.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Solana Faucet
                  </a>
                  <a
                    href="https://solfaucet.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    SolFaucet (Alternative)
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

