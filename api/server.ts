import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import * as dotenv from "dotenv";
import { healthCheck } from "../src/utils/healthCheck";
import { validatePreLaunch } from "../src/utils/validations";
import { loadKeypairs } from "../src/createKeys";
import { connection, wallet, payer } from "../config";
import { LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import * as fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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
    console.log(`Returning ${wallets.length} wallets`);
    res.json({ wallets });
  } catch (error: any) {
    console.error("Error loading wallets:", error);
    res.status(500).json({ error: error.message });
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
    const { jitoTip = 0.01 } = req.body;
    const { fundWalletsWithParams } = await import("../src/apiWrappers");
    
    // Execute funding in background
    fundWalletsWithParams(jitoTip).catch(err => {
      console.error("Funding error:", err);
    });
    
    res.json({ 
      success: true, 
      message: `Funding wallets initiated with jitoTip: ${jitoTip} SOL` 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

// Config
app.get("/api/config", async (req, res) => {
  try {
    // Read from .env or config file
    res.json({
      rpcUrl: process.env.HELIUS_RPC_URL || "",
      jitoUrl: process.env.BLOCKENGINEURL || "",
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
});

