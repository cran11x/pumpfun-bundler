import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false, // Don't send credentials for CORS
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("[API] Request error:", error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log(`[API] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
    return response;
  },
  (error) => {
    console.error(`[API] ${error.config?.method?.toUpperCase()} ${error.config?.url} - Error:`, error.message);
    if (error.code === 'ERR_NETWORK') {
      console.error("[API] Network error - is the API server running on http://localhost:3001?");
    }
    return Promise.reject(error);
  }
);

// Health check
export const healthCheck = async () => {
  const response = await api.get("/health");
  return response.data;
};

// Helper function to retry API calls
const retryApiCall = async <T>(
  apiCall: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.log(`Retrying API call... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed after retries');
};

// Wallets
export const getWallets = async () => {
  return retryApiCall(async () => {
    const response = await api.get("/wallets");
    return response.data;
  });
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

export const fundWallets = async (amountPerWallet?: number) => {
  try {
    const body: any = {};
    if (amountPerWallet !== undefined) {
      body.amountPerWallet = amountPerWallet;
    }
    const response = await api.post("/wallets/fund", body);
    return response.data;
  } catch (error: any) {
    // Extract error message from API response
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    // Handle network errors or other errors
    if (error.message) {
      throw new Error(error.message);
    }
    throw new Error("Failed to fund wallets. Please try again.");
  }
};

export const getBalances = async () => {
  return retryApiCall(async () => {
    const response = await api.get("/wallets/balances");
    return response.data;
  });
};

export const getMainWallet = async () => {
  return retryApiCall(async () => {
    const response = await api.get("/wallets/main");
    return response.data;
  });
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

