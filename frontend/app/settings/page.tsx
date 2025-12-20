"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState, useEffect } from "react";
import { getConfig, updateConfig, createLUT, extendLUT } from "@/lib/api";
import { Settings, Save, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    rpcUrl: "",
    jitoUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">Settings</h1>
          <p className="text-gray-400">Configure your bundler settings</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  className="w-full px-4 py-2 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
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
                  className="w-full px-4 py-2 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
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
        </div>
      </div>
    </MainLayout>
  );
}

