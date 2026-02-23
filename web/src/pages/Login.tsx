import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../store/authSlice';
import { login } from '../lib/api';

export const Login = () => {
    const [username, setUsername] = useState('demo');
    const [password, setPassword] = useState('demo');
    const [error, setError] = useState('');
    const dispatch = useDispatch();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = await login(username, password);
            dispatch(loginSuccess({ user: data.user, token: data.token }));
        } catch (err: any) {
            setError(err.message || 'Login failed');
        }
    };

    return (
        <div className="flex items-center justify-center h-full bg-slate-900 overflow-hidden relative">
            <div className="absolute inset-0 z-0 opacity-30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-slate-900 blur-2xl"></div>

            <div className="glass p-8 rounded-2xl w-full max-w-md z-10 flex flex-col gap-6 transform transition-all duration-500 hover:scale-[1.01] hover:shadow-cyan-500/20 shadow-2xl">
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight">DVisual</h1>
                    <p className="text-slate-400 mt-2">Motor de analitica de proxima generacion</p>
                </div>

                {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">{error}</div>}

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Contrasena</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        className="mt-4 w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98]"
                    >
                        Entrar al espacio de trabajo
                    </button>
                </form>
            </div>
        </div>
    );
};
