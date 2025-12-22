"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { launchToken } from "@/lib/api";
import { Rocket, Upload, Loader2 } from "lucide-react";

export default function LaunchPage() {
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    jitoTip: "0.05",
  });
  const [image, setImage] = useState<File | null>(null);
  const [launching, setLaunching] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) {
      alert("Please select an image");
      return;
    }

    setLaunching(true);
    try {
      const result = await launchToken({
        ...formData,
        image,
        jitoTip: parseFloat(formData.jitoTip),
      });
      alert("Token launch initiated! Check console for details.");
      console.log("Launch result:", result);
    } catch (error: any) {
      alert(`Launch failed: ${error.message}`);
      console.error("Launch error:", error);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-2">
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">Launch Token</h1>
          <p className="text-gray-400">Create and launch your token on Pump.Fun</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Token Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="My Awesome Token"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Symbol *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="MAT"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description *
                  </label>
                  <textarea
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    rows={3}
                    placeholder="Describe your token..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Jito Tip (SOL) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.001"
                    min="0.001"
                    value={formData.jitoTip}
                    onChange={(e) => setFormData({ ...formData, jitoTip: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="0.05"
                  />
                  <p className="text-xs text-gray-500 mt-1">Recommended: 0.05 SOL</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Social Links & Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Twitter URL
                  </label>
                  <input
                    type="url"
                    value={formData.twitter}
                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="https://twitter.com/yourproject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Telegram URL
                  </label>
                  <input
                    type="url"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="https://t.me/yourproject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="https://yourproject.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token Image *
                  </label>
                  <div className="border-2 border-dashed border-[#00ff41]/30 rounded-lg p-6 text-center">
                    {preview ? (
                      <div className="space-y-2">
                        <img
                          src={preview}
                          alt="Preview"
                          className="max-w-full max-h-48 mx-auto rounded"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setImage(null);
                            setPreview(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-400">Click to upload image</p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={launching || !image}
            >
              {launching ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5 mr-2" />
                  Launch Token
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}

