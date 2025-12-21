import { create } from "zustand";
import { api } from "./api";

export type NetworkMode = "mainnet" | "devnet" | "unknown";

interface HealthState {
  rpc: boolean;
  jito: boolean;
  network: NetworkMode;
  slot: number | null;
  lastChecked: Date | null;
  setHealth: (health: Partial<HealthState>) => void;
}

interface NetworkState {
  network: NetworkMode;
  isDevnet: boolean;
  isMainnet: boolean;
  rpcUrl: string;
  loading: boolean;
  error: string | null;
  fetchNetwork: () => Promise<void>;
  setNetwork: (network: "mainnet" | "devnet") => Promise<{ success: boolean; requiresRestart?: boolean }>;
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

export const useNetworkStore = create<NetworkState>((set) => ({
  network: "unknown",
  isDevnet: false,
  isMainnet: false,
  rpcUrl: "",
  loading: false,
  error: null,
  fetchNetwork: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get("/network");
      set({
        network: response.data.network,
        isDevnet: response.data.isDevnet,
        isMainnet: response.data.isMainnet,
        rpcUrl: response.data.rpcUrl,
        loading: false,
      });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  setNetwork: async (network: "mainnet" | "devnet") => {
    set({ loading: true, error: null });
    try {
      const response = await api.put("/network", { network });
      set({
        network: response.data.network,
        isDevnet: network === "devnet",
        isMainnet: network === "mainnet",
        loading: false,
      });
      return { success: true, requiresRestart: response.data.requiresRestart };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false };
    }
  },
}));

export const useWalletStore = create<WalletState>((set) => ({
  wallets: [],
  balances: {},
  loading: false,
  setWallets: (wallets) => set({ wallets }),
  setBalances: (balances) => set({ balances }),
  setLoading: (loading) => set({ loading }),
}));

