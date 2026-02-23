import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RootState } from '../store';
import { logout } from '../store/authSlice';
import { toggleEditMode, Widget, addWidget, removeWidget, setLayouts, setWidgets, updateWidget } from '../store/dashboardSlice';
import { setDuckDBReady } from '../store/datasetsSlice';
import { GripHorizontal, Edit3, Save, Loader2, Share2, Users, Plus, Layout, ChevronDown, ArrowUp, ArrowDown, Filter, XCircle, RefreshCw, SlidersHorizontal, Lock, LockOpen } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { AnimatePresence, motion } from 'framer-motion';
import { initDuckDB, getDuckDB } from '../lib/duckdb';
import { DatasetManager } from '../components/DatasetManager';
import { QueryEditor } from '../components/QueryEditor';
import { ChartWidget } from '../components/ChartWidget';
import { ChartConfigurator } from '../components/ChartConfigurator';
import { ImageConfigurator } from '../components/ImageConfigurator';
import { DesignConfigurator } from '../components/DesignConfigurator';
import { TextConfigurator } from '../components/TextConfigurator';
import { AppLayout } from '../components/AppLayout';
import { VisualizationsPanel } from '../components/VisualizationsPanel';
import { ModelView } from '../components/ModelView';
import { TableWidget } from '../components/TableWidget';
import { DesignWidget } from '../components/DesignWidget';
import { fetchDashboards, saveDashboard, fetchUsers, assignPermission, fetchDashboardRoles, createDashboardRole, updateDashboardRole, deleteDashboardRole, addRoleMember, removeRoleMember } from '../lib/api';
import { clearFilter, clearAllFilters, setFilter } from '../store/filtersSlice';
import { ensureDuckDBAndRestore } from '../lib/dataRestoration';
import { useThemeMode } from '../lib/theme';
// CSS imports handled in main.css or dynamically loaded

const UserSearchSelect = ({
    value,
    onChange,
    users,
    placeholder = 'Seleccionar o escribir usuario',
    isDark,
    disabled = false,
}: {
    value: string;
    onChange: (value: string) => void;
    users: any[];
    placeholder?: string;
    isDark: boolean;
    disabled?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const query = value.trim().toLowerCase();
    const filtered = users
        .map((u: any) => String(u?.username || '').trim())
        .filter(Boolean)
        .filter((username) => username.toLowerCase().includes(query))
        .slice(0, 20);

    return (
        <div className="relative" ref={rootRef}>
            <input
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                disabled={disabled}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                    isDark
                        ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-cyan-500'
                        : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500'
                } disabled:opacity-60`}
            />
            {open && (
                <div className={`absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-lg border shadow-xl ${
                    isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                }`}>
                    {filtered.length > 0 ? filtered.map((username) => (
                        <button
                            key={username}
                            type="button"
                            onClick={() => {
                                onChange(username);
                                setOpen(false);
                            }}
                            className={`block w-full px-3 py-2 text-left text-sm ${
                                isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-800 hover:bg-slate-100'
                            }`}
                        >
                            {username}
                        </button>
                    )) : (
                        <div className={`px-3 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Sin coincidencias
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
const ShareModal = ({ dashboardId, onClose }: { dashboardId: string, onClose: () => void }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const [target, setTarget] = useState('');
    const [type, setType] = useState<'user' | 'ip'>('user');
    const [accessLevel, setAccessLevel] = useState('view');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        if (type === 'user') {
            fetchUsers().then(setUsers).catch(console.error);
        }
    }, [type]);

    const handleShare = async () => {
        setLoading(true);
        setMsg('');
        try {
            const res = await assignPermission(dashboardId, target, type, accessLevel);
            if (res.error) setMsg('Error: ' + res.error);
            else {
                setMsg('Compartido correctamente');
                setTarget('');
            }
        } catch (e) {
            setMsg('Error al compartir');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className={`w-full max-w-md rounded-2xl border shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Compartir tablero</h3>
                    <button onClick={onClose} className={`rounded-md px-2 py-1 text-xs ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>Cerrar</button>
                </div>
                <div className="space-y-4 p-5">
                    <div className={`grid grid-cols-2 gap-2 rounded-xl border p-1 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                        <button
                            className={`rounded-lg px-3 py-1.5 text-sm ${type === 'user' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-white'}`}
                            onClick={() => setType('user')}
                        >
                            Usuario
                        </button>
                        <button
                            className={`rounded-lg px-3 py-1.5 text-sm ${type === 'ip' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-white'}`}
                            onClick={() => setType('ip')}
                        >
                            Direccion IP
                        </button>
                    </div>

                    <div>
                        <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{type === 'user' ? 'Usuario' : 'Patron IP'}</label>
                        {type === 'user' ? (
                            <UserSearchSelect
                                value={target}
                                onChange={setTarget}
                                users={users}
                                placeholder="Seleccionar o escribir usuario"
                                isDark={isDark}
                                disabled={loading}
                            />
                        ) : (
                            <input
                                type="text"
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-cyan-500' : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500'}`}
                                value={target}
                                onChange={e => setTarget(e.target.value)}
                                placeholder="Ej: 192.168.1.*"
                            />
                        )}
                    </div>
                    <div>
                        <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Permiso</label>
                        <select
                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-cyan-500' : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500'}`}
                            value={accessLevel}
                            onChange={e => setAccessLevel(e.target.value)}
                        >
                            <option value="view">Solo ver</option>
                            <option value="edit">Puede editar</option>
                            <option value="admin">Co-administrador</option>
                        </select>
                    </div>
                    {msg && (
                        <p className={`rounded-lg border px-3 py-2 text-sm ${msg.includes('Error') ? (isDark ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600') : (isDark ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}`}>
                            {msg}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={onClose} className={`rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Cancelar</button>
                        <button
                            onClick={handleShare}
                            disabled={loading || !target}
                            className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
                        >
                            {loading ? 'Compartiendo...' : 'Compartir'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RolesModal = ({ dashboardId, onClose }: { dashboardId: string, onClose: () => void }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const [roles, setRoles] = useState<any[]>([]);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRolePerms, setNewRolePerms] = useState<{ view: boolean; edit: boolean; manage: boolean }>({ view: true, edit: false, manage: false });
    const [memberInputs, setMemberInputs] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [users, setUsers] = useState<any[]>([]);

    const normalizePermissions = (perms: string[]) => {
        const set = new Set(perms);
        if (set.has('edit') || set.has('manage')) set.add('view');
        return Array.from(set);
    };

    const loadRoles = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetchDashboardRoles(dashboardId);
            setRoles(res || []);
        } catch (e: any) {
            setError(e.message || 'Error cargando roles');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
        fetchUsers().then(setUsers).catch(console.error);
    }, [dashboardId]);

    const toggleRolePermission = (roleId: string, perm: string) => {
        setRoles(prev => prev.map(r => {
            if (r.id !== roleId) return r;
            const current = new Set(r.permissions || []);
            if (current.has(perm)) current.delete(perm);
            else current.add(perm);
            return { ...r, permissions: Array.from(current) };
        }));
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;
        setLoading(true);
        setError('');
        try {
            const perms = normalizePermissions(Object.entries(newRolePerms).filter(([, v]) => v).map(([k]) => k));
            await createDashboardRole(dashboardId, newRoleName.trim(), perms);
            setNewRoleName('');
            setNewRolePerms({ view: true, edit: false, manage: false });
            await loadRoles();
        } catch (e: any) {
            setError(e.message || 'Error creando rol');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRole = async (role: any) => {
        setLoading(true);
        setError('');
        try {
            const perms = normalizePermissions(role.permissions || []);
            await updateDashboardRole(dashboardId, role.id, role.name, perms);
            await loadRoles();
        } catch (e: any) {
            setError(e.message || 'Error guardando rol');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRole = async (roleId: string) => {
        setLoading(true);
        setError('');
        try {
            await deleteDashboardRole(dashboardId, roleId);
            await loadRoles();
        } catch (e: any) {
            setError(e.message || 'Error eliminando rol');
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async (roleId: string) => {
        const username = memberInputs[roleId]?.trim();
        if (!username) return;
        setLoading(true);
        setError('');
        try {
            await addRoleMember(dashboardId, roleId, username);
            setMemberInputs(prev => ({ ...prev, [roleId]: '' }));
            await loadRoles();
        } catch (e: any) {
            setError(e.message || 'Error agregando usuario');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (roleId: string, userId: string) => {
        setLoading(true);
        setError('');
        try {
            await removeRoleMember(dashboardId, roleId, userId);
            await loadRoles();
        } catch (e: any) {
            setError(e.message || 'Error eliminando usuario');
        } finally {
            setLoading(false);
        }
    };

    const toggleNewRolePerm = (perm: keyof typeof newRolePerms) => {
        setNewRolePerms(prev => ({ ...prev, [perm]: !prev[perm] }));
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className={`w-[860px] max-w-[96vw] rounded-2xl border shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Roles del tablero</h3>
                    <button onClick={onClose} className={`rounded-md px-2 py-1 text-xs ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>Cerrar</button>
                </div>

                <div className="p-5">
                    {error && (
                        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600'}`}>
                            {error}
                        </div>
                    )}

                    <div className={`mb-4 rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                        <div className={`mb-2 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Crear rol</div>
                        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nombre del rol</label>
                                <input
                                    value={newRoleName}
                                    onChange={(e) => setNewRoleName(e.target.value)}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 focus:border-cyan-500' : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500'}`}
                                    placeholder="Ej: Admin de tablero"
                                />
                            </div>
                            <button
                                onClick={handleCreateRole}
                                disabled={loading || !newRoleName.trim()}
                                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
                            >
                                Crear rol
                            </button>
                        </div>
                        <div className={`mt-3 flex flex-wrap gap-4 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={newRolePerms.view} onChange={() => toggleNewRolePerm('view')} />
                                Ver
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={newRolePerms.edit} onChange={() => toggleNewRolePerm('edit')} />
                                Editar
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={newRolePerms.manage} onChange={() => toggleNewRolePerm('manage')} />
                                Administrar
                            </label>
                        </div>
                    </div>

                    <div className="max-h-[60vh] space-y-4 overflow-auto pr-1">
                        {roles.map((role: any) => (
                            <div key={role.id} className={`rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <input
                                        value={role.name}
                                        onChange={(e) => setRoles(prev => prev.map(r => r.id === role.id ? { ...r, name: e.target.value } : r))}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 focus:border-cyan-500' : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500'}`}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSaveRole(role)}
                                            disabled={loading}
                                            className="rounded-lg bg-cyan-600 px-3 py-2 text-xs text-white hover:bg-cyan-500 disabled:opacity-50"
                                        >
                                            Guardar
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRole(role.id)}
                                            disabled={loading}
                                            className="rounded-lg bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                                <div className={`mt-3 flex flex-wrap gap-4 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={role.permissions?.includes('view')} onChange={() => toggleRolePermission(role.id, 'view')} />
                                        Ver
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={role.permissions?.includes('edit')} onChange={() => toggleRolePermission(role.id, 'edit')} />
                                        Editar
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={role.permissions?.includes('manage')} onChange={() => toggleRolePermission(role.id, 'manage')} />
                                        Administrar
                                    </label>
                                </div>

                                <div className="mt-3">
                                    <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Miembros</div>
                                    <div className="mb-2 flex items-center gap-2">
                                        <div className="flex-1">
                                            <UserSearchSelect
                                                value={memberInputs[role.id] || ''}
                                                onChange={(value) => setMemberInputs(prev => ({ ...prev, [role.id]: value }))}
                                                users={users}
                                                placeholder="Usuario"
                                                isDark={isDark}
                                                disabled={loading}
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleAddMember(role.id)}
                                            disabled={loading || !(memberInputs[role.id] || '').trim()}
                                            className={`rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50 ${isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                                        >
                                            Agregar
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(role.members || []).map((m: any) => (
                                            <div key={m.id} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                <span>{m.username}</span>
                                                <button
                                                    onClick={() => handleRemoveMember(role.id, m.id)}
                                                    className="text-red-500 hover:text-red-400"
                                                >
                                                    X
                                                </button>
                                            </div>
                                        ))}
                                        {(!role.members || role.members.length === 0) && (
                                            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sin miembros</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {roles.length === 0 && !loading && (
                            <div className={`rounded-xl border border-dashed p-4 text-sm ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                                No hay roles creados aun.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Dashboard = () => {
    const dispatch = useDispatch();
    const { layouts, widgets, isEditing } = useSelector((state: RootState) => state.dashboard);
    const { user } = useSelector((state: RootState) => state.auth);
    const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [dashboardId, setDashboardId] = useState<string>('default');
    const [dashboardName, setDashboardName] = useState('Mi tablero');
    const [accessLevel, setAccessLevel] = useState<string>('view'); // 'view', 'edit', 'owner'
    const [showShare, setShowShare] = useState(false);
    const [showRoles, setShowRoles] = useState(false);
    const [allDashboards, setAllDashboards] = useState<any[]>([]);
    const [showDashMenu, setShowDashMenu] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [unsavedPrompt, setUnsavedPrompt] = useState<{ type: 'new' | 'switch'; targetId?: string } | null>(null);
    const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
    const [newDashboardName, setNewDashboardName] = useState('Nuevo tablero');
    const [feedbackModal, setFeedbackModal] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const activeFilters = useSelector((state: RootState) => (state as any).filters?.activeFilters || {});
    const [refreshKey, setRefreshKey] = useState(0);
    const [filterPanel, setFilterPanel] = useState<{
        widgetId: string;
        tableName: string;
        column: string;
        options: (string | number)[];
        selected: (string | number)[];
        search: string;
        loading: boolean;
        error: string | null;
        dirty: boolean;
    } | null>(null);

    const [containerWidth, setContainerWidth] = useState<number>(0);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const loadedLayoutSignatureRef = React.useRef<string>('');
    const filterPanelRequestRef = React.useRef(0);
    const location = useLocation();
    const theme = useThemeMode();
    const isDark = theme === 'dark';

    useEffect(() => {
        const setupDB = async () => {
            if (dashboardId === 'default') return;
            try {
                await ensureDuckDBAndRestore(dispatch, dashboardId);
                dispatch(setDuckDBReady(true));
            } catch (err) {
                console.error("Failed to init DuckDB", err);
            }
        };
        setupDB();
    }, [dispatch, dashboardId]);

    useEffect(() => {
        setFilterPanel(null);
        filterPanelRequestRef.current += 1;
    }, [dashboardId]);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load Dashboards List
    useEffect(() => {
        const loadList = async () => {
            try {
                const list = await fetchDashboards();
                setAllDashboards(list);
                if (list.length > 0) {
                    // Load the first one if current is default
                    if (dashboardId === 'default') {
                        setDashboardId(list[0].id);
                        setDashboardName(list[0].name);
                    }
                }
            } catch (e) {
                console.error("Failed to load dashboard list", e);
            }
        };
        if (user) loadList();
    }, [user]);

    // Load Specific Dashboard Content
    useEffect(() => {
        const loadDashboard = async () => {
            if (dashboardId === 'default') return; // Wait for selection
            
            const d = allDashboards.find(bd => bd.id === dashboardId);
            if (!d) return;

            setAccessLevel(d.access_level || 'view');
            setDashboardName(d.name);
            const signature = `${dashboardId}::${d.layout || ''}`;
            if (loadedLayoutSignatureRef.current === signature) return;

            if (d.layout) {
                try {
                    const parsed = JSON.parse(d.layout);
                    dispatch(setLayouts(parsed.layouts || { lg: [] }));
                    dispatch(setWidgets(parsed.widgets || {}));
                    setHasUnsavedChanges(false);
                    loadedLayoutSignatureRef.current = signature;
                } catch (e) {
                    console.error("Failed to parse dashboard layout", e);
                }
            } else {
                dispatch(setLayouts({ lg: [] }));
                dispatch(setWidgets({}));
                setHasUnsavedChanges(false);
                loadedLayoutSignatureRef.current = signature;
            }
        };
        loadDashboard();
    }, [dashboardId, allDashboards, dispatch]);

    const createNewDashboardInternal = async (name: string) => {
        const newId = crypto.randomUUID();
        const newDash = {
            id: newId,
            name,
            layout: JSON.stringify({ layouts: { lg: [] }, widgets: {} }),
            access_level: 'owner'
        };

        // Optimistic update
        setAllDashboards([newDash, ...allDashboards]);
        setDashboardId(newId);
        setDashboardName(name);
        dispatch(setLayouts({ lg: [] }));
        dispatch(setWidgets({}));
        
        // Save to backend immediately to reserve ID
        try {
            await saveDashboard(newId, name, { layouts: { lg: [] }, widgets: {} });
        } catch(e) {
            console.error("Failed to create dashboard", e);
            setFeedbackModal({ type: 'error', message: 'Error al crear el tablero en el servidor' });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const layoutState = {
                layouts,
                widgets
            };
            await saveDashboard(dashboardId, dashboardName, layoutState);
            const savedLayoutText = JSON.stringify(layoutState);
            loadedLayoutSignatureRef.current = `${dashboardId}::${savedLayoutText}`;
            // Update local list
            setAllDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, name: dashboardName, layout: savedLayoutText } : d));
            setFeedbackModal({ type: 'success', message: 'Tablero guardado correctamente' });
        } catch (e) {
            console.error(e);
            setFeedbackModal({ type: 'error', message: 'Error al guardar el tablero' });
        } finally {
            setIsSaving(false);
            setHasUnsavedChanges(false);
        }
    };

    const handleAddWidget = (type: 'chart' | 'text' | 'image' | 'table' | 'shape', chartType?: string) => {
        const newWidgetId = `widget_${Date.now()}`;
        let title = 'New Widget';
        let config: any = {};
        const isOpenMojiShape = type === 'shape' && chartType === 'openmoji';
        const resolvedShapeType = isOpenMojiShape ? 'icon' : ((chartType as any) || 'rect');

        if (type === 'chart') {
            title = 'Nueva grafica';
            config = { text: 'Configura esta grafica' };
        } else if (type === 'text') {
            title = 'Texto';
            config = { text: 'Doble clic para editar el texto' };
        } else if (type === 'image') {
            title = 'Imagen';
            config = { url: '' };
        } else if (type === 'table') {
            title = 'Tabla';
            config = {};
        } else if (type === 'shape') {
            title = isOpenMojiShape ? 'OpenMoji' : 'Elemento de diseno';
            config = {};
        }

        dispatch(addWidget({
            id: newWidgetId,
            type,
            title,
            chartConfig: config,
            dataSource: chartType && type === 'chart'
                ? {
                    tableName: '',
                    xAxis: '',
                    yAxis: [],
                    chartType: chartType as any,
                }
                : undefined,
            style: type === 'shape'
                ? {
                    showTitle: false,
                    shapeType: resolvedShapeType,
                    bgColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#e5e7eb',
                    borderWidth: 1,
                    borderRadius: 8,
                    shadow: false,
                    textColor: isDark ? '#e2e8f0' : '#374151',
                    bgOpacity: isDark ? 0.96 : 1,
                    ...(isOpenMojiShape
                        ? {
                            openMojiMode: true,
                            openMojiHex: '',
                            openMojiSize: 64,
                            openMojiOpacity: 1,
                            bgOpacity: 0,
                            borderWidth: 0,
                        }
                        : {}),
                }
                : type === 'text' || type === 'image'
                    ? {
                        showTitle: false,
                        bgOpacity: type === 'image' ? (isDark ? 0.94 : 1) : 0,
                        bgColor: type === 'image' ? (isDark ? '#0f172a' : '#f8fafc') : '#000000',
                        textColor: isDark ? '#e2e8f0' : '#334155',
                        ...(type === 'image'
                            ? {
                                borderColor: isDark ? '#334155' : '#cbd5e1',
                                borderWidth: 1,
                                borderRadius: 10,
                            }
                            : {}),
                    }
                    : undefined
        }));
        setHasUnsavedChanges(true);
    };

    const updateLayoutPosition = (id: string, xPx: number, yPx: number) => {
        const lg = layouts.lg || [];
        const baseX = 20;
        const baseY = 20;
        const nextLg = lg.map((item: any) =>
            item.i === id
                ? {
                    ...item,
                    x: Math.max(0, Math.round((xPx - baseX) / 10)),
                    y: Math.max(0, Math.round((yPx - baseY) / 10)),
                }
                : item
        );
        dispatch(setLayouts({ ...layouts, lg: nextLg }));
        setHasUnsavedChanges(true);
    };

    const updateLayoutSize = (id: string, widthPx: number, heightPx: number) => {
        const lg = layouts.lg || [];
        const unitW = 260;
        const unitH = 260;
        const nextLg = lg.map((item: any) =>
            item.i === id
                ? {
                    ...item,
                    w: Math.max(4, 4 + Math.round((widthPx - unitW) / 20)),
                    h: Math.max(4, 4 + Math.round((heightPx - unitH) / 40)),
                }
                : item
        );
        dispatch(setLayouts({ ...layouts, lg: nextLg }));
        setHasUnsavedChanges(true);
    };

    const getLayoutItem = (id: string, index: number) => {
        const lg = layouts.lg || [];
        const found = lg.find((item: any) => item.i === id);
        const baseX = 20;
        const baseY = 20;
        const unitW = 260;
        const unitH = 260;

        if (found) {
            const safeX = Number.isFinite(found.x) ? found.x : 0;
            const safeY = Number.isFinite(found.y) ? found.y : index * unitH;
            const safeW = found.w && Number.isFinite(found.w) ? found.w : 6;
            const safeH = found.h && Number.isFinite(found.h) ? found.h : 5;
            return {
                x: baseX + safeX * 10,
                y: baseY + safeY * 10,
                w: unitW + (safeW - 4) * 20,
                h: unitH + (safeH - 4) * 40,
            };
        }

        return {
            x: baseX,
            y: baseY + index * (unitH + 40),
            w: unitW,
            h: unitH,
        };
    };

    const canEdit = accessLevel === 'owner' || accessLevel === 'edit' || accessLevel === 'admin' || user?.is_master;
    const canManage = accessLevel === 'owner' || accessLevel === 'admin' || user?.is_master;
    const handleClearAllFilters = useCallback(() => {
        dispatch(clearAllFilters());
        setFilterPanel((prev) => prev ? { ...prev, selected: [], dirty: false } : prev);
    }, [dispatch]);

    const handleCreateNew = async () => {
        if (hasUnsavedChanges) {
            setUnsavedPrompt({ type: 'new' });
            return;
        }
        setNewDashboardName('Nuevo tablero');
        setShowNewDashboardModal(true);
    };

    const handleSelectDashboard = (id: string) => {
        if (id === dashboardId) return;
        if (hasUnsavedChanges) {
            setUnsavedPrompt({ type: 'switch', targetId: id });
            return;
        }
        handleClearAllFilters();
        setFilterPanel(null);
        setDashboardId(id);
    };
    
    const handleConfirmUnsaved = async () => {
        if (!unsavedPrompt) return;
        if (unsavedPrompt.type === 'new') {
            setUnsavedPrompt(null);
            setNewDashboardName('Nuevo tablero');
            setShowNewDashboardModal(true);
            return;
        }
        if (unsavedPrompt.type === 'switch' && unsavedPrompt.targetId) {
            const target = unsavedPrompt.targetId;
            setUnsavedPrompt(null);
            handleClearAllFilters();
            setFilterPanel(null);
            setDashboardId(target);
        }
    };

    const handleCancelUnsaved = () => {
        setUnsavedPrompt(null);
    };

    const handleAdjustZIndex = (id: string, delta: number) => {
        const widget = widgets[id];
        const current = widget?.style?.zIndex ?? 1;
        const next = Math.max(1, current + delta);
        handleWidgetConfigUpdate(id, {
            style: {
                ...(widget.style || {}),
                zIndex: next,
            },
        });
    };

    const handleToggleWidgetLock = (id: string) => {
        const widget = widgets[id];
        const isLocked = !!widget?.style?.locked;
        handleWidgetConfigUpdate(id, {
            style: {
                ...(widget?.style || {}),
                locked: !isLocked,
            },
        });
    };

    const handleWidgetConfigUpdate = useCallback((id: string, changes: any) => {
        dispatch(updateWidget({ id, changes }));
        setHasUnsavedChanges(true);
    }, [dispatch]);

    const handleRemoveWidget = (id: string) => {
        dispatch(removeWidget(id));
        setHasUnsavedChanges(true);
    };

    const hexToRgba = (hex: string, alpha: number) => {
        const cleaned = hex.replace('#', '');
        const bigint = parseInt(cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const resolveWidgetBackgroundColor = useCallback((widget: Widget) => {
        if (widget.style?.customBg && widget.style?.bgColor) return widget.style.bgColor;
        const rawColor = String(widget.style?.bgColor || '').trim().toLowerCase();
        const isNeutralDefault = !rawColor || ['#fff', '#ffffff', '#f8fafc', '#0f172a', '#111827'].includes(rawColor);
        if (isNeutralDefault) {
            return isDark ? '#0f172a' : '#ffffff';
        }
        return widget.style?.bgColor || (isDark ? '#0f172a' : '#ffffff');
    }, [isDark]);

    const getFilterKey = useCallback((tableName: string, column: string) => `${tableName}::${column}`, []);

    const parseFilterSource = useCallback((tableName?: string, xAxis?: string) => {
        if (!tableName || !xAxis) return null;
        const dotIdx = xAxis.indexOf('.');
        return {
            tableName: dotIdx === -1 ? tableName : xAxis.slice(0, dotIdx),
            column: dotIdx === -1 ? xAxis : xAxis.slice(dotIdx + 1),
        };
    }, []);

    const extractFilterSourceFromWidget = useCallback((widget: Widget | undefined) => {
        if (!widget?.dataSource?.tableName || !widget?.dataSource?.xAxis) return null;
        return parseFilterSource(widget.dataSource.tableName, widget.dataSource.xAxis);
    }, [parseFilterSource]);

    const extractChartOptions = useCallback((widget: Widget | undefined) => {
        if (!widget?.chartConfig || !widget?.dataSource) return [] as (string | number)[];
        const config = widget.chartConfig || {};
        let options: (string | number)[] = [];
        if (widget.dataSource.chartType === 'pie' && Array.isArray(config.series) && config.series[0]?.data) {
            options = config.series[0].data.map((d: any) => d?.name).filter((v: any) => v != null);
        } else if (Array.isArray(config.xAxis?.data)) {
            options = config.xAxis.data.filter((v: any) => v != null);
        }
        return Array.from(new Set(options));
    }, []);

    const quoteIdent = useCallback((value: string) => `"${String(value || '').replace(/"/g, '""')}"`, []);
    const sqlValue = useCallback((value: string | number) => (
        typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : `'${String(value).replace(/'/g, "''")}'`
    ), []);

    const loadDistinctFilterOptions = useCallback(async (tableName: string, column: string) => {
        const relatedFilters = Object.values(activeFilters).filter((f: any) => (
            f.tableName === tableName
            && f.column !== column
            && Array.isArray(f.values)
            && f.values.length > 0
        ));
        const whereClause = relatedFilters.length > 0
            ? ` WHERE ${relatedFilters.map((f: any) => (
                `${quoteIdent(f.column)} IN (${f.values.map((v: string | number) => sqlValue(v)).join(', ')})`
            )).join(' AND ')}`
            : '';
        const sql = `
            SELECT ${quoteIdent(column)} AS value
            FROM ${quoteIdent(tableName)}
            ${whereClause}
            GROUP BY 1
            ORDER BY 1
            LIMIT 1200
        `;
        const db = getDuckDB();
        const conn = await db.connect();
        const result = await conn.query(sql);
        await conn.close();
        return result.toArray()
            .map((row: any) => row?.value)
            .filter((v: any) => v !== null && v !== undefined) as (string | number)[];
    }, [activeFilters, quoteIdent, sqlValue]);

    const mergeUniqueValues = useCallback((...lists: Array<(string | number)[]>) => {
        const out: (string | number)[] = [];
        const seen = new Set<string>();
        lists.flat().forEach((value) => {
            const key = `${typeof value}:${String(value)}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push(value);
        });
        return out;
    }, []);

    const openFilterPanel = useCallback(async (
        args: {
            widgetId: string;
            tableName: string;
            column: string;
            seedValue?: string | number | null;
            chartOptions?: (string | number)[];
        },
    ) => {
        const key = getFilterKey(args.tableName, args.column);
        const appliedValues: (string | number)[] = activeFilters[key]?.values || [];
        const draftValues = (
            filterPanel
            && filterPanel.tableName === args.tableName
            && filterPanel.column === args.column
        ) ? filterPanel.selected : null;
        const baseValues = draftValues ? [...draftValues] : [...appliedValues];
        const seedDefined = args.seedValue !== null && args.seedValue !== undefined;
        const selected = seedDefined
            ? (() => {
                const exists = baseValues.some((v) => String(v) === String(args.seedValue));
                return exists
                    ? baseValues.filter((v) => String(v) !== String(args.seedValue))
                    : [...baseValues, args.seedValue as string | number];
            })()
            : baseValues;

        const initialOptions = mergeUniqueValues(args.chartOptions || [], selected, appliedValues, seedDefined ? [args.seedValue as string | number] : []);
        setFilterPanel({
            widgetId: args.widgetId,
            tableName: args.tableName,
            column: args.column,
            options: initialOptions,
            selected,
            search: '',
            loading: true,
            error: null,
            dirty: seedDefined || !!draftValues,
        });

        const requestId = ++filterPanelRequestRef.current;
        try {
            const dbOptions = await loadDistinctFilterOptions(args.tableName, args.column);
            if (requestId !== filterPanelRequestRef.current) return;
            setFilterPanel((prev) => {
                if (!prev) return prev;
                if (prev.tableName !== args.tableName || prev.column !== args.column) return prev;
                return {
                    ...prev,
                    options: mergeUniqueValues(dbOptions, prev.options, prev.selected),
                    loading: false,
                    error: null,
                };
            });
        } catch (err: any) {
            if (requestId !== filterPanelRequestRef.current) return;
            setFilterPanel((prev) => {
                if (!prev) return prev;
                if (prev.tableName !== args.tableName || prev.column !== args.column) return prev;
                return {
                    ...prev,
                    loading: false,
                    error: err?.message || 'No se pudieron cargar opciones',
                };
            });
        }
    }, [activeFilters, filterPanel, getFilterKey, loadDistinctFilterOptions, mergeUniqueValues]);

    const openFilterPanelFromWidget = useCallback((widgetId: string) => {
        const widget = widgets[widgetId];
        const source = extractFilterSourceFromWidget(widget);
        if (!source) return;
        const chartOptions = extractChartOptions(widget);
        openFilterPanel({
            widgetId,
            tableName: source.tableName,
            column: source.column,
            chartOptions,
        });
    }, [widgets, extractFilterSourceFromWidget, extractChartOptions, openFilterPanel]);

    const handleChartFilterSelection = useCallback((widgetId: string, source: { tableName?: string; xAxis?: string }, value: string | number | null) => {
        const parsed = parseFilterSource(source.tableName, source.xAxis);
        if (!parsed) return;
        const widget = widgets[widgetId];
        const chartOptions = extractChartOptions(widget);
        openFilterPanel({
            widgetId,
            tableName: parsed.tableName,
            column: parsed.column,
            seedValue: value,
            chartOptions,
        });
    }, [widgets, parseFilterSource, extractChartOptions, openFilterPanel]);

    const hasSameSelection = useCallback((left: (string | number)[], right: (string | number)[]) => {
        if (left.length !== right.length) return false;
        const normalized = (values: (string | number)[]) => values.map((v) => `${typeof v}:${String(v)}`).sort();
        const a = normalized(left);
        const b = normalized(right);
        return a.every((value, idx) => value === b[idx]);
    }, []);

    const applyFilterPanelSelection = useCallback(() => {
        if (!filterPanel) return;
        if (filterPanel.selected.length === 0) {
            dispatch(clearFilter({ tableName: filterPanel.tableName, column: filterPanel.column }));
        } else {
            dispatch(setFilter({
                tableName: filterPanel.tableName,
                column: filterPanel.column,
                values: filterPanel.selected,
            }));
        }
        setFilterPanel((prev) => prev ? { ...prev, dirty: false } : prev);
    }, [dispatch, filterPanel]);

    useEffect(() => {
        if (!filterPanel || filterPanel.dirty) return;
        const key = getFilterKey(filterPanel.tableName, filterPanel.column);
        const applied: (string | number)[] = activeFilters[key]?.values || [];
        if (hasSameSelection(filterPanel.selected, applied)) return;
        setFilterPanel((prev) => prev ? { ...prev, selected: [...applied] } : prev);
    }, [activeFilters, filterPanel, getFilterKey, hasSameSelection]);

    const panelFilterKey = filterPanel ? getFilterKey(filterPanel.tableName, filterPanel.column) : '';
    const appliedPanelSelection: (string | number)[] = panelFilterKey ? (activeFilters[panelFilterKey]?.values || []) : [];
    const panelHasPendingChanges = filterPanel ? !hasSameSelection(filterPanel.selected, appliedPanelSelection) : false;

    const reportView = (
        <div className="relative w-full h-full flex flex-col">
            <div id="dv-report-toolbar" className={`h-12 backdrop-blur border-b flex items-center px-4 justify-between z-20 ${isDark ? 'bg-slate-900/85 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
                <div className="relative flex items-center gap-2">
                    <button 
                        id="dv-dashboard-switch"
                        onClick={() => setShowDashMenu(!showDashMenu)}
                        className={`flex items-center gap-2 font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                    >
                        <Layout size={16} className="text-cyan-600" />
                        {dashboardName}
                        <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    
                    {showDashMenu && (
                        <div className={`absolute top-full left-0 mt-2 w-64 rounded-xl shadow-xl border py-1 z-50 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                            {allDashboards.map(d => (
                                <button
                                    key={d.id}
                                    onClick={() => { handleSelectDashboard(d.id); setShowDashMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between group ${d.id === dashboardId ? (isDark ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-50 text-cyan-700') : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50')}`}
                                >
                                    <span className="truncate">{d.name}</span>
                                    {d.id === dashboardId && <div className="w-1.5 h-1.5 bg-cyan-600 rounded-full"></div>}
                                </button>
                            ))}
                            <div className={`border-t mt-1 pt-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                                <button 
                                    onClick={() => { handleCreateNew(); setShowDashMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isDark ? 'text-cyan-300 hover:bg-cyan-500/10' : 'text-cyan-700 hover:bg-cyan-50'}`}
                                >
                                    <Plus size={14} /> Nuevo tablero
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {Object.keys(activeFilters).length > 0 && (
                        <div className={`flex items-center gap-2 px-2 py-1 text-xs rounded-lg border ${isDark ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
                            <Filter size={12} />
                            <span>{Object.keys(activeFilters).length} filtros</span>
                            <button
                                onClick={handleClearAllFilters}
                                className={isDark ? 'text-cyan-300 hover:text-cyan-100' : 'text-cyan-600 hover:text-cyan-800'}
                            >
                                <XCircle size={12} />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setRefreshKey(prev => prev + 1)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Actualizar todo"
                    >
                        <RefreshCw size={12} /> Actualizar todo
                    </button>

                    {canEdit && (
                        <button 
                            onClick={() => dispatch(toggleEditMode())}
                            className={`px-3 py-1.5 text-sm rounded-lg ${isEditing ? (isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-cyan-100 text-cyan-700') : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')}`}
                        >
                            {isEditing ? 'Editando' : 'Ver'}
                        </button>
                    )}
                    
                    {canManage && (
                        <button 
                            onClick={() => setShowShare(true)}
                            className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Share2 size={14} /> Compartir
                        </button>
                    )}

                    {canManage && (
                        <button 
                            onClick={() => setShowRoles(true)}
                            className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Users size={14} /> Roles
                        </button>
                    )}

                    {canEdit && (
                        <button 
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-3 py-1.5 text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-400 hover:to-blue-500 flex items-center gap-1"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Guardar
                        </button>
                    )}
                </div>
            </div>

            <div id="dv-report-canvas" className="flex-1 overflow-auto bg-transparent p-4 relative" ref={containerRef}>
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 z-0 opacity-40 pointer-events-none"
                     style={{ backgroundImage: isDark ? 'radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)' : 'radial-gradient(rgba(100,116,139,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
                />

                {Object.values(widgets).map((widget: Widget, index) => {
                    const layout = getLayoutItem(widget.id, index);
                    const isLocked = !!widget.style?.locked;
                    const widgetOpacity = typeof widget.style?.bgOpacity === 'number' ? widget.style.bgOpacity : (isDark ? 0.95 : 1);
                    const isTransparentWidget = (
                        ((widget.type === 'text' || widget.type === 'image') && widgetOpacity <= 0.02)
                        || (widget.type === 'shape' && widget.style?.shapeType === 'icon')
                    );
                    const isCompactWidget = widget.type === 'text'
                        || widget.type === 'image'
                        || (widget.type === 'shape' && (widget.style?.shapeType === 'icon' || widget.style?.openMojiMode));
                    const contentPadding = widget.type === 'chart' || widget.type === 'table' ? 'p-2' : 'p-0';
                    return (
                        <Rnd
                            key={widget.id}
                            default={{
                                x: layout.x,
                                y: layout.y,
                                width: layout.w,
                                height: layout.h,
                            }}
                            bounds="parent"
                            minWidth={isCompactWidget ? 120 : 260}
                            minHeight={isCompactWidget ? 90 : 220}
                            dragHandleClassName="dv-widget-drag-handle"
                            enableResizing={isEditing && canEdit && !isLocked}
                            disableDragging={!(isEditing && canEdit) || isLocked}
                            onDragStop={(_, d) => {
                                if (!isEditing || !canEdit || isLocked) return;
                                updateLayoutPosition(widget.id, d.x, d.y);
                            }}
                            style={{ zIndex: widget.style?.zIndex ?? 1 }}
                            onResizeStop={(_, __, ref, ___, position) => {
                                if (!isEditing || !canEdit || isLocked) return;
                                const width = ref.offsetWidth;
                                const height = ref.offsetHeight;
                                updateLayoutPosition(widget.id, position.x, position.y);
                                updateLayoutSize(widget.id, width, height);
                            }}
                        >
                            <motion.div
                                className={`rounded-lg flex flex-col overflow-hidden group w-full h-full ${((widget.style?.bgOpacity ?? 1) > 0 && widget.type !== 'shape' && !isTransparentWidget) ? (isDark ? 'border border-slate-700 shadow-xl shadow-black/20' : 'border border-gray-200 shadow') : ''}`}
                                style={{
                                    backgroundColor: widget.type === 'shape' || isTransparentWidget
                                        ? 'transparent'
                                        : hexToRgba(resolveWidgetBackgroundColor(widget), widgetOpacity),
                                }}
                                initial={{ opacity: 0, y: 10, scale: 0.99 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.2 }}
                                whileHover={{ y: -2 }}
                            >
                                {isEditing && canEdit && (
                                    <div className={`absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex gap-1 rounded p-1 ${isDark ? 'bg-slate-900/90 shadow-black/30' : 'bg-white/80 shadow-sm'}`}>
                                        <button
                                            className={`p-1 rounded ${isDark ? (isLocked ? 'text-amber-300 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-800') : (isLocked ? 'text-amber-600 hover:bg-gray-100' : 'text-gray-500 hover:bg-gray-100')}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleWidgetLock(widget.id); }}
                                            title={isLocked ? 'Desbloquear widget' : 'Bloquear widget'}
                                        >
                                            {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
                                        </button>
                                        <div className={`cursor-move dv-widget-drag-handle p-1 rounded ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                                            <GripHorizontal size={14} />
                                        </div>
                                        <button
                                            className={`p-1 rounded ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
                                            onClick={(e) => { e.stopPropagation(); if (!isLocked) handleAdjustZIndex(widget.id, 1); }}
                                            disabled={isLocked}
                                            title="Traer al frente"
                                        >
                                            <ArrowUp size={14} />
                                        </button>
                                        <button
                                            className={`p-1 rounded ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
                                            onClick={(e) => { e.stopPropagation(); if (!isLocked) handleAdjustZIndex(widget.id, -1); }}
                                            disabled={isLocked}
                                            title="Enviar atras"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                        <button
                                            className={`p-1 rounded text-blue-500 ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}
                                            onClick={(e) => { e.stopPropagation(); if (!isLocked) setConfiguringWidgetId(widget.id); }}
                                            disabled={isLocked}
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            className={`p-1 rounded text-red-500 ${isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-50'}`}
                                            onClick={(e) => { e.stopPropagation(); if (!isLocked) handleRemoveWidget(widget.id); }}
                                            disabled={isLocked}
                                        >
                                            <div className="rotate-45 font-bold leading-none text-xs">+</div>
                                        </button>
                                    </div>
                                )}
                                
                                {widget.type !== 'shape' && (widget.style?.showTitle === true || (widget.style?.showTitle !== false && widget.type !== 'text' && widget.type !== 'image')) && widget.title && (
                                    <div className={`px-3 py-2 border-b font-semibold text-sm flex items-center gap-2 ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
                                        <div
                                            className="flex-1 truncate"
                                            style={{
                                                textAlign: widget.style?.titleAlign || 'left',
                                                color: widget.style?.textColor || (isDark ? '#e2e8f0' : '#374151'),
                                                fontFamily: widget.style?.fontFamily || undefined,
                                            }}
                                        >
                                            {widget.title}
                                        </div>
                                        {widget.dataSource?.tableName && widget.dataSource?.xAxis && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openFilterPanelFromWidget(widget.id); }}
                                                className={`p-1 rounded ${isDark ? 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                title="Filtros"
                                            >
                                                <Filter size={12} />
                                            </button>
                                        )}
                                    </div>
                                )}
                                
                                <div className={`flex-1 relative overflow-hidden ${contentPadding}`}>
                                    {widget.type === 'shape' ? (
                                        <DesignWidget style={widget.style} />
                                    ) : widget.type === 'table' ? (
                                        <TableWidget
                                            id={widget.id}
                                            dataSource={widget.dataSource}
                                            activeFilters={activeFilters}
                                            refreshKey={refreshKey}
                                            onConfigure={handleWidgetConfigUpdate}
                                            onFilterSelection={handleChartFilterSelection}
                                        />
                                    ) : (
                                        <ChartWidget 
                                            id={widget.id}
                                            type={widget.type} 
                                            config={widget.chartConfig} 
                                            isEditing={isEditing && canEdit && !isLocked}
                                            styleConfig={widget.style}
                                            dataSource={widget.dataSource}
                                            activeFilters={activeFilters}
                                            refreshKey={refreshKey}
                                            onFilterSelection={handleChartFilterSelection}
                                            onUpdate={handleWidgetConfigUpdate}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        </Rnd>
                    );
                })}
            </div>
            
            {/* Configurator Modal */}
            <AnimatePresence>
                {configuringWidgetId && canEdit && !widgets[configuringWidgetId]?.style?.locked && (
                    <motion.div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                        onClick={() => setConfiguringWidgetId(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className={`w-full mx-4 max-h-[90vh] rounded-2xl shadow-2xl overflow-auto ${
                                widgets[configuringWidgetId]?.type === 'text'
                                    ? 'max-w-4xl h-[740px]'
                                    : widgets[configuringWidgetId]?.type === 'image'
                                        ? 'max-w-5xl h-[720px]'
                                        : widgets[configuringWidgetId]?.type === 'shape'
                                            ? 'max-w-5xl h-[760px]'
                                            : 'max-w-5xl h-[650px]'
                            } ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
                            onClick={(e) => e.stopPropagation()}
                            initial={{ y: 16, scale: 0.98 }}
                            animate={{ y: 0, scale: 1 }}
                            exit={{ y: 16, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                        >
                            {widgets[configuringWidgetId]?.type === 'image' ? (
                                <ImageConfigurator widgetId={configuringWidgetId} onClose={() => setConfiguringWidgetId(null)} />
                            ) : widgets[configuringWidgetId]?.type === 'shape' ? (
                                <DesignConfigurator widgetId={configuringWidgetId} onClose={() => setConfiguringWidgetId(null)} />
                            ) : widgets[configuringWidgetId]?.type === 'text' ? (
                                <TextConfigurator widgetId={configuringWidgetId} onClose={() => setConfiguringWidgetId(null)} />
                            ) : (
                                <ChartConfigurator widgetId={configuringWidgetId} dashboardId={dashboardId} onClose={() => setConfiguringWidgetId(null)} />
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {unsavedPrompt && (
                <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className={`rounded-lg shadow-2xl w-full max-w-md p-6 border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Hay cambios sin guardar</h3>
                        <p className={`text-sm mb-4 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            Si continuas, se perderan los cambios no guardados en este tablero.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCancelUnsaved}
                                className={`px-4 py-2 text-sm rounded ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmUnsaved}
                                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                            >
                                Continuar sin guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {showShare && <ShareModal dashboardId={dashboardId} onClose={() => setShowShare(false)} />}
            {showRoles && <RolesModal dashboardId={dashboardId} onClose={() => setShowRoles(false)} />}

            {/* New Dashboard Modal */}
            {showNewDashboardModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className={`rounded-lg shadow-2xl w-full max-w-md p-6 border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Nuevo tablero</h3>
                        <p className={`text-sm mb-4 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            Escribe el nombre del nuevo tablero.
                        </p>
                        <input
                            type="text"
                            value={newDashboardName}
                            onChange={(e) => setNewDashboardName(e.target.value)}
                            className={`w-full border rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                            placeholder="Nombre del tablero"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowNewDashboardModal(false)}
                                className={`px-4 py-2 text-sm rounded ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    if (!newDashboardName.trim()) return;
                                    setShowNewDashboardModal(false);
                                    await createNewDashboardInternal(newDashboardName.trim());
                                }}
                                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Feedback Modal */}
            {feedbackModal && (
                <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className={`rounded-lg shadow-2xl w-full max-w-sm p-6 border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            {feedbackModal.type === 'success' ? 'Operacion completada' : 'Error'}
                        </h3>
                        <p className={`text-sm mb-4 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            {feedbackModal.message}
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setFeedbackModal(null)}
                                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Aceptar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {filterPanel && (
                    <motion.div
                        className={`fixed right-4 top-16 z-[72] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl ${
                            isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                        }`}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                    >
                        <div className={`flex items-center justify-between border-b px-3 py-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                <SlidersHorizontal size={14} /> Filtro rapido
                            </h3>
                            <button
                                onClick={() => setFilterPanel(null)}
                                className={`rounded px-2 py-1 text-xs ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="space-y-3 p-3">
                            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {filterPanel.tableName} · {filterPanel.column}
                            </div>

                            <input
                                value={filterPanel.search}
                                onChange={(e) => setFilterPanel((prev) => prev ? { ...prev, search: e.target.value } : prev)}
                                placeholder="Buscar valores..."
                                className={`w-full rounded border px-2 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                            />

                            <div className={`max-h-64 overflow-auto rounded border p-2 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                                {filterPanel.loading && (
                                    <div className={`mb-2 text-[11px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Cargando opciones...</div>
                                )}
                                {filterPanel.error && (
                                    <div className={`mb-2 text-[11px] ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{filterPanel.error}</div>
                                )}
                                {filterPanel.options
                                    .filter((opt) => String(opt).toLowerCase().includes(filterPanel.search.toLowerCase()))
                                    .map((opt) => {
                                        const checked = filterPanel.selected.some((v) => String(v) === String(opt));
                                        return (
                                            <label key={`${typeof opt}:${String(opt)}`} className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setFilterPanel((prev) => {
                                                            if (!prev) return prev;
                                                            const isActive = prev.selected.some((v) => String(v) === String(opt));
                                                            const selected = isActive
                                                                ? prev.selected.filter((v) => String(v) !== String(opt))
                                                                : [...prev.selected, opt];
                                                            return { ...prev, selected, dirty: true };
                                                        });
                                                    }}
                                                />
                                                <span className="truncate">{String(opt)}</span>
                                            </label>
                                        );
                                    })}
                                {!filterPanel.loading && filterPanel.options.length === 0 && (
                                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Sin opciones disponibles</div>
                                )}
                            </div>

                            <div className={`flex items-center justify-between text-[11px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                <span>{filterPanel.selected.length} seleccionados</span>
                                <span>{appliedPanelSelection.length} aplicados</span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setFilterPanel((prev) => prev ? { ...prev, selected: [], dirty: true } : prev)}
                                        className={`rounded px-2.5 py-1.5 text-xs ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Limpiar seleccion
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!filterPanel) return;
                                            dispatch(clearFilter({ tableName: filterPanel.tableName, column: filterPanel.column }));
                                            setFilterPanel((prev) => prev ? { ...prev, selected: [], dirty: false } : prev);
                                        }}
                                        className={`rounded px-2.5 py-1.5 text-xs ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Quitar filtro
                                    </button>
                                </div>
                                <button
                                    onClick={applyFilterPanelSelection}
                                    disabled={!panelHasPendingChanges}
                                    className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const dataView = (
        <div id="dv-data-view" className="dv-themed p-8 w-full h-full overflow-auto bg-transparent flex flex-col gap-6">
            <h1 className={`text-2xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Gestion de datos</h1>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full min-h-0">
                <div id="dv-dataset-manager" className="xl:col-span-1">
                    <DatasetManager dashboardId={dashboardId} />
                </div>
                <div id="dv-query-editor" className="xl:col-span-2 h-[600px] xl:h-auto">
                    <QueryEditor role={user?.is_master ? 'admin' : accessLevel} />
                </div>
            </div>
        </div>
    );

    return (
        <AppLayout rightSidebar={
            (location.pathname === '/' || location.pathname === '') && isEditing && canEdit ? (
                <VisualizationsPanel onAddWidget={(type, chartType) => handleAddWidget(type, chartType)} />
            ) : undefined
        } canAccessDataAndModel={canEdit} canInsertAiCharts={canEdit}>
            <Routes>
                <Route path="/" element={reportView} />
                <Route path="/data" element={canEdit ? dataView : <Navigate to="/" />} />
                <Route path="/model" element={canEdit ? <ModelView dashboardId={dashboardId} /> : <Navigate to="/" />} />
            </Routes>
        </AppLayout>
    );
};



