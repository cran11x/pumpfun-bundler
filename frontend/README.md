# Pump.Fun Bundler - Web UI

Modern web interface for the Pump.Fun Bundler with dark cyber theme.

## Features

- 🎨 Dark cyber theme with neon accents
- 📊 Real-time dashboard with system status
- 💰 Wallet management
- 🚀 Token launch interface
- 📉 Sell tokens (PumpFun & Raydium)
- ⚙️ Settings and configuration

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your API URL
```

### Development

```bash
# Run frontend only
npm run dev

# Or run from root directory (with API)
npm run dev:frontend
```

The app will be available at [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
npm start
```

## API Connection

Make sure the API server is running on port 3001 (or update NEXT_PUBLIC_API_URL in .env.local).

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Zustand (state management)
- Axios (API client)
