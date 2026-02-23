import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import {
    fetchUsers,
    createUser,
    fetchDashboards,
    fetchAdminRoles,
    createAdminRole,
    fetchAdminIpRules,
    createAdminIpRule,
    deleteAdminIpRule,
    resetAdminDatabase,
} from '../lib/api';
import { User, Shield, UserPlus, Loader2, Network, Plus, RefreshCw, KeyRound, Trash2 } from 'lucide-react';
import { useThemeMode } from '../lib/theme';

type AccessLevel = 'view' | 'edit' | 'admin';
type AdminTab = 'users' | 'roles' | 'ips';

export const AdminPanel = () => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';

    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const [users, setUsers] = useState<any[]>([]);
    const [dashboards, setDashboards] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [ipRules, setIpRules] = useState<any[]>([]);

    const [showCreateUser, setShowCreateUser] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isMaster, setIsMaster] = useState(false);
    const [creatingUser, setCreatingUser] = useState(false);

    const [roleDashboardId, setRoleDashboardId] = useState('');
    const [roleName, setRoleName] = useState('');
    const [rolePerms, setRolePerms] = useState<{ view: boolean; edit: boolean; manage: boolean }>({ view: true, edit: false, manage: false });
    const [creatingRole, setCreatingRole] = useState(false);

    const [ipDashboardId, setIpDashboardId] = useState('');
    const [ipPattern, setIpPattern] = useState('');
    const [ipAccess, setIpAccess] = useState<AccessLevel>('view');
    const [savingIp, setSavingIp] = useState(false);
    const [resettingDb, setResettingDb] = useState(false);

    const cardClass = isDark
        ? 'rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl shadow-black/20'
        : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

    const inputClass = isDark
        ? 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500'
        : 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';

    const loadAll = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        else setRefreshing(true);
        setError('');

        try {
            const [usersData, dashboardsData, rolesData, ipRulesData] = await Promise.allSettled([
                fetchUsers(),
                fetchDashboards(),
                fetchAdminRoles(),
                fetchAdminIpRules(),
            ]);

            if (usersData.status === 'fulfilled') {
                setUsers(usersData.value || []);
            }

            if (dashboardsData.status === 'fulfilled') {
                setDashboards(dashboardsData.value || []);
            }

            if (rolesData.status === 'fulfilled') {
                setRoles(rolesData.value || []);
            } else {
                setRoles([]);
            }

            if (ipRulesData.status === 'fulfilled') {
                setIpRules(ipRulesData.value || []);
            } else {
                setIpRules([]);
            }

            const dashboardsValue = dashboardsData.status === 'fulfilled' ? (dashboardsData.value || []) : [];
            if (dashboardsValue.length > 0) {
                const firstId = dashboardsValue[0].id;
                setRoleDashboardId((prev) => prev || firstId);
                setIpDashboardId((prev) => prev || firstId);
            }

            const criticalError =
                usersData.status === 'rejected'
                    ? usersData.reason
                    : dashboardsData.status === 'rejected'
                        ? dashboardsData.reason
                        : null;

            if (criticalError) {
                throw criticalError;
            }

            const softErrors: string[] = [];
            if (rolesData.status === 'rejected') softErrors.push(`Roles: ${rolesData.reason?.message || 'error'}`);
            if (ipRulesData.status === 'rejected') softErrors.push(`IPs: ${ipRulesData.reason?.message || 'error'}`);
            if (softErrors.length > 0) {
                setError(`Algunas secciones no cargaron. ${softErrors.join(' | ')}. Si actualizaste el backend, reinicialo.`);
            }
        } catch (e: any) {
            setError(e.message || 'No se pudo cargar la informacion de administracion.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadAll(true);
    }, []);

    const totalRoleMembers = useMemo(
        () => roles.reduce((acc, role) => acc + (Array.isArray(role.members) ? role.members.length : 0), 0),
        [roles],
    );

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) return;

        setCreatingUser(true);
        setError('');
        try {
            const result = await createUser(username.trim(), password, isMaster);
            if (result.error) throw new Error(result.error);

            setUsername('');
            setPassword('');
            setIsMaster(false);
            setShowCreateUser(false);
            await loadAll();
        } catch (err: any) {
            setError(err.message || 'No se pudo crear el usuario.');
        } finally {
            setCreatingUser(false);
        }
    };

    const handleCreateRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roleDashboardId || !roleName.trim()) return;

        setCreatingRole(true);
        setError('');

        try {
            const perms = Object.entries(rolePerms)
                .filter(([, checked]) => checked)
                .map(([perm]) => perm);

            const normalizedPerms = Array.from(new Set(perms.includes('edit') || perms.includes('manage') ? ['view', ...perms] : perms));
            await createAdminRole(roleDashboardId, roleName.trim(), normalizedPerms);

            setRoleName('');
            setRolePerms({ view: true, edit: false, manage: false });
            await loadAll();
        } catch (err: any) {
            setError(err.message || 'No se pudo crear el rol.');
        } finally {
            setCreatingRole(false);
        }
    };

    const handleCreateIpRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ipDashboardId || !ipPattern.trim()) return;

        setSavingIp(true);
        setError('');

        try {
            await createAdminIpRule(ipDashboardId, ipPattern.trim(), ipAccess);
            setIpPattern('');
            setIpAccess('view');
            await loadAll();
        } catch (err: any) {
            setError(err.message || 'No se pudo crear la regla IP.');
        } finally {
            setSavingIp(false);
        }
    };

    const handleDeleteIpRule = async (id: string | number) => {
        setError('');
        try {
            await deleteAdminIpRule(id);
            await loadAll();
        } catch (err: any) {
            setError(err.message || 'No se pudo eliminar la regla IP.');
        }
    };

    const handleResetDatabase = async () => {
        const confirmText = window.prompt('Escribe LIMPIAR_DB para borrar toda la base de datos y dejar solo admin:');
        if (confirmText !== 'LIMPIAR_DB') return;

        setResettingDb(true);
        setError('');
        try {
            await resetAdminDatabase('LIMPIAR_DB');
            setShowCreateUser(false);
            setUsername('');
            setPassword('');
            setIsMaster(false);
            setRoleName('');
            setRolePerms({ view: true, edit: false, manage: false });
            setIpPattern('');
            setIpAccess('view');
            setActiveTab('users');
            await loadAll();
        } catch (err: any) {
            setError(err.message || 'No se pudo limpiar la base de datos.');
        } finally {
            setResettingDb(false);
        }
    };

    return (
        <AppLayout>
            <div id="dv-admin-page" className="dv-themed h-full w-full overflow-auto p-8">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className={`text-3xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Administracion</h1>
                        <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Gestiona usuarios, roles globales y reglas IP validas del sistema.
                        </p>
                    </div>
                    <button
                        onClick={() => loadAll()}
                        disabled={refreshing}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Actualizar
                    </button>
                    <button
                        onClick={handleResetDatabase}
                        disabled={resettingDb}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/20 disabled:opacity-60"
                    >
                        {resettingDb ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Limpiar DB
                    </button>
                </div>

                {error && (
                    <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${isDark ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {error}
                    </div>
                )}

                <div id="dv-admin-tabs" className="mb-4 flex flex-wrap gap-2">
                    <button
                        id="dv-admin-tab-users"
                        onClick={() => setActiveTab('users')}
                        className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'users' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                        Usuarios ({users.length})
                    </button>
                    <button
                        id="dv-admin-tab-roles"
                        onClick={() => setActiveTab('roles')}
                        className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'roles' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                        Roles ({roles.length})
                    </button>
                    <button
                        id="dv-admin-tab-ips"
                        onClick={() => setActiveTab('ips')}
                        className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'ips' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                        IPs ({ipRules.length})
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className={`animate-spin ${isDark ? 'text-slate-400' : 'text-slate-500'}`} size={28} />
                    </div>
                ) : (
                    <>
                        {activeTab === 'users' && (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <div className={`${cardClass} xl:col-span-1`}>
                                    <div className="mb-4 flex items-center justify-between">
                                        <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Crear usuario</h2>
                                        <button
                                            onClick={() => setShowCreateUser((v) => !v)}
                                            className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2 py-1 text-xs text-white hover:bg-cyan-700"
                                        >
                                            <UserPlus size={12} /> {showCreateUser ? 'Cerrar' : 'Nuevo'}
                                        </button>
                                    </div>

                                    {showCreateUser && (
                                        <form onSubmit={handleCreateUser} className="space-y-3">
                                            <input
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                placeholder="Usuario"
                                                className={inputClass}
                                                required
                                            />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Contrasena"
                                                className={inputClass}
                                                required
                                            />
                                            <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isMaster}
                                                    onChange={(e) => setIsMaster(e.target.checked)}
                                                />
                                                Usuario maestro
                                            </label>
                                            <button
                                                type="submit"
                                                disabled={creatingUser}
                                                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60"
                                            >
                                                {creatingUser ? 'Creando...' : 'Crear usuario'}
                                            </button>
                                        </form>
                                    )}
                                </div>

                                <div id="dv-admin-user-list" className={`${cardClass} xl:col-span-2`}>
                                    <div className="mb-3 flex items-center gap-2">
                                        <User size={16} className="text-cyan-500" />
                                        <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Usuarios existentes</h2>
                                    </div>
                                    <div className="space-y-2">
                                        {users.map((usr) => (
                                            <div
                                                key={usr.id}
                                                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`rounded-full p-1.5 ${usr.is_master ? 'bg-violet-500/20 text-violet-300' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                                        {usr.is_master ? <Shield size={14} /> : <User size={14} />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{usr.username}</div>
                                                        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {usr.is_master ? 'Master' : 'Usuario'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{String(usr.id).slice(0, 8)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'roles' && (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <form onSubmit={handleCreateRole} className={`${cardClass} space-y-3 xl:col-span-1`}>
                                    <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Crear rol global</h2>
                                    <select value={roleDashboardId} onChange={(e) => setRoleDashboardId(e.target.value)} className={inputClass} required>
                                        <option value="">Selecciona tablero</option>
                                        {dashboards.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        value={roleName}
                                        onChange={(e) => setRoleName(e.target.value)}
                                        placeholder="Nombre del rol"
                                        className={inputClass}
                                        required
                                    />
                                    <div className={`rounded-lg border p-3 text-sm ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                        <div className="mb-2 text-xs uppercase tracking-wider">Permisos</div>
                                        <label className="mb-1 flex items-center gap-2"><input type="checkbox" checked={rolePerms.view} onChange={() => setRolePerms((p) => ({ ...p, view: !p.view }))} />Ver</label>
                                        <label className="mb-1 flex items-center gap-2"><input type="checkbox" checked={rolePerms.edit} onChange={() => setRolePerms((p) => ({ ...p, edit: !p.edit }))} />Editar</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={rolePerms.manage} onChange={() => setRolePerms((p) => ({ ...p, manage: !p.manage }))} />Administrar</label>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={creatingRole}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60"
                                    >
                                        <Plus size={14} /> {creatingRole ? 'Creando...' : 'Crear rol'}
                                    </button>
                                </form>

                                <div id="dv-admin-role-list" className={`${cardClass} xl:col-span-2`}>
                                    <div className="mb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <KeyRound size={16} className="text-cyan-500" />
                                            <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Roles existentes</h2>
                                        </div>
                                        <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{roles.length} roles · {totalRoleMembers} miembros</span>
                                    </div>

                                    <div className="space-y-2">
                                        {roles.map((role) => (
                                            <div key={role.id} className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                                                <div className="mb-1 flex items-center justify-between">
                                                    <div className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{role.name}</div>
                                                    <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{role.dashboard_name}</div>
                                                </div>
                                                <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                    Permisos: {(role.permissions || []).join(', ') || 'sin permisos'}
                                                </div>
                                                <div className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                    Miembros: {(role.members || []).map((m: any) => m.username).join(', ') || 'sin miembros'}
                                                </div>
                                            </div>
                                        ))}
                                        {roles.length === 0 && (
                                            <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                                                No hay roles creados.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'ips' && (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <form onSubmit={handleCreateIpRule} className={`${cardClass} space-y-3 xl:col-span-1`}>
                                    <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Crear regla IP</h2>
                                    <select value={ipDashboardId} onChange={(e) => setIpDashboardId(e.target.value)} className={inputClass} required>
                                        <option value="">Selecciona tablero</option>
                                        {dashboards.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        value={ipPattern}
                                        onChange={(e) => setIpPattern(e.target.value)}
                                        placeholder="Ejemplo: 192.168.1.*"
                                        className={inputClass}
                                        required
                                    />
                                    <select value={ipAccess} onChange={(e) => setIpAccess(e.target.value as AccessLevel)} className={inputClass}>
                                        <option value="view">Solo ver</option>
                                        <option value="edit">Editar</option>
                                        <option value="admin">Administrar</option>
                                    </select>
                                    <button
                                        type="submit"
                                        disabled={savingIp}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60"
                                    >
                                        <Network size={14} /> {savingIp ? 'Guardando...' : 'Crear regla'}
                                    </button>
                                </form>

                                <div id="dv-admin-ip-list" className={`${cardClass} xl:col-span-2`}>
                                    <h2 className={`mb-3 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>IPs validas</h2>
                                    <div className="space-y-2">
                                        {ipRules.map((rule) => (
                                            <div key={rule.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                                                <div>
                                                    <div className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{rule.ip_pattern}</div>
                                                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {rule.dashboard_name || '(Sin tablero)'} · {rule.access_level}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteIpRule(rule.id)}
                                                    className="rounded-md border border-rose-500/40 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                                                    title="Eliminar regla"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))}
                                        {ipRules.length === 0 && (
                                            <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                                                No hay reglas IP configuradas.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
};
