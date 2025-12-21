import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import * as dotenv from "dotenv";
import { healthCheck } from "../src/utils/healthCheck";
import { validatePreLaunch } from "../src/utils/validations";
import { loadKeypairs } from "../src/createKeys";
import { connection, wallet, payer, networkMode, rpc } from "../config";
import { LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import * as fs from "fs";

dotenv.config();

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
    res.json({ wallets });
  } catch (error: any) {
    console.error("[API] Error loading wallets:", error);
    console.error("[API] Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Failed to load wallets",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
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
    
    // Clear existing wallets first
    if (fs.existsSync(keypairsDir)) {
      const existingFiles = fs.readdirSync(keypairsDir);
      existingFiles.forEach(file => {
        if (file.startsWith('keypair') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(keypairsDir, file));
        }
      });
      console.log(`Cleared ${existingFiles.length} existing wallet files`);
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
    console.error("Error creating wallets:", error);
    res.status(500).json({ error: error.message || "Failed to create wallets" });
  }
});

app.get("/api/wallets/main", async (req, res) => {
  try {
    const walletBalance = await connection.getBalance(wallet.publicKey);
    const payerBalance = await connection.getBalance(payer.publicKey);
    
    res.json({
      wallet: {
        publicKey: wallet.publicKey.toString(),
        balance: walletBalance / LAMPORTS_PER_SOL,
        role: "Dev Wallet (Token Creator)"
      },
      payer: {
        publicKey: payer.publicKey.toString(),
        balance: payerBalance / LAMPORTS_PER_SOL,
        role: "Payer Wallet (Funding Source)"
      },
      isSame: wallet.publicKey.toString() === payer.publicKey.toString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/wallets/balances", async (req, res) => {
  try {
    const keypairs = loadKeypairs();
    const balances: Record<string, number> = {};

    for (const kp of keypairs) {
      try {
        const balance = await connection.getBalance(kp.publicKey);
        balances[kp.publicKey.toString()] = balance / LAMPORTS_PER_SOL;
      } catch (error) {
        balances[kp.publicKey.toString()] = 0;
      }
    }

    // Add dev and payer wallets
    try {
      const devBalance = await connection.getBalance(wallet.publicKey);
      balances[wallet.publicKey.toString()] = devBalance / LAMPORTS_PER_SOL;
    } catch (error) {
      balances[wallet.publicKey.toString()] = 0;
    }

    try {
      const payerBalance = await connection.getBalance(payer.publicKey);
      balances[payer.publicKey.toString()] = payerBalance / LAMPORTS_PER_SOL;
    } catch (error) {
      balances[payer.publicKey.toString()] = 0;
    }

    res.json({ balances });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/wallets/fund", async (req, res) => {
  try {
    const { jitoTip = 0.01, amountPerWallet } = req.body || {};
    
    // Log network mode for debugging
    console.log(`[API] Funding request received. Network: ${networkMode}`);
    
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
        error: `Lookup Table (LUT) not found. Please create a LUT first in Settings. Network: ${networkMode}` 
      });
    }
    
    console.log(`[API] LUT verified: ${poolInfo.addressLUT}`);

    // Check if solAmount data exists OR if amountPerWallet is provided
    const hasSolAmountData = poolInfo[wallet.publicKey.toString()]?.solAmount;
    
    if (!hasSolAmountData && !amountPerWallet) {
      return res.status(400).json({ 
        error: `No buy amounts configured. Please either:\n1. Simulate buy amounts first (Advanced Setup > Simulate Buy Amounts), OR\n2. Provide 'amountPerWallet' parameter (e.g., 0.1 SOL per wallet)\n\nNetwork: ${networkMode}` 
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
    const payerBalance = await connection.getBalance(payer.publicKey);
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
        error: `Insufficient balance in payer wallet (${payer.publicKey.toString()}).\nCurrent balance: ${payerBalanceSOL.toFixed(4)} SOL\nEstimated needed: ${minRequired.toFixed(4)} SOL (includes 1.5% buffer + fees + 10% safety margin)\nNetwork: ${networkMode}\n\nPlease fund the payer wallet first.` 
      });
    }
    
    console.log(`[API] Payer balance verified: ${payerBalanceSOL.toFixed(4)} SOL (needed: ${minRequired.toFixed(4)} SOL)`);

    // Execute funding in background
    const { fundWalletsWithParams } = await import("../src/apiWrappers");
    
    // Note: Funding runs in background, errors are logged but don't block the response
    fundWalletsWithParams(jitoTip).catch(err => {
      console.error(`[API] Funding error (network: ${networkMode}):`, err instanceof Error ? err.message : err);
    });
    
    console.log(`[API] Funding initiated for ${keypairs.length + 1} wallet(s) on ${networkMode}`);
    
    res.json({ 
      success: true, 
      message: `Funding wallets initiated with jitoTip: ${jitoTip} SOL${amountPerWallet ? ` (${amountPerWallet} SOL per wallet)` : ''} on ${networkMode}`,
      network: networkMode,
      walletsCount: keypairs.length + 1
    });
  } catch (error: any) {
    console.error(`[API] Funding endpoint error (network: ${networkMode}):`, error);
    res.status(500).json({ 
      error: error.message || "Failed to initiate wallet funding",
      network: networkMode,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Launch - calls buyBundle
app.post("/api/launch", upload.single("image"), async (req, res) => {
  try {
    const { name, symbol, description, twitter, telegram, website, jitoTip } = req.body;
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

    // Call buyBundleWithParams with provided token info
    const { buyBundleWithParams } = await import("../src/apiWrappers");
    
    // Execute launch in background
    buyBundleWithParams({
      name,
      symbol,
      description,
      twitter: twitter || "",
      telegram: telegram || "",
      website: website || "",
      jitoTip: parseFloat(jitoTip || "0.05"),
      imagePath: imgDir,
    }).catch(err => {
      console.error("Launch error:", err);
    });
    
    res.json({
      success: true,
      message: "Token launch initiated",
      data: {
        name,
        symbol,
        description,
        twitter,
        telegram,
        website,
        jitoTip: parseFloat(jitoTip || "0.05"),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sell endpoints
app.post("/api/sell/pumpfun", async (req, res) => {
  try {
    const { percentage = 50, jitoTip = 0.01 } = req.body;
    const { sellPumpFunWithParams } = await import("../src/apiWrappers");
    
    // Execute sell with parameters
    const result = await sellPumpFunWithParams(percentage, jitoTip);
    
    res.json({
      success: true,
      message: "PumpFun sell completed",
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.json({
      network: networkMode,
      rpcUrl: rpc,
      isDevnet: networkMode === "devnet",
      isMainnet: networkMode === "mainnet",
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
    
    // Update or add NETWORK_MODE
    if (envContent.includes("NETWORK_MODE=")) {
      envContent = envContent.replace(/NETWORK_MODE=\w+/, `NETWORK_MODE=${network}`);
    } else {
      envContent = `NETWORK_MODE=${network}\n${envContent}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    res.json({
      success: true,
      message: `Network changed to ${network}. Restart required for changes to take effect.`,
      network,
      requiresRestart: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Config
app.get("/api/config", async (req, res) => {
  try {
    // Read from .env or config file
    res.json({
      rpcUrl: rpc,
      jitoUrl: process.env.BLOCKENGINEURL || "",
      network: networkMode,
      isDevnet: networkMode === "devnet",
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

