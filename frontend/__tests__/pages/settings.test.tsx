import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/app/settings/page';
import * as api from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getConfig.mockResolvedValue({
      rpcUrl: 'https://test-rpc.com',
      jitoUrl: 'test-jito.com',
    });
    mockApi.updateConfig.mockResolvedValue({ success: true });
    mockApi.createLUT.mockResolvedValue({ success: true });
    mockApi.extendLUT.mockResolvedValue({ success: true });
  });

  test('renders settings page', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/Settings/i)).toBeInTheDocument();
  });

  test('loads config on mount', async () => {
    render(<SettingsPage />);
    
    await waitFor(() => {
      expect(mockApi.getConfig).toHaveBeenCalled();
    });
  });

  test('displays config values', async () => {
    render(<SettingsPage />);
    
    await waitFor(() => {
      const rpcInput = screen.getByLabelText(/RPC URL/i) as HTMLInputElement;
      expect(rpcInput.value).toBe('https://test-rpc.com');
    });
  });

  test('updates config when save is clicked', async () => {
    render(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/RPC URL/i)).toBeInTheDocument();
    });
    
    const rpcInput = screen.getByLabelText(/RPC URL/i);
    await userEvent.clear(rpcInput);
    await userEvent.type(rpcInput, 'https://new-rpc.com');
    
    const saveButton = screen.getByRole('button', { name: /Save/i });
    await userEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockApi.updateConfig).toHaveBeenCalledWith({
        rpcUrl: 'https://new-rpc.com',
        jitoUrl: 'test-jito.com',
      });
    });
  });

  test('refresh button reloads config', async () => {
    render(<SettingsPage />);
    
    await waitFor(() => {
      expect(mockApi.getConfig).toHaveBeenCalled();
    });
    
    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    await userEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(mockApi.getConfig).toHaveBeenCalledTimes(2);
    });
  });

  test('create LUT button calls createLUT', async () => {
    // Mock window.confirm
    window.confirm = jest.fn(() => true);
    
    render(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create New LUT/i })).toBeInTheDocument();
    });
    
    const createLUTButton = screen.getByRole('button', { name: /Create New LUT/i });
    await userEvent.click(createLUTButton);
    
    await waitFor(() => {
      expect(mockApi.createLUT).toHaveBeenCalledWith(0.01);
    });
  });

  test('extend LUT button calls extendLUT', async () => {
    window.confirm = jest.fn(() => true);
    
    render(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Extend Existing LUT/i })).toBeInTheDocument();
    });
    
    const extendLUTButton = screen.getByRole('button', { name: /Extend Existing LUT/i });
    await userEvent.click(extendLUTButton);
    
    await waitFor(() => {
      expect(mockApi.extendLUT).toHaveBeenCalledWith(0.01);
    });
  });
});
