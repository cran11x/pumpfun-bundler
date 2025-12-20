# Test Suite Documentation

Ovaj projekat ima kompletnu test suite sa API testovima, frontend testovima i E2E testovima.

## Instalacija

Prvo instaliraj sve dependencije:

```bash
# Root dependencije (API testovi + Playwright)
npm install

# Frontend dependencije
cd frontend
npm install
cd ..
```

## Pokretanje Testova

### API Testovi

Testovi za backend API endpointe:

```bash
# Svi API testovi
npm run test:api

# Sa watch mode
npm run test:watch -- --testPathPattern=api/tests
```

### Frontend Testovi

Testovi za React komponente i stranice:

```bash
cd frontend
npm test

# Sa watch mode
npm run test:watch
```

### E2E Testovi (Playwright)

End-to-end testovi koji testiraju cijelu aplikaciju:

```bash
# Pokreni sve E2E testove
npm run test:e2e

# Pokreni specifičan test
npx playwright test e2e/wallets.spec.ts

# Pokreni u UI mode (interaktivno)
npx playwright test --ui
```

**Napomena:** E2E testovi automatski pokreću API server i frontend. Ako su već pokrenuti, koristit će postojeće instance.

## Struktura Testova

### API Testovi (`api/tests/`)

- `health.test.ts` - Health check endpoint
- `wallets.test.ts` - Wallet management endpoints
- `launch.test.ts` - Token launch endpoint
- `sell.test.ts` - Sell endpoints (Pump.Fun i Raydium)
- `lut.test.ts` - Lookup Table endpoints
- `config.test.ts` - Configuration endpoints

### Frontend Testovi (`frontend/__tests__/`)

- `components/Button.test.tsx` - Button komponenta
- `pages/wallets.test.tsx` - Wallets stranica
- `pages/launch.test.tsx` - Launch stranica
- `pages/sell.test.tsx` - Sell stranica
- `pages/settings.test.tsx` - Settings stranica

### E2E Testovi (`e2e/`)

- `wallets.spec.ts` - Wallet management flow
- `launch.spec.ts` - Token launch flow
- `sell.spec.ts` - Sell tokens flow
- `settings.spec.ts` - Settings configuration
- `navigation.spec.ts` - Navigation i routing

## Konfiguracija

### Jest (API)

Konfiguracija se nalazi u `jest.config.js` u root direktoriju.

### Jest (Frontend)

Konfiguracija se nalazi u `frontend/jest.config.js`.

### Playwright

Konfiguracija se nalazi u `playwright.config.ts`.

## Napomene

- API testovi koriste pravi Solana RPC (kako je specificirano u planu)
- E2E testovi zahtijevaju da su API server i frontend dostupni
- Neki testovi mogu failati ako nema pravilno konfiguriran RPC ili Jito connection
- Wallet testovi brišu postojeće wallet fajlove prije kreiranja novih

## Troubleshooting

### API testovi ne prolaze

- Provjeri da li je `.env` fajl pravilno konfiguriran
- Provjeri RPC konekciju
- Provjeri da li `src/keypairs` direktorij postoji

### Frontend testovi ne prolaze

- Provjeri da li su sve dependencije instalirane
- Provjeri `frontend/jest.config.js` konfiguraciju
- Provjeri da li su mock-ovi pravilno postavljeni

### E2E testovi ne prolaze

- Provjeri da li su serveri pokrenuti ili da li Playwright može da ih pokrene
- Provjeri `playwright.config.ts` konfiguraciju
- Pokreni `npx playwright install` ako browseri nisu instalirani
