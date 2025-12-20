import { create } from "zustand";

interface HealthState {
  rpc: boolean;
  jito: boolean;
  network: "mainnet" | "devnet" | "unknown";
  slot: number | null;
  lastChecked: Date | null;
  setHealth: (health: Partial<HealthState>) => void;
}

interface WalletState {
  wallets: any[];
  balances: Record<string, number>;
  loading: boolean;
  setWallets: (wallets: any[]) => void;
  setBalances: (balances: Record<string, number>) => void;
  setLoading: (loading: boolean) => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  rpc: false,
  jito: false,
  network: "unknown",
  slot: null,
  lastChecked: null,
  setHealth: (health) => set((state) => ({ ...state, ...health, lastChecked: new Date() })),
}));

export const useWalletStore = create<WalletState>((set) => ({
  wallets: [],
  balances: {},
  loading: false,
  setWallets: (wallets) => set({ wallets }),
  setBalances: (balances) => set({ balances }),
  setLoading: (loading) => set({ loading }),
}));

