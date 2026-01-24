"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { generateBuyAmounts, getSolPrice, launchToken, uploadMetadata, getWallets, getMainWallet, setBuyAmounts, getMint, generateMint } from "@/lib/api";
import { Rocket, Upload, Loader2 } from "lucide-react";

export default function LaunchPage() {
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    tiktok: "",
    youtube: "",
    jitoTip: "0.05",
  });
  const [image, setImage] = useState<File | null>(null);
  const [launching, setLaunching] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [uploadingMeta, setUploadingMeta] = useState(false);
  const [buyCurrency, setBuyCurrency] = useState<"eur" | "sol">("eur");
  const [buyTarget, setBuyTarget] = useState("300");
  const [buyVariance, setBuyVariance] = useState("30");
  const [includeDev, setIncludeDev] = useState(false);
  const [solEur, setSolEur] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Record<string, { solAmount: string; approxEur?: number }>>({});
  const [manualEnabled, setManualEnabled] = useState(false);
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [savingManual, setSavingManual] = useState(false);
  const [wallets, setWallets] = useState<string[]>([]);
  const [devWalletPk, setDevWalletPk] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [mintConfirmed, setMintConfirmed] = useState(false);
  const [mintLoading, setMintLoading] = useState(false);

  useEffect(() => {
    // Best-effort: fetch SOL/EUR price for nicer UX
    (async () => {
      try {
        const r = await getSolPrice("eur");
        const p = r?.solana?.eur;
        if (typeof p === "number" && Number.isFinite(p) && p > 0) setSolEur(p);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    // Load wallet list for manual per-wallet amounts
    (async () => {
      try {
        const [walletsResp, mainResp] = await Promise.all([getWallets(), getMainWallet()]);
        const subWallets = Array.isArray(walletsResp?.wallets)
          ? walletsResp.wallets.map((w: any) => w.publicKey)
          : [];
        setWallets(subWallets);
        setDevWalletPk(mainResp?.wallet?.publicKey ?? null);
      } catch (error) {
        console.error("Failed to load wallets for manual buy amounts:", error);
      }
    })();
  }, []);

  useEffect(() => {
    // Load existing pre-generated mint (if any)
    (async () => {
      try {
        const resp = await getMint();
        if (resp?.mint) {
          setMintAddress(resp.mint);
        }
      } catch (error) {
        console.error("Failed to load mint:", error);
      }
    })();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const target = Number(buyTarget);
      const variance = Number(buyVariance);
      if (!Number.isFinite(target) || target <= 0) throw new Error("Invalid target");
      if (!Number.isFinite(variance) || variance < 0) throw new Error("Invalid variance");

      const resp = await generateBuyAmounts({
        currency: buyCurrency,
        target,
        variance,
        includeDev,
        solEur: buyCurrency === "eur" && solEur ? solEur : undefined,
      });
      setGenerated(resp.generated || {});
      if (manualEnabled && resp.generated) {
        const next: Record<string, string> = {};
        Object.entries(resp.generated).forEach(([pk, v]) => {
          next[pk] = v.solAmount;
        });
        setManualAmounts((prev) => ({ ...prev, ...next }));
      }
      alert(`✅ Generated buy amounts for ${resp.walletsCount} wallet(s). Saved into keyInfo.json.`);
    } catch (e: any) {
      alert(`Failed to generate: ${e?.message ?? String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleManualSave = async () => {
    if (savingManual) return;
    const entries: Array<{ pk: string; label: string }> = [
      ...(devWalletPk ? [{ pk: devWalletPk, label: "Dev wallet" }] : []),
      ...wallets.map((pk, i) => ({ pk, label: `Wallet ${i + 1}` })),
    ];
    if (entries.length === 0) {
      alert("No wallets loaded. Please refresh the page.");
      return;
    }
    const amounts: Record<string, number> = {};
    const missing: string[] = [];
    for (const entry of entries) {
      const raw = manualAmounts[entry.pk];
      if (!raw || !raw.trim()) {
        missing.push(entry.label);
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) {
        alert(`Invalid SOL amount for ${entry.label}.`);
        return;
      }
      amounts[entry.pk] = num;
    }
    if (missing.length > 0) {
      alert(`Please fill SOL amount for: ${missing.join(", ")}`);
      return;
    }
    setSavingManual(true);
    try {
      const resp = await setBuyAmounts(amounts);
      setGenerated(resp.updated || {});
      alert(`Saved manual buy amounts for ${resp.walletsCount} wallet(s).`);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      alert(`Failed to save manual buy amounts: ${apiMessage}`);
      console.error("Manual buy amounts error:", error);
    } finally {
      setSavingManual(false);
    }
  };

  const handleMintGenerate = async (force = false) => {
    if (mintLoading) return;
    setMintLoading(true);
    try {
      const resp = await generateMint(force);
      setMintAddress(resp.mint);
      setMintConfirmed(false);
      if (resp.reused) {
        alert("Existing mint found and reused.");
      } else {
        alert("Mint generated successfully. Please confirm before launch.");
      }
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      alert(`Failed to generate mint: ${apiMessage}`);
    } finally {
      setMintLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setMetadataUri(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMetadataUpload = async () => {
    if (!image) {
      alert("Please select an image first");
      return;
    }
    if (!formData.name || !formData.symbol || !formData.description) {
      alert("Name, symbol, and description are required before upload");
      return;
    }
    setUploadingMeta(true);
    try {
      const result = await uploadMetadata({
        ...formData,
        image,
      });
      const uri = result?.metadataUri;
      if (!uri) throw new Error("No metadataUri returned");
      setMetadataUri(uri);
      alert("Metadata uploaded. You can now launch with the saved metadata.");
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      alert(`Metadata upload failed: ${apiMessage}`);
      console.error("Metadata upload error:", error);
    } finally {
      setUploadingMeta(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mintAddress) {
      alert("Please generate a mint first.");
      return;
    }
    if (!mintConfirmed) {
      alert("Please confirm the mint before launching.");
      return;
    }
    if (!image && !metadataUri) {
      alert("Please select an image or upload metadata first");
      return;
    }

    setLaunching(true);
    try {
      const result = await launchToken({
        ...formData,
        image: metadataUri ? undefined : image ?? undefined,
        metadataUri: metadataUri ?? undefined,
        jitoTip: parseFloat(formData.jitoTip),
      });
      alert("Token launch initiated! Check console for details.");
      console.log("Launch result:", result);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      const apiHint = error?.response?.data?.hint;
      const apiDetails = error?.response?.data?.details;
      const hintLine = apiHint ? `\nHint: ${apiHint}` : "";
      const detailsLine = apiDetails ? `\nDetails: ${apiDetails}` : "";
      alert(`Launch failed: ${apiMessage}${hintLine}${detailsLine}`);
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
                    TikTok URL
                  </label>
                  <input
                    type="url"
                    value={formData.tiktok}
                    onChange={(e) => setFormData({ ...formData, tiktok: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="https://www.tiktok.com/@yourproject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube URL
                  </label>
                  <input
                    type="url"
                    value={formData.youtube}
                    onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                    className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    placeholder="https://www.youtube.com/@yourproject"
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
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleMetadataUpload}
                      disabled={uploadingMeta || !image}
                    >
                      {uploadingMeta ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload metadata first"
                      )}
                    </Button>
                    {metadataUri && (
                      <div className="text-xs text-gray-400">
                        Metadata uploaded. Launch will reuse this URI.
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMetadataUri(null)}
                          className="ml-2"
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Mint (Pre-Generate)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">
                  Generate the mint address before launch. You must confirm it before launching.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleMintGenerate(false)}
                    disabled={mintLoading}
                  >
                    {mintLoading ? "Generating..." : mintAddress ? "Reuse Mint" : "Generate Mint"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleMintGenerate(true)}
                    disabled={mintLoading}
                  >
                    Regenerate
                  </Button>
                </div>

                {mintAddress && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Mint address:</div>
                    <div className="terminal-text text-sm text-[#00ff41] break-all">
                      {mintAddress}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={mintConfirmed}
                        onChange={(e) => setMintConfirmed(e.target.checked)}
                      />
                      I confirm launch with this mint
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Buy Amounts (per wallet)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">
                  Generate different buy amounts per wallet (saved into <code className="text-gray-300">keyInfo.json</code>). Launch will use these exact numbers.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Currency</label>
                    <select
                      value={buyCurrency}
                      onChange={(e) => setBuyCurrency(e.target.value as "eur" | "sol")}
                      className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                    >
                      <option value="eur">EUR</option>
                      <option value="sol">SOL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Target per wallet ({buyCurrency.toUpperCase()})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={buyTarget}
                      onChange={(e) => setBuyTarget(e.target.value)}
                      className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                      placeholder="300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Variance (± {buyCurrency.toUpperCase()})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={buyVariance}
                      onChange={(e) => setBuyVariance(e.target.value)}
                      className="w-full px-5 py-3 bg-[#0f0f1a] border border-[#00ff41]/20 rounded-lg text-white focus:outline-none focus:border-[#00ff41] focus:glow-green"
                      placeholder="30"
                    />
                  </div>
                </div>

                {buyCurrency === "eur" && solEur && (
                  <p className="text-xs text-gray-500">
                    Using SOL/EUR ≈ <span className="text-gray-300">{solEur}</span> (best-effort).
                  </p>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={includeDev}
                    onChange={(e) => setIncludeDev(e.target.checked)}
                  />
                  Include dev wallet too
                </label>

                <Button type="button" variant="secondary" onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : "Generate & Save"}
                </Button>

                <div className="pt-3 border-t border-white/5">
                  <label className="flex items-center gap-3 text-base text-gray-200">
                    <input
                      type="checkbox"
                      checked={manualEnabled}
                      onChange={(e) => setManualEnabled(e.target.checked)}
                      className="w-5 h-5"
                    />
                    Manual per-wallet amounts
                  </label>
                  <p className="text-sm text-gray-400 mt-2">
                    Set exact SOL buy amount for each wallet. This overrides generated values in <code className="text-gray-300">keyInfo.json</code>.
                  </p>
                </div>

                {manualEnabled && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {[
                        ...(devWalletPk ? [{ pk: devWalletPk, label: "Dev wallet" }] : []),
                        ...wallets.map((pk, i) => ({ pk, label: `Wallet ${i + 1}` })),
                      ].map((entry) => (
                        <div key={entry.pk} className="flex items-center gap-4">
                          <div className="w-36 text-sm text-gray-300">{entry.label}</div>
                          <div className="flex-1 text-sm text-gray-400">
                            {entry.pk.slice(0, 6)}…{entry.pk.slice(-6)}
                          </div>
                          <input
                            type="number"
                            step="0.000001"
                            min="0"
                            value={manualAmounts[entry.pk] ?? ""}
                            onChange={(e) =>
                              setManualAmounts((prev) => ({ ...prev, [entry.pk]: e.target.value }))
                            }
                            className="w-36 px-4 py-2 bg-[#0f0f1a] border border-[#00ff41]/20 rounded text-white focus:outline-none focus:border-[#00ff41] focus:glow-green text-base"
                            placeholder="0.05"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleManualSave}
                        disabled={savingManual}
                      >
                        {savingManual ? "Saving..." : "Save Manual Amounts"}
                      </Button>
                      {Object.keys(generated).length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const next: Record<string, string> = {};
                            Object.entries(generated).forEach(([pk, v]) => {
                              next[pk] = v.solAmount;
                            });
                            setManualAmounts((prev) => ({ ...prev, ...next }));
                          }}
                        >
                          Use Generated Values
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {Object.keys(generated).length > 0 && (
                  <div className="mt-2 text-sm text-gray-300">
                    <div className="text-xs text-gray-500 mb-2">Generated:</div>
                    <div className="space-y-1">
                      {Object.entries(generated).slice(0, 12).map(([pk, v]) => (
                        <div key={pk} className="flex justify-between gap-3">
                          <span className="text-gray-400">{pk.slice(0, 6)}…{pk.slice(-6)}</span>
                          <span>
                            {v.solAmount} SOL{v.approxEur != null ? ` (~${v.approxEur.toFixed(2)} EUR)` : ""}
                          </span>
                        </div>
                      ))}
                      {Object.keys(generated).length > 12 && (
                        <div className="text-xs text-gray-500">…and {Object.keys(generated).length - 12} more</div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={launching || !mintAddress || !mintConfirmed || (!image && !metadataUri)}
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

