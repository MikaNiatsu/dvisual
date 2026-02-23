import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { getDuckDB } from '../lib/duckdb';
import { ensureDuckDBAndRestore } from '../lib/dataRestoration';
import { Database, Table as TableIcon, Key, MoreHorizontal, Sparkles, Link, X, Check, Calendar } from 'lucide-react';
import { useThemeMode } from '../lib/theme';

interface Column {
    name: string;
    type: string;
}

interface TableSchema {
    name: string;
    columns: Column[];
}

interface Position {
    x: number;
    y: number;
}

interface Relationship {
    table1: string;
    col1: string;
    table2: string;
    col2: string;
    type: 'suggested' | 'confirmed';
    cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export const ModelView = ({ dashboardId }: { dashboardId: string }) => {
    const dispatch = useDispatch();
    const reduxTables = useSelector((state: RootState) => state.datasets.tables);
    const [tables, setTables] = useState<TableSchema[]>([]);
    const [loading, setLoading] = useState(false);
    const [positions, setPositions] = useState<Record<string, Position>>({});
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [suggestedRelationships, setSuggestedRelationships] = useState<Relationship[]>([]);
    const [showRelationModal, setShowRelationModal] = useState(false);
    const [relationDraft, setRelationDraft] = useState<Relationship>({
        table1: '',
        col1: '',
        table2: '',
        col2: '',
        type: 'confirmed',
        cardinality: 'one-to-many'
    });
    const [showAssistant, setShowAssistant] = useState(false);
    const [showDateModal, setShowDateModal] = useState(false);
    const [dateRange, setDateRange] = useState({ start: new Date().getFullYear(), end: new Date().getFullYear() + 1 });
    const containerRef = useRef<HTMLDivElement>(null);
    const isHydratingRef = useRef(false);
    const theme = useThemeMode();
    const isDark = theme === 'dark';

    useEffect(() => {
        const init = async () => {
            await ensureDuckDBAndRestore(dispatch, dashboardId === 'default' ? undefined : dashboardId);
            await loadSchema(false);
        };
        init();
    }, [dispatch, dashboardId]);

    useEffect(() => {
        isHydratingRef.current = true;
        const stored = localStorage.getItem(`dvisual_relations_${dashboardId}`);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setRelationships(Array.isArray(parsed) ? parsed : []);
                return;
            } catch {
            }
        }
        setRelationships([]);
    }, [dashboardId]);

    useEffect(() => {
        loadSchema(false);
    }, [reduxTables.length]);

    const createDateTable = async () => {
        setLoading(true);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            
            await conn.query(`
                CREATE TABLE IF NOT EXISTS DimDate AS 
                WITH dates AS (
                    SELECT unnest(generate_series(DATE '${dateRange.start}-01-01', DATE '${dateRange.end}-12-31', INTERVAL 1 DAY)) as d
                )
                SELECT 
                    CAST(d AS DATE) as Date,
                    year(d) as Year, 
                    month(d) as Month, 
                    monthname(d) as MonthName, 
                    day(d) as Day,
                    quarter(d) as Quarter,
                    week(d) as WeekNumber,
                    dayofweek(d) as DayOfWeek
                FROM dates;
            `);
            
            await conn.close();
            setShowDateModal(false);
            await loadSchema();
        } catch (error) {
            console.error("Error creating date table:", error);
        } finally {
            setLoading(false);
        }
    };

    const detectRelationships = (schema: TableSchema[]) => {
        const found: Relationship[] = [];
        const normalize = (name: string) => name.toLowerCase().replace(/[\s\-]/g, '');
        
        for (let i = 0; i < schema.length; i++) {
            for (let j = i + 1; j < schema.length; j++) {
                const t1 = schema[i];
                const t2 = schema[j];
                
                t1.columns.forEach(c1 => {
                    t2.columns.forEach(c2 => {
                        const n1 = normalize(c1.name);
                        const n2 = normalize(c2.name);
                        const looksLikeId = n1.endsWith('id') || n2.endsWith('id') || n1.includes('id_') || n2.includes('id_');
                        if (n1 === n2 && looksLikeId) {
                            found.push({ table1: t1.name, col1: c1.name, table2: t2.name, col2: c2.name, type: 'suggested', cardinality: 'one-to-many' });
                        }
                    });
                });
            }
        }
        
        const unique = found.filter((r, index, self) =>
            index === self.findIndex((t) => (
                t.table1 === r.table1 && t.col1 === r.col1 && t.table2 === r.table2 && t.col2 === r.col2
            ))
        );
        const filtered = unique.filter(r => !relationships.some(existing =>
            (existing.table1 === r.table1 && existing.col1 === r.col1 && existing.table2 === r.table2 && existing.col2 === r.col2) ||
            (existing.table1 === r.table2 && existing.col1 === r.col2 && existing.table2 === r.table1 && existing.col2 === r.col1)
        ));
        
        setSuggestedRelationships(filtered);
    };

    const loadSchema = async (shouldEnsure = true) => {
        setLoading(true);
        try {
            if (shouldEnsure) {
                await ensureDuckDBAndRestore(dispatch, dashboardId === 'default' ? undefined : dashboardId);
            }
            const db = getDuckDB();
            const conn = await db.connect();
            
            // Get tables
            const tablesRes = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
            const tableNames = tablesRes.toArray().map((r: any) => r.table_name);

            const schemaData: TableSchema[] = [];
            const initialPos: Record<string, Position> = {};
            
            let colIndex = 0;
            let rowIndex = 0;
            const cardWidth = 220;
            const cardHeight = 300;
            const gap = 40;

            for (const name of tableNames) {
                const colsRes = await conn.query(`DESCRIBE "${name}"`);
                const cols = colsRes.toArray().map((r: any) => ({
                    name: r.column_name,
                    type: r.column_type
                }));
                schemaData.push({ name, columns: cols });

                // Simple grid layout
                initialPos[name] = {
                    x: 50 + colIndex * (cardWidth + gap),
                    y: 50 + rowIndex * (cardHeight + gap)
                };
                
                colIndex++;
                if (colIndex > 3) {
                    colIndex = 0;
                    rowIndex++;
                }
            }
            
            setTables(schemaData);
            setPositions(initialPos);
            detectRelationships(schemaData);
            await conn.close();
        } catch (e) {
            console.error("Failed to load schema", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isHydratingRef.current) {
            isHydratingRef.current = false;
            return;
        }
        localStorage.setItem(`dvisual_relations_${dashboardId}`, JSON.stringify(relationships));
    }, [relationships, dashboardId]);

    const handleMouseDown = (e: React.MouseEvent, tableName: string) => {
        if (!containerRef.current) return;
        
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        // Calculate offset within the card
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        setDragging(tableName);
        setDragOffset({ x: offsetX, y: offsetY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        
        // Calculate new position relative to container
        // We need to account for scroll as well if the container scrolls
        const x = e.clientX - containerRect.left - dragOffset.x + containerRef.current.scrollLeft;
        const y = e.clientY - containerRect.top - dragOffset.y + containerRef.current.scrollTop;

        setPositions(prev => ({
            ...prev,
            [dragging]: { x, y }
        }));
    };

    const handleMouseUp = () => {
        setDragging(null);
    };

    // Draw simple lines between same-named columns (implied relationships)
    const renderRelationships = () => {
        const all = relationships;
        return (
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
                {all.map((rel, idx) => {
                    const p1 = positions[rel.table1];
                    const p2 = positions[rel.table2];
                    if (!p1 || !p2) return null;
                    const start = { x: p1.x + 110, y: p1.y + 40 };
                    const end = { x: p2.x + 110, y: p2.y + 40 };
                    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                    const color = rel.type === 'confirmed' ? '#2563eb' : '#cbd5e1';
                    return (
                        <g key={idx}>
                            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth="2" />
                            <text x={mid.x} y={mid.y - 4} textAnchor="middle" fontSize="10" fill={color}>
                                {rel.cardinality === 'many-to-many' ? 'N:M' : rel.cardinality === 'one-to-one' ? '1:1' : '1:N'}
                            </text>
                        </g>
                    );
                })}
            </svg>
        );
    };

    if (loading) return (
        <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-gray-50'}` }>
            <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>Cargando modelo de datos...</span>
            </div>
        </div>
    );

    return (
        <div id="dv-model-view" className={`dv-themed flex flex-col h-full relative overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-50'}` }>
            {/* Header */}
            <div id="dv-model-toolbar" className={`h-14 border-b px-4 flex items-center justify-between z-10 shadow-sm ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}` }>
                <div className="flex items-center gap-2">
                    <Database className="text-blue-600" size={20} />
                    <h2 className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Modelo de datos</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}` }>
                        {tables.length} Tablas
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowDateModal(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors shadow-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    >
                        <Calendar size={16} className="text-orange-500" />
                        <span>Tabla de fechas</span>
                    </button>
                    <button 
                        id="dv-model-assistant-toggle"
                        onClick={() => setShowAssistant(!showAssistant)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors shadow-sm ${
                            showAssistant 
                                ? (isDark ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300' : 'bg-blue-50 border-blue-200 text-blue-700') 
                                : (isDark ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                        }`}
                    >
                        <Sparkles size={16} className={showAssistant ? "text-blue-600" : "text-yellow-500"} />
                        <span>{showAssistant ? 'Ocultar asistente' : 'Asistente de relaciones'}</span>
                    </button>
                    <button
                        onClick={() => {
                            setRelationDraft({ table1: '', col1: '', table2: '', col2: '', type: 'confirmed', cardinality: 'one-to-many' });
                            setShowRelationModal(true);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors shadow-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    >
                        <Link size={16} className="text-blue-500" />
                        <span>Nueva relacion</span>
                    </button>
                    <button 
                        onClick={() => { void loadSchema(); }} 
                        disabled={loading}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'}` }
                        title="Actualizar esquema"
                    >
                        <div className={`${loading ? 'animate-spin' : ''}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        </div>
                    </button>
                </div>
            </div>

            {/* Date Table Modal */}
            {showDateModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className={`rounded-xl shadow-2xl w-80 p-5 border animate-in fade-in zoom-in duration-200 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className={`font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                <Calendar size={18} className="text-orange-500"/> 
                                Nueva tabla de fechas
                            </h3>
                            <button onClick={() => setShowDateModal(false)} className={isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Anio inicial</label>
                                    <input 
                                        type="number" 
                                        value={dateRange.start}
                                        onChange={e => setDateRange({...dateRange, start: parseInt(e.target.value)})}
                                        className={`w-full border rounded px-2 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
                                    />
                                </div>
                                <div>
                                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Anio final</label>
                                    <input 
                                        type="number" 
                                        value={dateRange.end}
                                        onChange={e => setDateRange({...dateRange, end: parseInt(e.target.value)})}
                                        className={`w-full border rounded px-2 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
                                    />
                                </div>
                            </div>
                            <div className={`p-3 rounded border text-xs ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                Crea una tabla "DimDate" con columnas Date, Year, Month, Quarter y Week.
                            </div>
                            <button 
                                onClick={createDateTable}
                                disabled={loading}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'Generar tabla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRelationModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]" onClick={() => setShowRelationModal(false)}>
                    <div className={`rounded-xl shadow-2xl w-full max-w-xl p-6 border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                <Link size={16} className="text-blue-500" />
                                Nueva relacion
                            </h3>
                            <button onClick={() => setShowRelationModal(false)} className={isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Tabla origen</label>
                                <select
                                    value={relationDraft.table1}
                                    onChange={(e) => {
                                        setRelationDraft({ ...relationDraft, table1: e.target.value, col1: '' });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="">Selecciona tabla</option>
                                    {tables.map(t => (
                                        <option key={t.name} value={t.name}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Columna origen</label>
                                <select
                                    value={relationDraft.col1}
                                    onChange={(e) => setRelationDraft({ ...relationDraft, col1: e.target.value })}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="">Selecciona columna</option>
                                    {(tables.find(t => t.name === relationDraft.table1)?.columns || []).map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Tabla destino</label>
                                <select
                                    value={relationDraft.table2}
                                    onChange={(e) => {
                                        setRelationDraft({ ...relationDraft, table2: e.target.value, col2: '' });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="">Selecciona tabla</option>
                                    {tables.map(t => (
                                        <option key={t.name} value={t.name}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Columna destino</label>
                                <select
                                    value={relationDraft.col2}
                                    onChange={(e) => setRelationDraft({ ...relationDraft, col2: e.target.value })}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="">Selecciona columna</option>
                                    {(tables.find(t => t.name === relationDraft.table2)?.columns || []).map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Cardinalidad</label>
                                <select
                                    value={relationDraft.cardinality}
                                    onChange={(e) => setRelationDraft({ ...relationDraft, cardinality: e.target.value as Relationship['cardinality'] })}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="one-to-one">1:1</option>
                                    <option value="one-to-many">1:N</option>
                                    <option value="many-to-many">N:M</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
                                <select
                                    value={relationDraft.type}
                                    onChange={(e) => setRelationDraft({ ...relationDraft, type: e.target.value as Relationship['type'] })}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="confirmed">Confirmada</option>
                                    <option value="suggested">Sugerida</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowRelationModal(false)}
                                className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (!relationDraft.table1 || !relationDraft.col1 || !relationDraft.table2 || !relationDraft.col2) return;
                                    setRelationships(prev => {
                                        const exists = prev.some(existing =>
                                            (existing.table1 === relationDraft.table1 && existing.col1 === relationDraft.col1 && existing.table2 === relationDraft.table2 && existing.col2 === relationDraft.col2) ||
                                            (existing.table1 === relationDraft.table2 && existing.col1 === relationDraft.col2 && existing.table2 === relationDraft.table1 && existing.col2 === relationDraft.col1)
                                        );
                                        if (exists) return prev;
                                        return [...prev, { ...relationDraft }];
                                    });
                                    setShowRelationModal(false);
                                }}
                                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Canvas */}
            <div 
                id="dv-model-canvas"
                ref={containerRef}
                className="flex-1 relative overflow-auto cursor-grab active:cursor-grabbing"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ backgroundImage: isDark ? 'radial-gradient(rgba(148,163,184,0.25) 1px, transparent 1px)' : 'radial-gradient(#ddd 1px, transparent 1px)', backgroundSize: '20px 20px' }}
            >
                {showAssistant && (
                    <div className={`absolute top-4 right-4 z-20 w-80 rounded-lg shadow-lg border p-4 text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <Sparkles size={16} className="text-blue-500" />
                            Guia rapida de relaciones
                        </h3>
                        <p className="mb-1">1. Verifica que tus tablas tengan columnas de tipo ID (id, user_id, etc.).</p>
                        <p className="mb-1">2. Carga todas las tablas relevantes desde la vista de datos.</p>
                        <p className="mb-1">3. Vuelve aqui y pulsa \"Actualizar esquema\" para actualizar el modelo.</p>
                        <p className="mb-1">4. Las lineas indican relaciones confirmadas entre tablas.</p>
                        <p className="mb-1">5. Usa estas relaciones al construir consultas y graficos para evitar duplicados.</p>
                        <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Tip: usa una tabla de fechas (DimDate) y relaciona su columna Date con tus columnas de fecha para facilitar filtros por tiempo.
                        </p>
                        <div className={`mt-3 border-t pt-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <h4 className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Sugerencias detectadas</h4>
                            {suggestedRelationships.length === 0 && (
                                <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sin sugerencias nuevas</div>
                            )}
                            <div className="space-y-2">
                                {suggestedRelationships.map((rel, idx) => (
                                    <div key={`${rel.table1}-${rel.col1}-${rel.table2}-${idx}`} className={`flex items-center justify-between gap-2 text-xs border rounded px-2 py-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                        <span className="truncate">{`${rel.table1}.${rel.col1} -> ${rel.table2}.${rel.col2}`}</span>
                                        <button
                                            onClick={() => {
                                                setRelationships(prev => {
                                                    const exists = prev.some(existing =>
                                                        (existing.table1 === rel.table1 && existing.col1 === rel.col1 && existing.table2 === rel.table2 && existing.col2 === rel.col2) ||
                                                        (existing.table1 === rel.table2 && existing.col1 === rel.col2 && existing.table2 === rel.table1 && existing.col2 === rel.col1)
                                                    );
                                                    if (exists) return prev;
                                                    return [...prev, { ...rel, type: 'confirmed' }];
                                                });
                                                setSuggestedRelationships(prev => prev.filter((_, i) => i !== idx));
                                            }}
                                            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                        >
                                            Confirmar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {/* SVG Layer for lines */}
                {/* We need a container that grows with scroll content, or use absolute positioning carefully */}
                <div className="absolute inset-0 w-[2000px] h-[2000px]">
                     {renderRelationships()}

                    {tables.map(table => {
                        const pos = positions[table.name] || { x: 0, y: 0 };
                        return (
                            <div
                                key={table.name}
                                className={`absolute w-[220px] rounded-md shadow-md border flex flex-col z-10 transition-shadow select-none ${isDark ? 'bg-slate-900 border-slate-700 hover:shadow-black/40' : 'bg-white border-gray-200 hover:shadow-xl'}`}
                                style={{ 
                                    left: pos.x, 
                                    top: pos.y,
                                    height: 'auto',
                                    maxHeight: '400px'
                                }}
                                onMouseDown={(e) => handleMouseDown(e, table.name)}
                            >
                                {/* Header */}
                                <div className="bg-blue-600 px-3 py-2 rounded-t-md flex items-center justify-between cursor-move">
                                    <span className="font-bold text-white text-sm truncate" title={table.name}>{table.name}</span>
                                    <MoreHorizontal size={14} className="text-blue-200" />
                                </div>
                                
                                {/* Columns */}
                                <div className={`flex-1 overflow-y-auto py-1 rounded-b-md ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                                    {table.columns.map((col) => (
                                        <div key={col.name} className={`px-3 py-1.5 flex items-center justify-between group ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}>
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                {/* Icon based on type or name */}
                                                {(col.name === 'id' || col.name.endsWith('_id')) ? (
                                                    <Key size={12} className={`min-w-[12px] ${isDark ? 'text-slate-400' : 'text-gray-400'}`} />
                                                ) : (
                                                    <div className={`w-3 h-3 rounded-full border bg-transparent min-w-[12px] ${isDark ? 'border-slate-600' : 'border-gray-300'}`}></div>
                                                )}
                                                <span className={`text-sm truncate ${isDark ? 'text-slate-200' : 'text-gray-700'}`} title={col.name}>{col.name}</span>
                                            </div>
                                            <span className={`text-[10px] uppercase hidden group-hover:block ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>{col.type}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

