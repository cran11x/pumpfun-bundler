import request from 'supertest';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import * as dotenv from 'dotenv';
import { healthCheck } from '../../src/utils/healthCheck';
import { validatePreLaunch } from '../../src/utils/validations';
import { loadKeypairs } from '../../src/createKeys';
import { connection, wallet, payer, networkMode } from '../../config';
import { LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import * as fs from 'fs';

dotenv.config();

// Create test app (same as server.ts but exportable)
export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const upload = multer({ dest: 'uploads/' });

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      const health = await healthCheck();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Validation
  app.get('/api/validate', async (req, res) => {
    try {
      const result = await validatePreLaunch();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Wallets
  app.get('/api/wallets', async (req, res) => {
    try {
      const keypairs = loadKeypairs();
      const wallets = keypairs.map((kp) => ({
        publicKey: kp.publicKey.toString(),
      }));
      res.json({ wallets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/wallets/create', async (req, res) => {
    try {
      const { count = 12 } = req.body;
      const projectRoot = process.cwd();
      const keypairsDir = path.join(projectRoot, 'src', 'keypairs');
      const keyInfoPath = path.join(projectRoot, 'src', 'keyInfo.json');
      
      if (!fs.existsSync(keypairsDir)) {
        fs.mkdirSync(keypairsDir, { recursive: true });
      }
      
      // Clear existing wallets first
      if (fs.existsSync(keypairsDir)) {
        const existingFiles = fs.readdirSync(keypairsDir);
        existingFiles.forEach(file => {
          if (file.startsWith('keypair') && file.endsWith('.json')) {
            fs.unlinkSync(path.join(keypairsDir, file));
          }
        });
      }
      
      // Generate wallets
      const wallets: Keypair[] = [];
      for (let i = 0; i < count; i++) {
        const newWallet = Keypair.generate();
        wallets.push(newWallet);
        const keypairPath = path.join(keypairsDir, `keypair${i + 1}.json`);
        fs.writeFileSync(keypairPath, JSON.stringify(Array.from(newWallet.secretKey)));
      }
      
      // Update keyInfo.json
      let poolInfo: any = {};
      if (fs.existsSync(keyInfoPath)) {
        poolInfo = JSON.parse(fs.readFileSync(keyInfoPath, 'utf-8'));
      }
      poolInfo.numOfWallets = wallets.length;
      wallets.forEach((w, index) => {
        poolInfo[`pubkey${index + 1}`] = w.publicKey.toString();
      });
      fs.writeFileSync(keyInfoPath, JSON.stringify(poolInfo, null, 2));
      
      res.json({ 
        success: true, 
        message: `Created ${count} wallets`,
        wallets: wallets.map(w => ({ publicKey: w.publicKey.toString() }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create wallets' });
    }
  });

  app.get('/api/wallets/balances', async (req, res) => {
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

  app.post('/api/wallets/fund', async (req, res) => {
    try {
      const { jitoTip = 0.01, amountPerWallet } = req.body || {};
      
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

      // Check if keyInfo.json exists and has solAmount data
      const keyInfoPath = path.join(process.cwd(), "src", "keyInfo.json");
      let poolInfo: any = {};
      if (fs.existsSync(keyInfoPath)) {
        poolInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
      }

      // Check if LUT exists
      if (!poolInfo.addressLUT) {
        return res.status(400).json({ 
          error: "Lookup Table (LUT) not found. Please create a LUT first in Settings." 
        });
      }

      // Check if solAmount data exists OR if amountPerWallet is provided
      const hasSolAmountData = poolInfo[wallet.publicKey.toString()]?.solAmount;
      
      if (!hasSolAmountData && !amountPerWallet) {
        return res.status(400).json({ 
          error: "No buy amounts configured. Please either:\n1. Simulate buy amounts first (Advanced Setup > Simulate Buy Amounts), OR\n2. Provide 'amountPerWallet' parameter (e.g., 0.1 SOL per wallet)" 
        });
      }

      // If amountPerWallet is provided, validate it
      if (amountPerWallet !== undefined) {
        const amount = parseFloat(amountPerWallet);
        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({ 
            error: "Invalid amountPerWallet. Must be a positive number." 
          });
        }
      }
      
      // Execute asynchronously and handle errors without blocking response
      (async () => {
        try {
          const { fundWalletsWithParams } = await import('../../src/apiWrappers');
          await fundWalletsWithParams(jitoTip);
        } catch (err) {
          console.error('Funding error:', err);
        }
      })();
      
      res.json({ 
        success: true, 
        message: `Funding wallets initiated with jitoTip: ${jitoTip} SOL${amountPerWallet ? ` (${amountPerWallet} SOL per wallet)` : ''}`,
        network: networkMode
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/launch', upload.single('image'), async (req, res) => {
    try {
      const { name, symbol, description, twitter, telegram, website, jitoTip } = req.body;
      const image = req.file;

      if (!image) {
        return res.status(400).json({ error: 'Image is required' });
      }

      if (!name || !symbol || !description) {
        return res.status(400).json({ error: 'Name, symbol, and description are required' });
      }

      const imgDir = path.join(process.cwd(), 'img');
      if (!fs.existsSync(imgDir)) {
        fs.mkdirSync(imgDir, { recursive: true });
      }
      
      const existingFiles = fs.readdirSync(imgDir);
      existingFiles.forEach(file => {
        fs.unlinkSync(path.join(imgDir, file));
      });
      
      const destPath = path.join(imgDir, image.originalname);
      fs.renameSync(image.path, destPath);

      // Execute asynchronously and handle errors without blocking response
      (async () => {
        try {
          const { buyBundleWithParams } = await import('../../src/apiWrappers');
          await buyBundleWithParams({
            name,
            symbol,
            description,
            twitter: twitter || '',
            telegram: telegram || '',
            website: website || '',
            jitoTip: parseFloat(jitoTip || '0.05'),
            imagePath: imgDir,
          });
        } catch (err) {
          console.error('Launch error:', err);
        }
      })();
      
      res.json({
        success: true,
        message: 'Token launch initiated',
        data: {
          name,
          symbol,
          description,
          twitter,
          telegram,
          website,
          jitoTip: parseFloat(jitoTip || '0.05'),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/sell/pumpfun', async (req, res) => {
    try {
      const { percentage = 50, jitoTip = 0.01 } = req.body;
      const { sellPumpFunWithParams } = await import('../../src/apiWrappers');
      
      const result = await sellPumpFunWithParams(percentage, jitoTip);
      
      res.json({
        success: true,
        message: 'PumpFun sell completed',
        result,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/sell/raydium', async (req, res) => {
    try {
      const { percentage = 50, marketId, jitoTip = 0.01 } = req.body;
      
      if (!marketId) {
        return res.status(400).json({ error: 'Market ID is required' });
      }
      
      const { sellRaydiumWithParams } = await import('../../src/apiWrappers');
      
      const result = await sellRaydiumWithParams(percentage, marketId, jitoTip);
      
      res.json({
        success: true,
        message: 'Raydium sell completed',
        result,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/lut/create', async (req, res) => {
    try {
      const { jitoTip = 0.01 } = req.body;
      const { createLUTWithParams } = await import('../../src/apiWrappers');
      
      createLUTWithParams(jitoTip).catch(err => {
        console.error('LUT creation error:', err);
      });
      
      res.json({
        success: true,
        message: `LUT creation initiated with jitoTip: ${jitoTip} SOL`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/lut/extend', async (req, res) => {
    try {
      const { jitoTip = 0.01 } = req.body;
      const { extendLUTWithParams } = await import('../../src/apiWrappers');
      
      extendLUTWithParams(jitoTip).catch(err => {
        console.error('LUT extension error:', err);
      });
      
      res.json({
        success: true,
        message: `LUT extension initiated with jitoTip: ${jitoTip} SOL`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/config', async (req, res) => {
    try {
      res.json({
        rpcUrl: process.env.HELIUS_RPC_URL || '',
        jitoUrl: process.env.BLOCKENGINEURL || '',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const { rpcUrl, jitoUrl } = req.body;
      
      if (rpcUrl) {
        process.env.HELIUS_RPC_URL = rpcUrl;
      }
      if (jitoUrl) {
        process.env.BLOCKENGINEURL = jitoUrl;
      }
      
      res.json({
        success: true,
        message: 'Configuration updated (runtime only - restart required for persistence)',
        config: {
          rpcUrl: process.env.HELIUS_RPC_URL || '',
          jitoUrl: process.env.BLOCKENGINEURL || '',
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
