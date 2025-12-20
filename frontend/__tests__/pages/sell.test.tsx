import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SellPage from '@/app/sell/page';
import * as api from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('SellPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.sellPumpFun.mockResolvedValue({ success: true });
    mockApi.sellRaydium.mockResolvedValue({ success: true });
  });

  test('renders sell page', () => {
    render(<SellPage />);
    expect(screen.getByText(/Sell Tokens/i)).toBeInTheDocument();
  });

  test('renders platform toggle buttons', () => {
    render(<SellPage />);
    expect(screen.getByRole('button', { name: /Pump.Fun/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Raydium/i })).toBeInTheDocument();
  });

  test('defaults to Pump.Fun platform', () => {
    render(<SellPage />);
    const pumpfunButton = screen.getByRole('button', { name: /Pump.Fun/i });
    expect(pumpfunButton).toHaveClass('bg-[#00ff41]'); // primary variant
  });

  test('switches to Raydium platform', async () => {
    render(<SellPage />);
    
    const raydiumButton = screen.getByRole('button', { name: /Raydium/i });
    await userEvent.click(raydiumButton);
    
    await waitFor(() => {
      expect(raydiumButton).toHaveClass('bg-[#00ff41]'); // primary variant
    });
  });

  test('shows market ID input for Raydium', async () => {
    render(<SellPage />);
    
    const raydiumButton = screen.getByRole('button', { name: /Raydium/i });
    await userEvent.click(raydiumButton);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Market ID/i)).toBeInTheDocument();
    });
  });

  test('sell button is disabled for Raydium without market ID', async () => {
    render(<SellPage />);
    
    const raydiumButton = screen.getByRole('button', { name: /Raydium/i });
    await userEvent.click(raydiumButton);
    
    await waitFor(() => {
      const sellButton = screen.getByRole('button', { name: /Sell/i });
      expect(sellButton).toBeDisabled();
    });
  });

  test('sell button is enabled for Pump.Fun', () => {
    render(<SellPage />);
    const sellButton = screen.getByRole('button', { name: /Sell/i });
    expect(sellButton).not.toBeDisabled();
  });

  test('calls sellPumpFun when selling on Pump.Fun', async () => {
    render(<SellPage />);
    
    const sellButton = screen.getByRole('button', { name: /Sell/i });
    await userEvent.click(sellButton);
    
    await waitFor(() => {
      expect(mockApi.sellPumpFun).toHaveBeenCalledWith({ percentage: 50 });
    });
  });

  test('calls sellRaydium when selling on Raydium', async () => {
    render(<SellPage />);
    
    const raydiumButton = screen.getByRole('button', { name: /Raydium/i });
    await userEvent.click(raydiumButton);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Market ID/i)).toBeInTheDocument();
    });
    
    const marketIdInput = screen.getByLabelText(/Market ID/i);
    await userEvent.type(marketIdInput, 'test-market-id');
    
    const sellButton = screen.getByRole('button', { name: /Sell/i });
    await userEvent.click(sellButton);
    
    await waitFor(() => {
      expect(mockApi.sellRaydium).toHaveBeenCalledWith({
        percentage: 50,
        marketId: 'test-market-id',
      });
    });
  });
});
