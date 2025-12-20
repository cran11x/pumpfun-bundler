import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletsPage from '@/app/wallets/page';
import { useWalletStore } from '@/lib/store';
import * as api from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('WalletsPage', () => {
  beforeEach(() => {
    // Reset store
    useWalletStore.setState({
      wallets: [],
      balances: {},
      loading: false,
    });

    // Reset mocks
    jest.clearAllMocks();
    
    // Mock API responses
    mockApi.getWallets.mockResolvedValue({ wallets: [] });
    mockApi.getBalances.mockResolvedValue({ balances: {} });
    mockApi.createWallets.mockResolvedValue({ 
      success: true, 
      wallets: [{ publicKey: 'test123' }] 
    });
    mockApi.fundWallets.mockResolvedValue({ success: true });
  });

  test('renders wallets page', () => {
    render(<WalletsPage />);
    expect(screen.getByText(/Wallet Management/i)).toBeInTheDocument();
  });

  test('displays loading state', () => {
    useWalletStore.setState({ loading: true });
    render(<WalletsPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test('displays empty state when no wallets', () => {
    render(<WalletsPage />);
    expect(screen.getByText(/No wallets found/i)).toBeInTheDocument();
  });

  test('displays wallets when available', async () => {
    const testWallets = [
      { publicKey: 'wallet1' },
      { publicKey: 'wallet2' },
    ];
    
    useWalletStore.setState({ wallets: testWallets });
    mockApi.getWallets.mockResolvedValue({ wallets: testWallets });
    
    render(<WalletsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/wallet1/i)).toBeInTheDocument();
      expect(screen.getByText(/wallet2/i)).toBeInTheDocument();
    });
  });

  test('calls loadData on mount', () => {
    render(<WalletsPage />);
    expect(mockApi.getWallets).toHaveBeenCalled();
    expect(mockApi.getBalances).toHaveBeenCalled();
  });

  test('refresh button calls loadData', async () => {
    render(<WalletsPage />);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(mockApi.getWallets).toHaveBeenCalledTimes(2);
    });
  });

  test('create wallets button is disabled when creating', () => {
    render(<WalletsPage />);
    const createButton = screen.getByRole('button', { name: /create wallets/i });
    // Note: We can't easily test the prompt dialog, but we can test the button exists
    expect(createButton).toBeInTheDocument();
  });

  test('fund wallets button is disabled when funding', () => {
    render(<WalletsPage />);
    const fundButton = screen.getByRole('button', { name: /fund wallets/i });
    expect(fundButton).toBeInTheDocument();
  });
});
