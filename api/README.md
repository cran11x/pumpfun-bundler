# API Server

Express.js API server that wraps the existing bundler functionality.

## Running

```bash
# From root directory
npm run api

# Or directly
ts-node api/server.ts
```

Server runs on http://localhost:3001

## Endpoints

- `GET /api/health` - System health check
- `GET /api/validate` - Pre-launch validation
- `GET /api/wallets` - List wallets
- `POST /api/wallets/create` - Create wallets
- `GET /api/wallets/balances` - Get balances
- `POST /api/launch` - Launch token
- `POST /api/sell/pumpfun` - Sell on PumpFun
- `POST /api/sell/raydium` - Sell on Raydium
- `GET /api/config` - Get configuration
- `PUT /api/config` - Update configuration

