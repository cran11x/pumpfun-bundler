# 💰 Instrukcije za Funding Wallet-ova

## Korak 1: Fundiranje Glavnog Wallet-a

**Glavni wallet adresa:**
```
hwHGVm3daeGSZdPc9vEc4MAqCbTJv2xQbZYsawuc8SW
```

**Potrebno:** ~0.3 SOL

**Kako:**
1. Otvori Phantom/Solflare/bilo koji Solana wallet
2. Pošalji 0.3 SOL na gornju adresu
3. Sačekaj potvrdu transakcije

## Korak 2: Distribucija na Sub-wallet-e

**Nakon što glavni wallet ima SOL:**

1. Pokreni glavnu aplikaciju:
   ```bash
   npx ts-node main.ts
   ```

2. Izaberi opciju **2** (Pre Launch Checklist)

3. Aplikacija će automatski distribuirati SOL na sve sub-wallet-e

## Korak 3: Validacija

Pokreni test ponovo da potvrdiš da je sve OK:
```bash
npx ts-node test-setup.ts
```

**Očekivani rezultat:** Svi ✅ za FAZU 2

---

## Sub-wallet Adrese (za reference)

1. hwHGVm3daeGSZdPc9vEc4MAqCbTJv2xQbZYsawuc8SW (glavni)
2. AkRmMn3XGzJELKdYJZhqGPWVzNrXWQMoEqNdCvRpump
3. 59CQ2S1sJNgVzMBqXNZhqGPWVzNrXWQMoEqNdCvRpump
4. 8Fwf8dmaJNgVzMBqXNZhqGPWVzNrXWQMoEqNdCvRpump
5. 2XVB995HJNgVzMBqXNZhqGPWVzNrXWQMoEqNdCvRpump
6. 131JnVq3JNgVzMBqXNZhqGPWVzNrXWQMoEqNdCvRpump

*(Ostale adrese dostupne kroz test-setup.ts)*
