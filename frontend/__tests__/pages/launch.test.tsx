import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LaunchPage from '@/app/launch/page';
import * as api from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('LaunchPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.launchToken.mockResolvedValue({ success: true });
  });

  test('renders launch page', () => {
    render(<LaunchPage />);
    expect(screen.getByRole('heading', { name: /Launch Token/i })).toBeInTheDocument();
  });

  test('renders all form fields', () => {
    render(<LaunchPage />);
    expect(screen.getByLabelText(/Token Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Symbol/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Jito Tip/i)).toBeInTheDocument();
  });

  test('validates required fields', async () => {
    render(<LaunchPage />);
    
    const submitButton = screen.getAllByRole('button', { name: /Launch Token/i })[0];
    await userEvent.click(submitButton);
    
    // HTML5 validation should prevent submission
    const nameInput = screen.getByPlaceholderText(/My Awesome Token/i) as HTMLInputElement;
    expect(nameInput.validity.valueMissing).toBe(true);
  });

  test('submits form with valid data', async () => {
    // Mock file input
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    render(<LaunchPage />);
    
    const nameInput = screen.getByPlaceholderText(/My Awesome Token/i);
    const symbolInput = screen.getByPlaceholderText(/MAT/i);
    const descriptionInput = screen.getByPlaceholderText(/Describe your token/i);
    const imageInput = screen.getByText(/Token Image/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.type(nameInput, 'Test Token');
    await userEvent.type(symbolInput, 'TEST');
    await userEvent.type(descriptionInput, 'Test description');
    
    if (imageInput) {
      await userEvent.upload(imageInput, file);
    }
    
    const submitButton = screen.getAllByRole('button', { name: /Launch Token/i })[0];
    await userEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockApi.launchToken).toHaveBeenCalled();
    });
  });

  test('remove image button works', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    render(<LaunchPage />);
    
    const imageInput = screen.getByText(/Token Image/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    
    if (imageInput) {
      await userEvent.upload(imageInput, file);
      
      await waitFor(() => {
        expect(screen.getByText(/Remove/i)).toBeInTheDocument();
      });
      
      const removeButton = screen.getByText(/Remove/i);
      await userEvent.click(removeButton);
      
      await waitFor(() => {
        expect(screen.queryByText(/Remove/i)).not.toBeInTheDocument();
      });
    }
  });
});
