import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { loginSuccess } from '../store/authSlice';
import { Lock, User, Sparkles } from 'lucide-react';

export const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const data = await login(username, password);
            if (!data.token) throw new Error('No token');

            localStorage.setItem('token', data.token);
            if (data.user) {
                localStorage.setItem('user', JSON.stringify(data.user));
            }
            dispatch(loginSuccess({ user: data.user, token: data.token }));
            navigate('/');
        } catch {
            setError('Credenciales invalidas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(6,182,212,0.25),transparent_40%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.25),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.14),transparent_50%)]" />

            <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/85 shadow-2xl backdrop-blur-xl">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                    <section className="hidden p-10 lg:block">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                            <Sparkles size={14} />
                            Data Intelligence
                        </div>
                        <h1 className="mt-8 text-4xl font-semibold leading-tight text-slate-50">
                            Construye dashboards con un flujo mas rapido y visual.
                        </h1>
                        <p className="mt-4 max-w-md text-sm text-slate-300">
                            DVisual conecta datos, SQL e IA para generar analitica accionable en minutos.
                        </p>
                        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                            Usuario inicial: <span className="font-semibold text-slate-200">admin</span>
                            <br />
                            Clave inicial: <span className="font-semibold text-slate-200">admin123</span>
                        </div>
                    </section>

                    <section className="p-8 sm:p-10">
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-50">Iniciar sesion</h2>
                            <p className="mt-1 text-sm text-slate-400">Accede al espacio de trabajo de DVisual.</p>
                        </div>

                        {error && (
                            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-slate-400">Usuario</label>
                                <div className="relative">
                                    <User size={16} className="pointer-events-none absolute left-3 top-3 text-slate-500" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                                        placeholder="Ingresa tu usuario"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-slate-400">Contrasena</label>
                                <div className="relative">
                                    <Lock size={16} className="pointer-events-none absolute left-3 top-3 text-slate-500" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                                        placeholder="Ingresa tu contrasena"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-900/30 transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {loading ? 'Ingresando...' : 'Entrar'}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
};
