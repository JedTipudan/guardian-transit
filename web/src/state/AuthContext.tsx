import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, isUnauthorized, type ApiError } from '../lib/api';
import type { User } from '../lib/types';
import { connectSocket, disconnectSocket } from '../lib/socket';

interface LoginResponse {
  user?: User;
  requiresOtp?: boolean;
  phone?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
}

interface AuthContextValue {
  user: User | null;
  status: 'loading' | 'ready';
  /** Set when the session check itself failed for a non-auth reason. */
  error: string | null;
  login: (identifier: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/account/me');
      setUser(data.user);
      setError(null);
    } catch (cause) {
      setUser(null);
      setError(isUnauthorized(cause) ? null : (cause as ApiError)?.message ?? null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime channel follows the session: open when signed in, closed otherwise.
  useEffect(() => {
    if (user) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [user]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.post<LoginResponse>('/auth/login', { identifier, password });
    if (result.user) {
      setUser(result.user);
      setStatus('ready');
      connectSocket();
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the local session is cleared regardless */
    }
    setUser(null);
    disconnectSocket();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, error, login, logout, setUser, reload: load }),
    [user, status, error, login, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Convenience accessor for the signed-in user (throws outside the provider). */
export function useCurrentUser(): User | null {
  return useAuth().user;
}
