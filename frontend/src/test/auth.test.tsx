import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';

// Mock the auth API calls
vi.mock('@/api/auth', () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  getCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
}));

import * as authApi from '@/api/auth';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

describe('Authentication Pages & Validation (U03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('LoginPage', () => {
    it('renders login form with data-testid="login-form"', () => {
      renderWithProviders(<LoginPage />);

      expect(screen.getByTestId('login-form')).toBeInTheDocument();
      expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });

    it('validates required email and password on submit', async () => {
      renderWithProviders(<LoginPage />);

      fireEvent.submit(screen.getByTestId('login-form'));

      expect(await screen.findByText('Email is required')).toBeInTheDocument();
      expect(await screen.findByText('Password is required')).toBeInTheDocument();
      expect(authApi.loginUser).not.toHaveBeenCalled();
    });

    it('validates invalid email format', async () => {
      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'invalid-email' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } });

      fireEvent.submit(screen.getByTestId('login-form'));

      expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
      expect(authApi.loginUser).not.toHaveBeenCalled();
    });

    it('toggles password visibility', () => {
      renderWithProviders(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^password/i) as HTMLInputElement;
      const toggleBtn = screen.getByRole('button', { name: /show password/i });

      expect(passwordInput.type).toBe('password');

      fireEvent.click(toggleBtn);
      expect(passwordInput.type).toBe('text');

      fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
      expect(passwordInput.type).toBe('password');
    });

    it('calls login API and shows error message on invalid credentials', async () => {
      vi.mocked(authApi.loginUser).mockRejectedValueOnce(new Error('Invalid email or password'));

      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'user@example.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'wrongpass' } });

      fireEvent.submit(screen.getByTestId('login-form'));

      await waitFor(() => {
        expect(screen.getAllByText('Invalid email or password').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('RegisterPage', () => {
    it('renders register form with data-testid="register-form"', () => {
      renderWithProviders(<RegisterPage />);

      expect(screen.getByTestId('register-form')).toBeInTheDocument();
      expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password \(min 8 characters\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^confirm password/i)).toBeInTheDocument();
    });

    it('validates password minimum length of 8 characters', async () => {
      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'user@example.com' } });
      fireEvent.change(screen.getByLabelText(/password \(min 8 characters\)/i), { target: { value: 'short' } });
      fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: 'short' } });

      fireEvent.submit(screen.getByTestId('register-form'));

      expect(await screen.findByText('Password must be at least 8 characters long')).toBeInTheDocument();
      expect(authApi.registerUser).not.toHaveBeenCalled();
    });

    it('validates matching passwords', async () => {
      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'user@example.com' } });
      fireEvent.change(screen.getByLabelText(/password \(min 8 characters\)/i), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: 'mismatchpass' } });

      fireEvent.submit(screen.getByTestId('register-form'));

      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
      expect(authApi.registerUser).not.toHaveBeenCalled();
    });

    it('successfully calls register API with valid data', async () => {
      vi.mocked(authApi.registerUser).mockResolvedValueOnce({
        id: '123',
        email: 'user@example.com',
        created_at: '2026-10-29T10:00:00Z',
        updated_at: '2026-10-29T10:00:00Z',
      });
      vi.mocked(authApi.loginUser).mockResolvedValueOnce({
        access_token: 'fake-access',
        refresh_token: 'fake-refresh',
        token_type: 'bearer',
      });
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce({
        id: '123',
        email: 'user@example.com',
        created_at: '2026-10-29T10:00:00Z',
        updated_at: '2026-10-29T10:00:00Z',
      });

      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'user@example.com' } });
      fireEvent.change(screen.getByLabelText(/password \(min 8 characters\)/i), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: 'password123' } });

      fireEvent.submit(screen.getByTestId('register-form'));

      await waitFor(() => {
        expect(authApi.registerUser).toHaveBeenCalledWith('user@example.com', 'password123');
      });
    });
  });
});
