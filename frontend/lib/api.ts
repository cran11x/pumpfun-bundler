import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Health check
export const healthCheck = async () => {
  const response = await api.get("/health");
  return response.data;
};

// Wallets
export const getWallets = async () => {
  const response = await api.get("/wallets");
  return response.data;
};

export const createWallets = async (count: number) => {
  try {
    const response = await api.post("/wallets/create", { count });
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
};

export const fundWallets = async () => {
  const response = await api.post("/wallets/fund");
  return response.data;
};

export const getBalances = async () => {
  const response = await api.get("/wallets/balances");
  return response.data;
};

// Launch
export const launchToken = async (data: {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  image: File;
  jitoTip: number;
}) => {
  const formData = new FormData();
  formData.append("name", data.name);
  formData.append("symbol", data.symbol);
  formData.append("description", data.description);
  if (data.twitter) formData.append("twitter", data.twitter);
  if (data.telegram) formData.append("telegram", data.telegram);
  if (data.website) formData.append("website", data.website);
  formData.append("image", data.image);
  formData.append("jitoTip", data.jitoTip.toString());

  const response = await api.post("/launch", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const simulateLaunch = async (data: {
  name: string;
  symbol: string;
  buyAmounts: Record<string, number>;
}) => {
  const response = await api.post("/launch/simulate", data);
  return response.data;
};

// Sell
export const sellPumpFun = async (data: {
  percentage: number;
  wallets?: string[];
}) => {
  const response = await api.post("/sell/pumpfun", data);
  return response.data;
};

export const sellRaydium = async (data: {
  percentage: number;
  marketId: string;
  wallets?: string[];
}) => {
  const response = await api.post("/sell/raydium", data);
  return response.data;
};

// LUT
export const createLUT = async (jitoTip: number) => {
  const response = await api.post("/lut/create", { jitoTip });
  return response.data;
};

export const extendLUT = async (jitoTip: number) => {
  const response = await api.post("/lut/extend", { jitoTip });
  return response.data;
};

// Config
export const getConfig = async () => {
  const response = await api.get("/config");
  return response.data;
};

export const updateConfig = async (config: Record<string, any>) => {
  const response = await api.put("/config", config);
  return response.data;
};

