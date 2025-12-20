# ✅ Test Checklist - PumpFun Bundler

## 🧪 Automatski testovi (već postoji)

Pokrenite sve testove:
```bash
npm test
```

Ovo testira:
- ✅ Health check API (`/api/health`)
- ✅ Config API (`/api/config`)
- ✅ Launch API (`/api/launch`)
- ✅ Sell API (`/api/sell`)
- ✅ LUT API (`/api/lut`)
- ✅ Wallets API (`/api/wallets`)

**Status:** Svi testovi prolaze (26/26) ✅

---

## 🌐 Web UI Testiranje

### 1. Proverite da li se serveri pokreću
```bash
npm run dev
```

Očekivano:
- Frontend: `http://localhost:3000` (Next.js)
- API: `http://localhost:3001` (Express)

### 2. Testirajte osnovne UI stranice

**Homepage** (`http://localhost:3000`)
- [ ] Stranica se učitava bez grešaka
- [ ] Nema error poruka u konzoli pregledača
- [ ] Navigacija radi

**Launch Page** (`http://localhost:3000/launch`)
- [ ] Forma za launch se prikazuje
- [ ] Možete uneti: name, symbol, description
- [ ] Možete upload-ovati sliku
- [ ] Submit dugme radi (ne mora da izvrši pravi launch)

**Wallets Page** (`http://localhost:3000/wallets`)
- [ ] Lista wallet-a se prikazuje (može biti prazna)
- [ ] Create wallets dugme radi
- [ ] Balances se prikazuju

**Sell Page** (`http://localhost:3000/sell`)
- [ ] Forma za sell se prikazuje
- [ ] Možete izabrati percentage
- [ ] Submit dugme radi

**Settings Page** (`http://localhost:3000/settings`)
- [ ] Forma za config se prikazuje
- [ ] Možete uneti RPC URL i Jito URL
- [ ] Save dugme radi

---

## 🔌 API Endpoint Testiranje (ručno)

### Health Check
```bash
curl http://localhost:3001/api/health
```
**Očekivano:** JSON sa `rpc`, `jito`, `network`, `slot`, `errors`

### Get Wallets
```bash
curl http://localhost:3001/api/wallets
```
**Očekivano:** JSON sa listom `wallets` (može biti prazan array)

### Get Config
```bash
curl http://localhost:3001/api/config
```
**Očekivano:** JSON sa `rpcUrl` i `jitoUrl`

---

## 💻 CLI Program Testiranje

### Pokretanje glavnog programa
```bash
npm start
```

**Testirajte:**
- [ ] Glavni meni se prikazuje
- [ ] Možete navigirati kroz opcije (strelice)
- [ ] Sve opcije su vidljive:
  - 🚀 Launch New Token
  - 💰 Wallet Management
  - 🔧 Advanced Setup
  - 📉 Sell Tokens
  - 🧪 Test & Validation Tools
  - ❌ Exit

**NAPOMENA:** Ne morate da izvršite prave transakcije - samo proverite da meni radi!

---

## 📋 Minimalni Test Scenario (bez blockchain transakcija)

### 1. Pokrenite testove
```bash
npm test
```
**Rezultat:** ✅ 26/26 testova prolazi

### 2. Pokrenite UI
```bash
npm run dev
```
**Proverite:**
- Frontend se otvara na `http://localhost:3000`
- API odgovara na `http://localhost:3001/api/health`

### 3. Testirajte osnovne UI stranice
- Otvorite sve stranice u pregledaču
- Proverite da nema JavaScript grešaka (F12 → Console)

### 4. Testirajte CLI meni
```bash
npm start
```
- Navigirajte kroz meni
- Proverite da sve opcije postoje

---

## ⚠️ Šta NE morate testirati (za sada)

- ❌ Prave blockchain transakcije (zahteva SOL na wallet-ima)
- ❌ Stvarni token launch (troši novac)
- ❌ Pravo slanje bundle-a na Jito (troši novac)
- ❌ Stvarni sell tokena (zahteva token koji posedujete)

---

## ✅ Šta je VEĆ testirano i radi

- ✅ Svi unit testovi (26/26)
- ✅ Config file loading
- ✅ Keypair handling (sa fallback-om za testove)
- ✅ Error handling u API rutama
- ✅ TypeScript kompilacija

---

## 🎯 Brza provera (5 minuta)

1. **Testovi:**
   ```bash
   npm test
   ```
   ✅ Treba: "Test Suites: 6 passed, Tests: 26 passed"

2. **UI:**
   ```bash
   npm run dev
   ```
   ✅ Otvori `http://localhost:3000` u browseru

3. **CLI:**
   ```bash
   npm start
   ```
   ✅ Vidi glavni meni, pritisni `Ctrl+C` da izađeš

Ako sve ovo radi - **APLIKACIJA RADI!** ✅

