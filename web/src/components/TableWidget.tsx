import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { getDuckDB } from '../lib/duckdb';
import { useThemeMode } from '../lib/theme';

interface TableWidgetProps {
    id?: string;
    dataSource?: {
        tableName?: string;
        extraFields?: {
            tableColumns?: string[];
        };
    };
    activeFilters?: Record<string, { tableName: string; column: string; values: (string | number)[] }>;
    onConfigure?: (widgetId: string, changes: any) => void;
    onFilterSelection?: (widgetId: string, source: { tableName?: string; xAxis?: string }, value: string | number | null) => void;
    refreshKey?: number;
}

const TableWidgetComponent: React.FC<TableWidgetProps> = ({ id, dataSource, activeFilters, onConfigure, onFilterSelection, refreshKey }) => {
    const tables = useSelector((state: RootState) => state.datasets.tables);
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const [selectedTable, setSelectedTable] = useState<string>(dataSource?.tableName || '');
    const [selectedColumns, setSelectedColumns] = useState<string[]>(dataSource?.extraFields?.tableColumns || []);
    const [rows, setRows] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

    const tableDef = useMemo(
        () => tables.find((t: any) => t.name === selectedTable),
        [tables, selectedTable]
    );

    useEffect(() => {
        setSelectedTable(dataSource?.tableName || '');
        setSelectedColumns(dataSource?.extraFields?.tableColumns || []);
    }, [dataSource]);

    useEffect(() => {
        const load = async () => {
            if (!selectedTable) return;
            setIsLoading(true);
            setError(null);
            try {
                const db = getDuckDB();
                const conn = await db.connect();

                let sql = `SELECT * FROM "${selectedTable}"`;
                
                if (activeFilters) {
                    const related = Object.values(activeFilters).filter(f => f.tableName === selectedTable && f.column && f.values.length > 0);
                    if (related.length > 0) {
                        const whereClauses = related.map(f => {
                            const values = f.values.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(',');
                            return `"${f.column}" IN (${values})`;
                        });
                        sql += ` WHERE ${whereClauses.join(' AND ')}`;
                    }
                }
                
                sql += ` LIMIT 500`;

                const result = await conn.query(sql);
                const allRows = result.toArray().map((r: any) => ({ ...r }));
                await conn.close();

                setRows(allRows);
            } catch (e: any) {
                console.error(e);
                setError(e.message || 'Error cargando datos');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [selectedTable, activeFilters, refreshKey]);

    const visibleColumns = useMemo(() => {
        if (selectedColumns.length > 0) return selectedColumns;
        if (tableDef?.columns) return tableDef.columns.map((c: any) => c.name);
        if (rows.length > 0) return Object.keys(rows[0]);
        return [];
    }, [selectedColumns, tableDef, rows]);

    const filteredRows = useMemo(() => {
        if (!rows.length) return rows;
        const activeFilters = Object.entries(columnFilters).filter(([, v]) => v && v.trim() !== '');
        if (activeFilters.length === 0) return rows;
        return rows.filter(row =>
            activeFilters.every(([col, value]) => {
                const cell = row[col];
                if (cell == null) return false;
                return String(cell).toLowerCase().includes(String(value).toLowerCase());
            })
        );
    }, [rows, columnFilters]);

    const handleColumnFilterChange = (col: string, value: string) => {
        setColumnFilters(prev => ({ ...prev, [col]: value }));
    };

    const handleApplyConfig = () => {
        if (!onConfigure || !selectedTable || !id) return;
        onConfigure(id, {
            dataSource: {
                ...(dataSource || {}),
                tableName: selectedTable,
                extraFields: {
                    ...(dataSource?.extraFields || {}),
                    tableColumns: selectedColumns,
                },
            }
        });
    };

    const handleRowClick = (row: any) => {
        if (!onFilterSelection || !selectedTable || !id) return;
        const related = activeFilters
            ? Object.values(activeFilters).find(f => f.tableName === selectedTable)
            : null;
        if (!related || !related.column) return;
        const value = row[related.column];
        if (value == null) return;
        onFilterSelection(id, { tableName: selectedTable, xAxis: related.column }, value);
    };

    if (!selectedTable || !tableDef) {
        return (
            <div className={`w-full h-full flex flex-col p-3 gap-2 text-xs ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                <div className="font-semibold text-sm">Configurar tabla</div>
                <label className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Selecciona una tabla de datos</label>
                <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className={`rounded px-2 py-1 text-xs ${isDark ? 'border border-slate-700 bg-slate-900 text-slate-100' : 'border border-gray-300 bg-white text-slate-900'}`}
                >
                    <option value="">-- Seleccionar tabla --</option>
                    {tables.map((t: any) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                </select>
                <button
                    onClick={handleApplyConfig}
                    disabled={!selectedTable}
                    className="mt-2 px-2 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
                >
                    Aplicar
                </button>
            </div>
        );
    }

    return (
        <div className={`w-full h-full flex flex-col text-xs ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
            <div className={`flex items-center justify-between px-2 py-1 border-b ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                <span className="font-semibold truncate">{selectedTable}</span>
                {isLoading && <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Cargando...</span>}
            </div>
            {error && (
                <div className="px-2 py-1 text-[11px] text-red-600 bg-red-50 border-b border-red-200">
                    {error}
                </div>
            )}
            <div className="flex-1 overflow-auto">
                <table className="min-w-full border-collapse text-[11px]">
                    <thead>
                        <tr className={`${isDark ? 'bg-slate-900 border-b border-slate-700' : 'bg-gray-100 border-b border-gray-200'}`}>
                            {visibleColumns.map(col => (
                                <th key={col} className={`px-2 py-1 text-left whitespace-nowrap ${isDark ? 'border-r border-slate-700' : 'border-r border-gray-200'}`}>
                                    <div className="flex flex-col gap-1">
                                        <span className="font-semibold">{col}</span>
                                        <input
                                            value={columnFilters[col] || ''}
                                            onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                                            placeholder="Filtrar..."
                                            className={`rounded px-1 py-0.5 text-[10px] ${isDark ? 'border border-slate-600 bg-slate-950 text-slate-100' : 'border border-gray-300 bg-white text-slate-900'}`}
                                        />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, idx) => (
                            <tr
                                key={idx}
                                className={`${isDark ? 'border-b border-slate-800 hover:bg-cyan-500/10' : 'border-b border-gray-100 hover:bg-blue-50'} cursor-pointer`}
                                onClick={() => handleRowClick(row)}
                            >
                                {visibleColumns.map(col => (
                                    <td key={col} className={`px-2 py-1 whitespace-nowrap max-w-xs truncate ${isDark ? 'border-r border-slate-800 text-slate-200' : 'border-r border-gray-50'}`}>
                                        {row[col] != null ? String(row[col]) : ''}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {filteredRows.length === 0 && !isLoading && (
                            <tr>
                                <td colSpan={visibleColumns.length} className={`px-2 py-4 text-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                    Sin datos que mostrar
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const TableWidget = React.memo(TableWidgetComponent);
