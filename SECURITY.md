# Security Guidelines

## ⚠️ IMPORTANT: Protecting Sensitive Information

This repository is a **FORK** and cannot be made private. Therefore, it is **CRITICAL** that you never commit sensitive information to git.

## Files That Should NEVER Be Committed

The following files are automatically ignored by `.gitignore`:

- **Wallet Keypairs**: `src/keypairs/*.json`, `src/keyInfo.json`
- **Jito Authentication**: `blockengine.json`, `payer.json`
- **Environment Variables**: `.env`, `.env.local`, `.env.production`
- **Uploads Directory**: `uploads/` (may contain sensitive data)
- **Logs**: `logs/` (may contain sensitive information)

## Before Committing

Always check what you're committing:

```bash
git status
git diff
```

## Environment Variables

All sensitive configuration should be stored in `.env` file (which is gitignored):

- `HELIUS_API_KEY` - Your Helius API key
- `SIGNER_PRIVATE_KEY` - Private key of development wallet
- `FUNDER_PRIVATE_KEY` - Private key of funding wallet
- `SELLER_PRIVATE_KEY` - Private key of seller wallet
- `LICENSE_KEY` - Solana-Scripts.com license key
- And other sensitive configuration

## If You Accidentally Committed Sensitive Data

If you accidentally committed sensitive information:

1. **IMMEDIATELY** rotate/revoke the exposed credentials
2. Remove the file from git history:
   ```bash
   git rm --cached <file>
   git commit -m "Remove sensitive file"
   git push
   ```
3. Note: The data may still exist in git history. Consider using `git filter-branch` or BFG Repo-Cleaner for complete removal.

## Best Practices

1. ✅ Always use environment variables for secrets
2. ✅ Never hardcode API keys or private keys
3. ✅ Review `git diff` before committing
4. ✅ Use `.env.example` as a template (without real values)
5. ❌ Never commit `.env` files
6. ❌ Never commit keypair JSON files
7. ❌ Never commit files with hardcoded credentials

