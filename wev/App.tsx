import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from './store';
import { logout } from './store/authSlice';

import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { AdminPanel } from './pages/AdminPanel';

function App() {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutMs = 30 * 60 * 1000;

    const resetTimer = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        dispatch(logout());
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }, timeoutMs);
    };

    const events = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [isAuthenticated, dispatch]);

  return (
    <BrowserRouter>
      <div className="min-h-screen w-full h-full font-sans">
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
          <Route path="/admin" element={isAuthenticated && user?.is_master ? <AdminPanel /> : <Navigate to="/" />} />
          <Route path="/*" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
