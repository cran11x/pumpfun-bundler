# Pump.Fun Bundler - Web UI Setup

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Root dependencies (already installed)
npm install

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Configure Environment

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 3. Start the Application

**Option 1: Run both API and Frontend together**
```bash
npm run dev
```

**Option 2: Run separately**

Terminal 1 (API):
```bash
npm run api
```

Terminal 2 (Frontend):
```bash
npm run dev:frontend
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

## 📁 Project Structure

```
pumpfun-bundler/
├── frontend/          # Next.js web application
│   ├── app/           # Pages and routes
│   ├── components/    # React components
│   └── lib/           # Utilities and API client
├── api/               # Express API server
│   └── server.ts      # API endpoints
└── src/               # Existing bundler code
```

## 🎨 Features

- ✅ Dark cyber theme
- ✅ Real-time dashboard
- ✅ Wallet management
- ✅ Token launch interface
- ✅ Sell tokens (PumpFun & Raydium)
- ✅ Settings and configuration
- ✅ Health monitoring

## 🔧 Development

### Frontend Development
```bash
cd frontend
npm run dev
```

### API Development
```bash
npm run api
```

### Build for Production
```bash
cd frontend
npm run build
npm start
```

## 📝 Notes

- Make sure your `.env` file in root has all required variables (RPC URL, etc.)
- The API server wraps existing bundler functionality
- All existing CLI functionality is preserved

## 🐛 Troubleshooting

**Frontend can't connect to API:**
- Check that API server is running on port 3001
- Verify `NEXT_PUBLIC_API_URL` in `frontend/.env.local`

**API errors:**
- Ensure `.env` file exists in root with proper configuration
- Check that all dependencies are installed

