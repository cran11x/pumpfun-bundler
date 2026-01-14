import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import * as dotenv from "dotenv";
import axios from "axios";
import { healthCheck } from "../src/utils/healthCheck";
import { validatePreLaunch } from "../src/utils/validations";
import { loadKeypairs } from "../src/createKeys";
import { connection, wallet, payer, networkMode, rpc, getNetworkMode, getRpcUrl, getConnection, invalidateConnectionCache, generateNewMainWallet } from "../config";
import { LAMPORTS_PER_SOL, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

dotenv.config();
// Ensure API runs without interactive prompts (inquirer) from bundler internals
process.env.BUNDLER_NON_INTERACTIVE = "true";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - allow all origins in development
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

app.use(express.json());

const upload = multer({ dest: "uploads/" });

// Simple in-memory price cache to avoid UI breakage on transient upstream failures/rate limits.
const priceCache: Record<string, { price: number; ts: number }> = {};

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validation
app.get("/api/validate", async (req, res) => {
  try {
    const result = await validatePreLaunch();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Wallets
app.get("/api/wallets", async (req, res) => {
  try {
    const keypairs = loadKeypairs();
    const wallets = keypairs.map((kp) => ({
      publicKey: kp.publicKey.toString(),
    }));
    console.log(`[API] Returning ${wallets.length} wallets`);
    res.json({ 
      wallets,
      count: wallets.length
    });
  } catch (error: any) {
    console.error("[API] Error loading wallets:", error);
    console.error("[API] Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Failed to load wallets",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      wallets: [] // Return empty array on error
    });
  }
});

app.post("/api/wallets/create", async (req, res) => {
  try {
    const { count = 12 } = req.body;
    // Use process.cwd() to get project root, then navigate to src/keypairs
    const projectRoot = process.cwd();
    const keypairsDir = path.join(projectRoot, "src", "keypairs");
    const keyInfoPath = path.join(projectRoot, "src", "keyInfo.json");
    
    console.log("Creating wallets in:", keypairsDir);
    console.log("KeyInfo path:", keyInfoPath);
    
    // Ensure directory exists
    if (!fs.existsSync(keypairsDir)) {
      fs.mkdirSync(keypairsDir, { recursive: true });
      console.log("Created keypairs directory");
    }
    
    // Clear existing sub-wallets first (but NOT main-wallet.json)
    if (fs.existsSync(keypairsDir)) {
      const existingFiles = fs.readdirSync(keypairsDir);
      const filesToDelete = existingFiles.filter(file => 
        file.startsWith('keypair') && file.endsWith('.json') && file !== 'main-wallet.json'
      );
      filesToDelete.forEach(file => {
        fs.unlinkSync(path.join(keypairsDir, file));
      });
      console.log(`Cleared ${filesToDelete.length} existing sub-wallet files (main-wallet.json preserved)`);
    }
    
    // Generate wallets
    const wallets: Keypair[] = [];
    for (let i = 0; i < count; i++) {
      const newWallet = Keypair.generate();
      wallets.push(newWallet);
      const keypairPath = path.join(keypairsDir, `keypair${i + 1}.json`);
      fs.writeFileSync(keypairPath, JSON.stringify(Array.from(newWallet.secretKey)));
      console.log(`Created wallet ${i + 1}: ${newWallet.publicKey.toString()}`);
      
      // Verify file was created
      if (!fs.existsSync(keypairPath)) {
        throw new Error(`Failed to create wallet file: ${keypairPath}`);
      }
    }
    
    // Update keyInfo.json
    let poolInfo: any = {};
    if (fs.existsSync(keyInfoPath)) {
      poolInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
    }
    poolInfo.numOfWallets = wallets.length;
    wallets.forEach((w, index) => {
      poolInfo[`pubkey${index + 1}`] = w.publicKey.toString();
    });
    fs.writeFileSync(keyInfoPath, JSON.stringify(poolInfo, null, 2));
    console.log(`Updated keyInfo.json with ${wallets.length} wallets`);
    
    // Verify files exist
    const createdFiles = fs.readdirSync(keypairsDir).filter(f => f.startsWith('keypair') && f.endsWith('.json'));
    console.log(`Verification: Found ${createdFiles.length} wallet files in directory`);
    
    res.json({ 
      success: true, 
      message: `Created ${count} wallets`,
      wallets: wallets.map(w => ({ publicKey: w.publicKey.toString() }))
    });
  } catch (error: any) {
    console.error("[API] Error creating wallets:", error);
    console.error("[API] Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Failed to create wallets",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

app.get("/api/wallets/main", async (req, res) => {
  try {
    const conn = getConnection();
    
    // Helper function to get balance with timeout and retry
    const getBalanceWithRetry = async (publicKey: PublicKey, maxRetries = 2): Promise<number> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const balancePromise = conn.getBalance(publicKey);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('RPC timeout')), 10000)
          );
          
          const balance = await Promise.race([balancePromise, timeoutPromise]);
          return balance / LAMPORTS_PER_SOL;
        } catch (error: any) {
          if (attempt === maxRetries - 1) {
            console.error(`[API] Failed to get balance for ${publicKey.toString()} after ${maxRetries} attempts:`, error.message);
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      return 0;
    };
    
    const [walletBalance, payerBalance] = await Promise.all([
      getBalanceWithRetry(wallet.publicKey).catch(() => 0),
      getBalanceWithRetry(payer.publicKey).catch(() => 0)
    ]);
    
    res.json({
      wallet: {
        publicKey: wallet.publicKey.toString(),
        balance: walletBalance,
        role: "Dev Wallet (Token Creator)"
      },
      payer: {
        publicKey: payer.publicKey.toString(),
        balance: payerBalance,
        role: "Payer Wallet (Funding Source)"
      },
      isSame: wallet.publicKey.toString() === payer.publicKey.toString()
    });
  } catch (error: any) {
    console.error("[API] Error in /api/wallets/main:", error);
    res.status(500).json({ 
      error: error.message || "Failed to load main wallets",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

app.get("/api/wallets/balances", async (req, res) => {
  try {
    const keypairs = loadKeypairs();
    const balances: Record<string, number> = {};
    const errors: Record<string, string> = {};

    const conn = getConnection();
    
    // Helper function to get balance with timeout and retry
    const getBalanceWithRetry = async (publicKey: PublicKey, maxRetries = 2): Promise<number> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Add timeout wrapper
          const balancePromise = conn.getBalance(publicKey);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('RPC timeout')), 10000)
          );
          
          const balance = await Promise.race([balancePromise, timeoutPromise]);
          return balance / LAMPORTS_PER_SOL;
        } catch (error: any) {
          if (attempt === maxRetries - 1) {
            console.error(`[API] Failed to get balance for ${publicKey.toString()} after ${maxRetries} attempts:`, error.message);
            throw error;
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      return 0;
    };

    // Process keypairs with delay to avoid rate limiting
    for (let i = 0; i < keypairs.length; i++) {
      const kp = keypairs[i];
      const pubKey = kp.publicKey.toString();
      
      try {
        const balance = await getBalanceWithRetry(kp.publicKey);
        balances[pubKey] = balance;
        
        // Add small delay between requests to avoid rate limiting (except for last item)
        if (i < keypairs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error: any) {
        console.error(`[API] Error getting balance for ${pubKey}:`, error.message);
        balances[pubKey] = 0;
        errors[pubKey] = error.message || 'Unknown error';
      }
    }

    // Add dev and payer wallets
    try {
      const devBalance = await getBalanceWithRetry(wallet.publicKey);
      balances[wallet.publicKey.toString()] = devBalance;
    } catch (error: any) {
      console.error(`[API] Error getting dev wallet balance:`, error.message);
      balances[wallet.publicKey.toString()] = 0;
      errors[wallet.publicKey.toString()] = error.message || 'Unknown error';
    }

    try {
      const payerBalance = await getBalanceWithRetry(payer.publicKey);
      balances[payer.publicKey.toString()] = payerBalance;
    } catch (error: any) {
      console.error(`[API] Error getting payer wallet balance:`, error.message);
      balances[payer.publicKey.toString()] = 0;
      errors[payer.publicKey.toString()] = error.message || 'Unknown error';
    }

    res.json({ 
      balances,
      ...(Object.keys(errors).length > 0 && { errors, warning: 'Some balances could not be fetched' })
    });
  } catch (error: any) {
    console.error("[API] Error in /api/wallets/balances:", error);
    res.status(500).json({ 
      error: error.message || "Failed to load wallet balances",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Prices (best-effort): SOL price in fiat for buy-amount generation UI
app.get("/api/prices/sol", async (req, res) => {
  try {
    const vs = typeof req.query.vs === "string" ? req.query.vs : "eur";
    const allowed = new Set(["eur", "usd"]);
    const vsCurrency = allowed.has(vs.toLowerCase()) ? vs.toLowerCase() : "eur";

    const cacheKey = `solana:${vsCurrency}`;
    const cacheMaxAgeMs = Number(process.env.PRICE_CACHE_MAX_AGE_MS ?? "600000"); // 10 minutes

    try {
      const resp = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
        params: { ids: "solana", vs_currencies: vsCurrency },
        timeout: 10_000,
      });

      const price = resp?.data?.solana?.[vsCurrency];
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
        throw new Error("Invalid price payload");
      }

      priceCache[cacheKey] = { price, ts: Date.now() };
      return res.json({ success: true, solana: { [vsCurrency]: price }, cached: false });
    } catch (e: any) {
      const cached = priceCache[cacheKey];
      if (cached && Date.now() - cached.ts <= (Number.isFinite(cacheMaxAgeMs) ? cacheMaxAgeMs : 600000)) {
        return res.json({ success: true, solana: { [vsCurrency]: cached.price }, cached: true, warning: "Using cached price (upstream unavailable)" });
      }

      // Do not 500 the UI; return success=false so frontend doesn't throw AxiosError.
      return res.json({ success: false, solana: { [vsCurrency]: 0 }, cached: false, error: e?.message ?? "Failed to fetch SOL price" });
    }
  } catch (error: any) {
    // Final safety: never throw 500 for this endpoint.
    res.json({ success: false, solana: { eur: 0 }, cached: false, error: error?.message ?? "Failed to fetch SOL price" });
  }
});

// Generate per-wallet buy amounts (different numbers per wallet) and store into keyInfo.json
app.post("/api/wallets/buy-amounts/generate", async (req, res) => {
  try {
    const {
      currency = "eur", // eur | sol
      target,
      variance = 0,
      includeDev = false,
      walletPubkeys,
      solEur,
    } = req.body ?? {};

    const targetNum = Number(target);
    const varianceNum = Number(variance);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      return res.status(400).json({ error: "Invalid target. Must be a positive number." });
    }
    if (!Number.isFinite(varianceNum) || varianceNum < 0) {
      return res.status(400).json({ error: "Invalid variance. Must be >= 0." });
    }

    const currencyNorm = String(currency).toLowerCase();
    if (currencyNorm !== "eur" && currencyNorm !== "sol") {
      return res.status(400).json({ error: "Invalid currency. Use 'eur' or 'sol'." });
    }

    // Determine SOL/EUR rate if needed
    let eurPerSol: number | undefined = undefined;
    if (currencyNorm === "eur") {
      if (Number.isFinite(Number(solEur)) && Number(solEur) > 0) {
        eurPerSol = Number(solEur);
      } else {
        // best-effort fetch
        const resp = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
          params: { ids: "solana", vs_currencies: "eur" },
          timeout: 10_000,
        });
        const p = resp?.data?.solana?.eur;
        if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) {
          return res.status(502).json({ error: "Failed to fetch SOL/EUR price. Provide solEur manually." });
        }
        eurPerSol = p;
      }
    }

    const subWallets = loadKeypairs();
    const allCandidates = [
      ...(includeDev ? [wallet.publicKey.toString()] : []),
      ...subWallets.map((kp) => kp.publicKey.toString()),
    ];

    const selected = Array.isArray(walletPubkeys) && walletPubkeys.length
      ? allCandidates.filter((pk) => walletPubkeys.includes(pk))
      : allCandidates;

    if (selected.length === 0) {
      return res.status(400).json({ error: "No wallets selected for buy amount generation." });
    }

    const keyInfoPath = path.join(process.cwd(), "src", "keyInfo.json");
    let poolInfo: any = {};
    if (fs.existsSync(keyInfoPath)) {
      poolInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
    }

    const generated: Record<string, { solAmount: string; approxEur?: number }> = {};

    for (const pk of selected) {
      const delta = varianceNum === 0 ? 0 : (Math.random() * 2 - 1) * varianceNum;
      const amountInCurrency = Math.max(0.000001, targetNum + delta);
      const solAmount =
        currencyNorm === "sol"
          ? amountInCurrency
          : amountInCurrency / (eurPerSol as number);

      const solStr = solAmount.toFixed(6);
      poolInfo[pk] = {
        solAmount: solStr,
        tokenAmount: poolInfo[pk]?.tokenAmount ?? "0",
        percentSupply: poolInfo[pk]?.percentSupply ?? 0,
      };

      generated[pk] = {
        solAmount: solStr,
        approxEur: currencyNorm === "eur" ? amountInCurrency : eurPerSol ? solAmount * eurPerSol : undefined,
      };
    }

    fs.writeFileSync(keyInfoPath, JSON.stringify(poolInfo, null, 2));

    res.json({
      success: true,
      currency: currencyNorm,
      eurPerSol: eurPerSol ?? null,
      walletsCount: selected.length,
      generated,
    });
  } catch (error: any) {
    console.error("[API] buy-amounts/generate error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to generate buy amounts" });
  }
});

app.post("/api/wallets/fund", async (req, res) => {
  try {
    const { jitoTip = 0.01, amountPerWallet } = req.body || {};
    const currentNetwork = getNetworkMode();
    
    // Log network mode for debugging
    console.log(`[API] Funding request received. Network: ${currentNetwork}`);
    
    // Validate jitoTip
    if (isNaN(jitoTip) || jitoTip < 0) {
      return res.status(400).json({ 
        error: `Invalid jitoTip: ${jitoTip}. Must be a non-negative number.` 
      });
    }
    
    // Validate prerequisites before funding
    const keypairs = loadKeypairs();
    if (keypairs.length === 0) {
      return res.status(400).json({ 
        error: "No wallets found. Please create wallets first." 
      });
    }
    
    console.log(`[API] Found ${keypairs.length} wallet(s) to fund`);

    // Check if keyInfo.json exists and has solAmount data
    const keyInfoPath = path.join(process.cwd(), "src", "keyInfo.json");
    let poolInfo: any = {};
    if (fs.existsSync(keyInfoPath)) {
      poolInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
    }

    // Check if LUT exists
    if (!poolInfo.addressLUT) {
      return res.status(400).json({ 
        error: `Lookup Table (LUT) not found. Please create a LUT first in Settings. Network: ${currentNetwork}` 
      });
    }
    
    console.log(`[API] LUT verified: ${poolInfo.addressLUT}`);

    // Check if solAmount data exists OR if amountPerWallet is provided
    const hasSolAmountData = poolInfo[wallet.publicKey.toString()]?.solAmount;
    
    if (!hasSolAmountData && !amountPerWallet) {
      return res.status(400).json({ 
        error: `No buy amounts configured. Please either:\n1. Simulate buy amounts first (Advanced Setup > Simulate Buy Amounts), OR\n2. Provide 'amountPerWallet' parameter (e.g., 0.1 SOL per wallet)\n\nNetwork: ${currentNetwork}` 
      });
    }
    
    // If amountPerWallet is provided, use it to create/update solAmount data for all wallets
    if (amountPerWallet) {
      const amount = parseFloat(amountPerWallet);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ 
          error: "Invalid amountPerWallet. Must be a positive number." 
        });
      }

      console.log(`[API] Using amountPerWallet: ${amount} SOL to create/update solAmount entries`);

      // Create or update solAmount entries for all wallets
      poolInfo[wallet.publicKey.toString()] = {
        solAmount: amount.toString(),
        tokenAmount: poolInfo[wallet.publicKey.toString()]?.tokenAmount || "0",
        percentSupply: poolInfo[wallet.publicKey.toString()]?.percentSupply || 0
      };

      keypairs.forEach((kp) => {
        const pubkeyStr = kp.publicKey.toString();
        poolInfo[pubkeyStr] = {
          solAmount: amount.toString(),
          tokenAmount: poolInfo[pubkeyStr]?.tokenAmount || "0",
          percentSupply: poolInfo[pubkeyStr]?.percentSupply || 0
        };
      });

      // Save to keyInfo.json
      fs.writeFileSync(keyInfoPath, JSON.stringify(poolInfo, null, 2));
      console.log(`[API] Created/updated solAmount entries for ${keypairs.length + 1} wallets with ${amount} SOL each`);
    } else {
      console.log(`[API] Using existing solAmount configuration from keyInfo.json`);
    }

    // Check payer balance
    const conn = getConnection();
    const payerBalance = await conn.getBalance(payer.publicKey);
    const payerBalanceSOL = payerBalance / LAMPORTS_PER_SOL;
    
    // Calculate estimated needed amount
    let estimatedNeeded = 0;
    if (hasSolAmountData) {
      // Sum up all solAmount values from keyInfo.json
      let totalNeeded = 0;
      if (poolInfo[wallet.publicKey.toString()]?.solAmount) {
        totalNeeded += parseFloat(poolInfo[wallet.publicKey.toString()].solAmount) * 1.015 + 0.0025;
      }
      keypairs.forEach((kp) => {
        if (poolInfo[kp.publicKey.toString()]?.solAmount) {
          totalNeeded += parseFloat(poolInfo[kp.publicKey.toString()].solAmount) * 1.015 + 0.0025;
        }
      });
      estimatedNeeded = totalNeeded * 1.1; // +10% buffer
    } else {
      estimatedNeeded = parseFloat(amountPerWallet || "0") * (keypairs.length + 1) * 1.115; // (1.015 + 0.0025) * 1.1 buffer
    }
    
    const minRequired = Math.max(0.1, estimatedNeeded);
    
    if (payerBalance < minRequired * LAMPORTS_PER_SOL) {
      return res.status(400).json({ 
        error: `Insufficient balance in payer wallet (${payer.publicKey.toString()}).\nCurrent balance: ${payerBalanceSOL.toFixed(4)} SOL\nEstimated needed: ${minRequired.toFixed(4)} SOL (includes 1.5% buffer + fees + 10% safety margin)\nNetwork: ${currentNetwork}\n\nPlease fund the payer wallet first.` 
      });
    }
    
    console.log(`[API] Payer balance verified: ${payerBalanceSOL.toFixed(4)} SOL (needed: ${minRequired.toFixed(4)} SOL)`);

    // Execute funding in background
    const { fundWalletsWithParams } = await import("../src/apiWrappers");
    
    // Note: Funding runs in background, errors are logged but don't block the response
    fundWalletsWithParams(jitoTip).catch(err => {
      console.error(`[API] Funding error (network: ${currentNetwork}):`, err instanceof Error ? err.message : err);
    });
    
    console.log(`[API] Funding initiated for ${keypairs.length + 1} wallet(s) on ${currentNetwork}`);
    
    res.json({ 
      success: true, 
      message: `Funding wallets initiated with jitoTip: ${jitoTip} SOL${amountPerWallet ? ` (${amountPerWallet} SOL per wallet)` : ''} on ${currentNetwork}`,
      network: currentNetwork,
      walletsCount: keypairs.length + 1
    });
  } catch (error: any) {
    console.error(`[API] Funding endpoint error (network: ${getNetworkMode()}):`, error);
    res.status(500).json({ 
      error: error.message || "Failed to initiate wallet funding",
      network: getNetworkMode(),
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

app.post("/api/wallets/reclaim", async (req, res) => {
  try {
    const { jitoTip = 0 } = req.body || {};
    const currentNetwork = getNetworkMode();

    // Validate jitoTip
    if (isNaN(jitoTip) || jitoTip < 0) {
      return res.status(400).json({
        error: `Invalid jitoTip: ${jitoTip}. Must be a non-negative number.`,
      });
    }

    const keypairs = loadKeypairs();
    if (keypairs.length === 0) {
      return res.status(400).json({
        error: "No wallets found. Please create wallets first.",
      });
    }

    console.log(`[API] Reclaim request received. Network: ${currentNetwork}. Sub-wallets: ${keypairs.length}`);

    const { reclaimWalletsWithParams } = await import("../src/apiWrappers");

    // Run in background to avoid request timeouts
    reclaimWalletsWithParams(jitoTip).then((result) => {
      console.log(`[API] Reclaim completed:`, result);
    }).catch((err) => {
      console.error(`[API] Reclaim error (network: ${currentNetwork}):`, err instanceof Error ? err.message : err);
    });

    res.json({
      success: true,
      message: `Reclaim initiated${jitoTip ? ` (jitoTip=${jitoTip} SOL)` : ""} on ${currentNetwork}.`,
      network: currentNetwork,
      walletsCount: keypairs.length,
    });
  } catch (error: any) {
    console.error(`[API] Reclaim endpoint error (network: ${getNetworkMode()}):`, error);
    res.status(500).json({
      error: error.message || "Failed to initiate reclaim",
      network: getNetworkMode(),
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Launch - calls buyBundle
app.post("/api/launch", upload.single("image"), async (req, res) => {
  try {
    const { name, symbol, description, twitter, telegram, website, tiktok, youtube, jitoTip, dryRun } = req.body;
    const image = req.file;

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    if (!name || !symbol || !description) {
      return res.status(400).json({ error: "Name, symbol, and description are required" });
    }

    // Move image to img folder (clear old images first)
    const imgDir = path.join(process.cwd(), "img");
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }
    
    // Clear existing images
    const existingFiles = fs.readdirSync(imgDir);
    existingFiles.forEach(file => {
      fs.unlinkSync(path.join(imgDir, file));
    });
    
    const destPath = path.join(imgDir, image.originalname);
    fs.renameSync(image.path, destPath);

    // Preflight: on devnet, Pump.Fun program may not exist (most setups are mainnet-only)
    // Give a clear error instead of hanging on prompts / background failures.
    const conn = getConnection();
    try {
      const pumpProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
      const pumpProgramInfo = await conn.getAccountInfo(pumpProgramId, "confirmed");
      if (!pumpProgramInfo) {
        return res.status(400).json({
          error:
            `Pump.Fun program not found on ${getNetworkMode().toUpperCase()}.\n` +
            `This launch flow is typically MAINNET-only.\n\n` +
            `Switch to MAINNET in Settings, or configure a devnet-compatible Pump program.`,
          network: getNetworkMode(),
        });
      }
    } catch (e) {
      // If RPC fails for any reason, we still proceed to normal error handling below.
      console.warn("[API] Launch preflight warning:", e);
    }

    // Call buyBundleWithParams with provided token info (run synchronously to return real errors)
    const { buyBundleWithParams } = await import("../src/apiWrappers");
    
    const result = await buyBundleWithParams({
      name,
      symbol,
      description,
      twitter: twitter || "",
      telegram: telegram || "",
      website: website || "",
      tiktok: tiktok || "",
      youtube: youtube || "",
      jitoTip: parseFloat(jitoTip || "0.05"),
      imagePath: imgDir,
      dryRun: dryRun === true || dryRun === "true" || dryRun === "1",
    });
    
    res.json({
      success: true,
      message: "Token launch completed",
      result,
      data: {
        name,
        symbol,
        description,
        twitter,
        telegram,
        website,
        tiktok,
        youtube,
        jitoTip: parseFloat(jitoTip || "0.05"),
      },
    });
  } catch (error: any) {
    console.error("[API] Launch error:", error);
    res.status(500).json({
      error: error.message || "Launch failed",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Sell endpoints
app.post("/api/sell/pumpfun", async (req, res) => {
  try {
    const {
      percentage = 50,
      jitoTip = 0.01,
      dryRun,
      mint,
      mode,
      wallet,
      wallets,
      walletPercentages,
      autoFundWallets,
    } = req.body;
    const { sellPumpFunWithParams } = await import("../src/apiWrappers");
    
    // Execute sell with parameters
    const result = await sellPumpFunWithParams(percentage, jitoTip, {
      dryRun:
        dryRun === true ||
        dryRun === 1 ||
        dryRun === "true" ||
        dryRun === "1",
      mint: typeof mint === "string" && mint.trim().length ? mint.trim() : undefined,
      mode:
        mode === "quick" || mode === "consolidated" || mode === "per-wallet"
          ? mode
          : undefined,
      wallet: typeof wallet === "string" && wallet.trim().length ? wallet.trim() : undefined,
      wallets: Array.isArray(wallets) ? wallets.filter((w) => typeof w === "string") : undefined,
      walletPercentages:
        walletPercentages && typeof walletPercentages === "object"
          ? walletPercentages
          : undefined,
      autoFundWallets:
        autoFundWallets === true ||
        autoFundWallets === 1 ||
        autoFundWallets === "true" ||
        autoFundWallets === "1",
    });
    
    res.json({
      success: true,
      message: "PumpFun sell completed",
      result,
    });
  } catch (error: any) {
    console.error("[API] PumpFun sell error:", error);
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

    res.status(500).json({
      error: msg || "Sell failed",
      details: process.env.NODE_ENV === "development" ? (error?.stack ?? undefined) : undefined,
    });
  }
});

// List owned SPL tokens for dev wallet (and payer) to help UI pick which mint to sell
app.get("/api/tokens/owned", async (req, res) => {
  try {
    const conn = getConnection();
    const { TOKEN_PROGRAM_ID } = await import("@solana/spl-token");

    const owners = [
      { name: "wallet", pubkey: wallet.publicKey },
      { name: "payer", pubkey: payer.publicKey },
    ];

    const results = await Promise.all(
      owners.map(async (o) => {
        const resp = await conn.getParsedTokenAccountsByOwner(o.pubkey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokens = resp.value
          .map((acc) => {
            const info: any = acc.account.data?.parsed?.info;
            const mint = info?.mint as string | undefined;
            const amount = info?.tokenAmount?.amount as string | undefined;
            const decimals = info?.tokenAmount?.decimals as number | undefined;
            const uiAmount = info?.tokenAmount?.uiAmount as number | null | undefined;
            return { mint, amount, decimals, uiAmount };
          })
          .filter((t) => !!t.mint && !!t.amount && t.amount !== "0");

        return { owner: o.name, ownerPubkey: o.pubkey.toString(), tokens };
      })
    );

    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error("[API] tokens/owned error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list owned tokens" });
  }
});

// Token balance for a specific mint across dev + sub-wallets (for nicer sell UI)
app.get("/api/tokens/balances", async (req, res) => {
  try {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : "";
    if (!mint) return res.status(400).json({ error: "mint query param is required" });

    const conn = getConnection();
    const mintPk = new PublicKey(mint);

    const subWallets = loadKeypairs();
    const owners: { label: string; pubkey: PublicKey }[] = [
      { label: "dev", pubkey: wallet.publicKey },
      ...subWallets.map((kp) => ({ label: "bundler", pubkey: kp.publicKey })),
    ];

    const { TOKEN_PROGRAM_ID } = await import("@solana/spl-token");

    const balances = await Promise.all(
      owners.map(async (o) => {
        try {
          // Filter by mint so we don't fetch everything.
          const resp = await conn.getParsedTokenAccountsByOwner(
            o.pubkey,
            { mint: mintPk },
            "confirmed"
          );

          const first = resp.value?.[0];
          const info: any = first?.account?.data?.parsed?.info;
          const tokenAmount = info?.tokenAmount;
          const amount = tokenAmount?.amount as string | undefined;
          const decimals = tokenAmount?.decimals as number | undefined;
          const uiAmount = tokenAmount?.uiAmount as number | null | undefined;

          return {
            owner: o.label,
            ownerPubkey: o.pubkey.toString(),
            mint: mintPk.toString(),
            amount: amount ?? "0",
            decimals: decimals ?? 0,
            uiAmount: uiAmount ?? 0,
          };
        } catch (e: any) {
          return {
            owner: o.label,
            ownerPubkey: o.pubkey.toString(),
            mint: mintPk.toString(),
            amount: "0",
            decimals: 0,
            uiAmount: 0,
            error: e?.message ?? String(e),
          };
        }
      })
    );

    res.json({ success: true, mint: mintPk.toString(), balances });
  } catch (error: any) {
    console.error("[API] tokens/balances error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to fetch mint balances" });
  }
});

app.post("/api/sell/raydium", async (req, res) => {
  try {
    const { percentage = 50, marketId, jitoTip = 0.01 } = req.body;
    
    if (!marketId) {
      return res.status(400).json({ error: "Market ID is required" });
    }
    
    const { sellRaydiumWithParams } = await import("../src/apiWrappers");
    
    // Execute sell with parameters
    const result = await sellRaydiumWithParams(percentage, marketId, jitoTip);
    
    res.json({
      success: true,
      message: "Raydium sell completed",
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// LUT endpoints
app.post("/api/lut/create", async (req, res) => {
  try {
    const { jitoTip = 0.01 } = req.body;
    const { createLUTWithParams } = await import("../src/apiWrappers");
    
    // Execute LUT creation in background
    createLUTWithParams(jitoTip).catch(err => {
      console.error("LUT creation error:", err);
    });
    
    res.json({
      success: true,
      message: `LUT creation initiated with jitoTip: ${jitoTip} SOL`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/lut/extend", async (req, res) => {
  try {
    const { jitoTip = 0.01 } = req.body;
    const { extendLUTWithParams } = await import("../src/apiWrappers");
    
    // Execute LUT extension in background
    extendLUTWithParams(jitoTip).catch(err => {
      console.error("LUT extension error:", err);
    });
    
    res.json({
      success: true,
      message: `LUT extension initiated with jitoTip: ${jitoTip} SOL`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Network endpoint
app.get("/api/network", async (req, res) => {
  try {
    // Always read from .env file to get current network
    const currentNetwork = getNetworkMode();
    const currentRpc = getRpcUrl();
    res.json({
      network: currentNetwork,
      rpcUrl: currentRpc,
      isDevnet: currentNetwork === "devnet",
      isMainnet: currentNetwork === "mainnet",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/network", async (req, res) => {
  try {
    const { network } = req.body;
    
    if (!network || !["mainnet", "devnet"].includes(network)) {
      return res.status(400).json({ error: "Invalid network. Must be 'mainnet' or 'devnet'" });
    }
    
    // Update .env file
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }
    
    // Update or add NETWORK_MODE - handle both with and without quotes, and handle trailing whitespace
    if (envContent.includes("NETWORK_MODE=")) {
      envContent = envContent.replace(/NETWORK_MODE\s*=\s*["']?[^"'\n\r]+["']?/i, `NETWORK_MODE=${network}`);
    } else {
      envContent = `NETWORK_MODE=${network}\n${envContent}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    // Reload dotenv to update process.env
    dotenv.config({ override: true });
    
    // Invalidate connection cache so new connection uses new RPC URL
    invalidateConnectionCache();
    
    // Get updated network and RPC to return in response
    const updatedNetwork = getNetworkMode();
    const updatedRpc = getRpcUrl();
    
    res.json({
      success: true,
      message: `Network changed to ${network}. Changes will take effect immediately.`,
      network: updatedNetwork,
      rpcUrl: updatedRpc,
      requiresRestart: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Main Wallet Management
app.post("/api/wallets/main/create", async (req, res) => {
  try {
    const result = generateNewMainWallet();
    res.json({
      success: true,
      message: "New main wallet created successfully",
      publicKey: result.publicKey,
      warning: "⚠️ Server restart required for changes to take effect!"
    });
  } catch (error: any) {
    console.error("[API] Error creating new main wallet:", error);
    res.status(500).json({ 
      error: error.message || "Failed to create new main wallet",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Config
app.get("/api/config", async (req, res) => {
  try {
    // Always read from .env file to get current values
    const currentNetwork = getNetworkMode();
    const currentRpc = getRpcUrl();
    res.json({
      rpcUrl: currentRpc,
      jitoUrl: process.env.BLOCKENGINEURL || "",
      network: currentNetwork,
      isDevnet: currentNetwork === "devnet",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/config", async (req, res) => {
  try {
    const { rpcUrl, jitoUrl } = req.body;
    
    // Update .env file or config
    // For now, we'll just return success
    // In production, you'd want to update .env file or a config file
    if (rpcUrl) {
      process.env.HELIUS_RPC_URL = rpcUrl;
    }
    if (jitoUrl) {
      process.env.BLOCKENGINEURL = jitoUrl;
    }
    
    res.json({
      success: true,
      message: "Configuration updated (runtime only - restart required for persistence)",
      config: {
        rpcUrl: process.env.HELIUS_RPC_URL || "",
        jitoUrl: process.env.BLOCKENGINEURL || "",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📡 Network: ${networkMode.toUpperCase()}`);
  console.log(`🔗 RPC: ${rpc.substring(0, 50)}...`);
}).on('error', (error: any) => {
  console.error('❌ Failed to start API server:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the process using this port.`);
  }
  process.exit(1);
});

