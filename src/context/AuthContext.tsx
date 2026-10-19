import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MeResponse } from '../../shared/types';
import { api } from '../lib/api';

type AuthMode = 'login' | 'register';

interface AuthContextValue {
  me: MeResponse | null;
  loading: boolean;
  authMode: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    username: string;
    password: string;
    inviteCode?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/me');
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      await api('/auth/login', { method: 'POST', body: { email: identifier, password } });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (payload: { email: string; username: string; password: string; inviteCode?: string }) => {
      await api('/auth/register', { method: 'POST', body: payload });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setMe(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      authMode,
      openAuth: (mode = 'login') => setAuthMode(mode),
      closeAuth: () => setAuthMode(null),
      refresh,
      login,
      register,
      logout,
    }),
    [me, loading, authMode, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
