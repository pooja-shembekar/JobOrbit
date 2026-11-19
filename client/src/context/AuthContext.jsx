import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { AuthContext } from './authContext';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const clearSession = useCallback(() => {
    setUser(null);
    localStorage.removeItem('joborbit_user');
  }, []);

  // Verify the HttpOnly cookie session on initial app load.
  useEffect(() => {
    localStorage.removeItem('joborbit_token');
    localStorage.removeItem('joborbit_user');
    const verifySession = async () => {
      try {
        const response = await apiFetch('/auth/me');

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          localStorage.setItem('joborbit_user', JSON.stringify(data.user));
        } else {
          clearSession();
        }
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [clearSession]);

  const loginUser = (userData) => {
    setUser(userData);
  };

  const logout = useCallback(async () => {
    clearSession();
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Local state is already cleared; a future request will require a new session.
    }
  }, [clearSession]);

  useEffect(() => {
    window.addEventListener('joborbit:unauthorized', clearSession);
    return () => window.removeEventListener('joborbit:unauthorized', clearSession);
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login: loginUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
