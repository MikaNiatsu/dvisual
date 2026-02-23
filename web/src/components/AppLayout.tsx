import React, { useState, useEffect, useMemo } from 'react';
import { LayoutGrid, Database, Network, Shield, LogOut, SunMedium, Moon, Compass } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { logout } from '../store/authSlice';
import { clearTables, setDuckDBReady } from '../store/datasetsSlice';
import { clearAllFilters } from '../store/filtersSlice';
import { initDuckDB } from '../lib/duckdb';
import { AICopilot } from './AICopilot';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { motion } from 'framer-motion';

interface AppLayoutProps {
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  canAccessDataAndModel?: boolean;
  canInsertAiCharts?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  rightSidebar,
  canAccessDataAndModel = true,
  canInsertAiCharts = true,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showGuideMenu, setShowGuideMenu] = useState(false);
  const [isTourRunning, setIsTourRunning] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('dvisual_theme');
    return stored === 'dark' || stored === 'light' ? stored : 'dark';
  });

  const isActive = (path: string) => location.pathname === path;
  const isDark = theme === 'dark';

  type TourKind = 'context' | 'general' | 'report' | 'data' | 'model' | 'admin' | 'charts';
  type TourStep = {
    element: string;
    popover: {
      title: string;
      description: string;
      side: 'top' | 'bottom' | 'left' | 'right';
      align: 'start' | 'center' | 'end';
    };
  };

  const handleLogout = async () => {
    try {
      const db = await initDuckDB();
      const conn = await db.connect();
      const tablesRes = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
      const existing = tablesRes.toArray().map((r: any) => r.table_name);
      for (const name of existing) {
        await conn.query(`DROP TABLE IF EXISTS "${name}"`);
      }
      await conn.close();
    } catch {
      // ignore cleanup errors and continue logout
    }

    dispatch(clearTables());
    dispatch(setDuckDBReady(false));
    dispatch(clearAllFilters());
    dispatch(logout());
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getContextTour = (): Exclude<TourKind, 'context' | 'general' | 'charts'> => {
    if (location.pathname === '/data') return 'data';
    if (location.pathname === '/model') return 'model';
    if (location.pathname === '/admin') return 'admin';
    return 'report';
  };

  const buildTourSteps = (kind: TourKind): TourStep[] => {
    const base: TourStep[] = [
      {
        element: '#dv-ribbon',
        popover: {
          title: 'Navegacion principal',
          description: 'Aqui estan los accesos clave.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#dv-ai-button',
        popover: {
          title: 'Copiloto',
          description: 'Consulta datos y crea visualizaciones con IA.',
          side: 'top',
          align: 'end',
        },
      },
    ];

    const byKind: Record<Exclude<TourKind, 'context'>, TourStep[]> = {
      general: [
        ...base,
        {
          element: '#dv-nav-report',
          popover: {
            title: 'Reporte',
            description: 'Vista principal de dashboard.',
            side: 'right',
            align: 'center',
          },
        },
        {
          element: '#dv-nav-data',
          popover: {
            title: 'Datos',
            description: 'Carga y transforma tus fuentes.',
            side: 'right',
            align: 'center',
          },
        },
        {
          element: '#dv-nav-model',
          popover: {
            title: 'Modelo',
            description: 'Configura relaciones entre tablas.',
            side: 'right',
            align: 'center',
          },
        },
      ],
      report: [
        {
          element: '#dv-report-toolbar',
          popover: {
            title: 'Barra del reporte',
            description: 'Gestion de tableros, filtros globales y guardado.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#dv-dashboard-switch',
          popover: {
            title: 'Selector de tableros',
            description: 'Cambia rapido entre tableros y crea nuevos.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#dv-report-canvas',
          popover: {
            title: 'Canvas',
            description: 'Aqui arrastras, editas y filtras widgets.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '#dv-visualizations-panel',
          popover: {
            title: 'Visualizaciones',
            description: 'Agrega graficas, tablas, texto e imagenes.',
            side: 'left',
            align: 'center',
          },
        },
        ...base,
      ],
      charts: [
        {
          element: '#dv-visualizations-panel',
          popover: {
            title: 'Panel de visualizaciones',
            description: 'Empieza agregando un widget de tipo grafica.',
            side: 'left',
            align: 'center',
          },
        },
        {
          element: '#dv-chart-configurator',
          popover: {
            title: 'Configurador de graficas',
            description: 'Define tabla, eje X, multiples series Y y agregaciones.',
            side: 'left',
            align: 'center',
          },
        },
        {
          element: '#dv-report-canvas',
          popover: {
            title: 'Interaccion',
            description: 'Los clicks en graficas pueden activar filtros cruzados.',
            side: 'top',
            align: 'center',
          },
        },
      ],
      data: [
        {
          element: '#dv-data-view',
          popover: {
            title: 'Gestion de datos',
            description: 'Flujo para cargar datos y validarlos.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '#dv-dataset-manager',
          popover: {
            title: 'Carga de datasets',
            description: 'Sube CSV, Excel o Parquet y define columnas.',
            side: 'right',
            align: 'center',
          },
        },
        {
          element: '#dv-query-editor',
          popover: {
            title: 'Editor SQL',
            description: 'Explora tablas, ejecuta SQL y exporta resultados.',
            side: 'left',
            align: 'center',
          },
        },
        ...base,
      ],
      model: [
        {
          element: '#dv-model-toolbar',
          popover: {
            title: 'Toolbar del modelo',
            description: 'Crea relaciones y tabla de fechas.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#dv-model-canvas',
          popover: {
            title: 'Lienzo del modelo',
            description: 'Arrastra tablas y revisa relaciones.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '#dv-model-assistant-toggle',
          popover: {
            title: 'Asistente',
            description: 'Muestra sugerencias para confirmar relaciones.',
            side: 'bottom',
            align: 'center',
          },
        },
        ...base,
      ],
      admin: [
        {
          element: '#dv-admin-page',
          popover: {
            title: 'Panel admin',
            description: 'Administra usuarios, roles y reglas IP.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '#dv-admin-tabs',
          popover: {
            title: 'Secciones',
            description: 'Navega entre Usuarios, Roles e IPs.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#dv-admin-user-list',
          popover: {
            title: 'Usuarios',
            description: 'Consulta los usuarios existentes.',
            side: 'left',
            align: 'center',
          },
        },
        {
          element: '#dv-admin-role-list',
          popover: {
            title: 'Roles globales',
            description: 'Revisa permisos y miembros por rol.',
            side: 'left',
            align: 'center',
          },
        },
        {
          element: '#dv-admin-ip-list',
          popover: {
            title: 'IPs validas',
            description: 'Gestiona patrones IP y niveles de acceso.',
            side: 'left',
            align: 'center',
          },
        },
      ],
    };

    if (kind === 'context') {
      return byKind[getContextTour()];
    }
    return byKind[kind as Exclude<TourKind, 'context'>];
  };

  const runTour = (kind: TourKind = 'context') => {
    if (isTourRunning) return;
    setShowGuideMenu(false);

    const rawSteps = buildTourSteps(kind);
    const steps = rawSteps.filter((step) => typeof document !== 'undefined' && document.querySelector(step.element));
    if (steps.length === 0) return;

    setIsTourRunning(true);

    const drv = driver({
      showProgress: true,
      overlayOpacity: 0.6,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Cerrar',
      steps,
      onDestroyed: () => setIsTourRunning(false),
    });

    drv.drive();
  };

  const availableGuides = useMemo(() => {
    const guides: Array<{ key: TourKind; label: string }> = [
      { key: 'context', label: 'Guia contextual' },
      { key: 'general', label: 'Guia general' },
    ];
    if (location.pathname === '/' || location.pathname === '') {
      guides.push({ key: 'report', label: 'Guia reporte' });
      guides.push({ key: 'charts', label: 'Guia graficas' });
    }
    if (location.pathname === '/data') guides.push({ key: 'data', label: 'Guia datos' });
    if (location.pathname === '/model') guides.push({ key: 'model', label: 'Guia modelo' });
    if (location.pathname === '/admin') guides.push({ key: 'admin', label: 'Guia admin' });
    return guides;
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const key = `dvisual_tour_seen_${user.username || 'anon'}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      runTour('context');
    }
  }, [user, location.pathname]);

  useEffect(() => {
    localStorage.setItem('dvisual_theme', theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dvisual-theme-change', { detail: theme }));
    }
  }, [theme]);

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden ${
        isDark
          ? 'bg-slate-950 text-slate-100'
          : 'bg-[linear-gradient(140deg,#f1f5f9_0%,#dbeafe_45%,#f8fafc_100%)] text-slate-900'
      }`}
    >
      <header
        id="dv-ribbon"
        className={`absolute top-0 left-0 z-50 h-14 w-full border-b backdrop-blur-xl ${
          isDark ? 'border-slate-800/90 bg-slate-900/80' : 'border-slate-200/80 bg-white/75'
        }`}
      >
        <div className="mx-auto flex h-full w-full items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md" />
              <div className={`text-lg font-semibold tracking-tight ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>DVisual</div>
            </div>

            <div className={`hidden items-center gap-1 text-sm md:flex ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              <button className="rounded-lg px-3 py-1.5 transition-colors hover:bg-white/20">Archivo</button>
              <button className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-cyan-600">Inicio</button>
              <button className="rounded-lg px-3 py-1.5 transition-colors hover:bg-white/20">Insertar</button>
              <button className="rounded-lg px-3 py-1.5 transition-colors hover:bg-white/20">Modelado</button>
              <button className="rounded-lg px-3 py-1.5 transition-colors hover:bg-white/20">Vista</button>
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setShowGuideMenu((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Compass size={14} />
              Guia
            </button>

            {showGuideMenu && (
              <div
                className={`absolute right-0 top-11 z-50 w-52 rounded-xl border p-2 shadow-xl ${
                  isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                }`}
              >
                <div className={`mb-2 px-1 text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>DriverJS</div>
                {availableGuides.map((guide) => (
                  <button
                    key={guide.key}
                    onClick={() => runTour(guide.key)}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {guide.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isDark ? <SunMedium size={14} /> : <Moon size={14} />}
              {isDark ? 'Claro' : 'Oscuro'}
            </button>

            {user?.is_master && (
              <Link
                to="/admin"
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  isDark
                    ? 'border-violet-700/50 bg-violet-900/20 text-violet-200 hover:bg-violet-900/40'
                    : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
              >
                <Shield size={14} />
                Admin
              </Link>
            )}

            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isDark ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-cyan-600 text-white hover:bg-cyan-700'
              }`}
            >
              {user?.username?.substring(0, 2).toUpperCase() || 'US'}
            </button>

            {showUserMenu && (
              <div
                className={`absolute right-0 top-11 w-52 rounded-xl border p-2 shadow-xl ${
                  isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                }`}
              >
                <div className={`mb-2 rounded-lg p-2 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <p className="text-sm font-semibold">{user?.username}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user?.is_master ? 'Administrador' : 'Usuario'}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50/20"
                >
                  <LogOut size={14} />
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="relative mt-14 flex h-[calc(100vh-56px)] w-full flex-1">
        <aside
          className={`z-40 m-3 flex w-16 flex-col items-center gap-3 rounded-2xl border p-2 shadow-lg ${
            isDark ? 'border-slate-800 bg-slate-900/85' : 'border-white/70 bg-white/75 backdrop-blur'
          }`}
        >
          <Link
            id="dv-nav-report"
            to="/"
            className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              isActive('/')
                ? isDark
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-cyan-100 text-cyan-700'
                : isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Vista de informe"
          >
            <LayoutGrid size={20} />
          </Link>

          {canAccessDataAndModel && (
            <Link
              id="dv-nav-data"
              to="/data"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive('/data')
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-cyan-100 text-cyan-700'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Vista de datos"
            >
              <Database size={20} />
            </Link>
          )}

          {canAccessDataAndModel && (
            <Link
              id="dv-nav-model"
              to="/model"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive('/model')
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-cyan-100 text-cyan-700'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Vista de modelo"
            >
              <Network size={20} />
            </Link>
          )}
        </aside>

        <main className="relative flex-1 p-3 pl-0">
          <div
            className={`relative h-full overflow-hidden rounded-2xl border shadow-xl ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-white/70 bg-white/80 backdrop-blur'
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-0 ${
                isDark
                  ? 'bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.08)_0,transparent_55%)]'
                  : 'bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.08)_0,transparent_55%)]'
              }`}
            />
            <motion.div
              className="relative h-full w-full"
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </div>
        </main>

        {rightSidebar && (
          <aside
            className={`m-3 ml-0 flex w-[21rem] flex-col overflow-hidden rounded-2xl border shadow-xl ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-white/70 bg-white/85 backdrop-blur'
            }`}
          >
            {rightSidebar}
          </aside>
        )}

        <div id="dv-ai-button" className="fixed bottom-5 right-5 z-50">
          <AICopilot canInsertToDashboard={canInsertAiCharts} />
        </div>
      </div>
    </div>
  );
};
