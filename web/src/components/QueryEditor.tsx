import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Play, Download, Trash2, ShieldAlert, Maximize2, X, Table, FileType, Database, ChevronRight, ChevronDown, Search, Filter } from 'lucide-react';
import { getDuckDB } from '../lib/duckdb';
import * as XLSX from 'xlsx';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'; 
import { useThemeMode } from '../lib/theme';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

// Register AG Grid Modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface QueryEditorProps {
    role?: string;
}

interface ColumnInfo {
    name: string;
    type: string;
}

interface TableSchema {
    name: string;
    columns: ColumnInfo[];
}

const SchemaSidebar = ({ onInsert, isDark }: { onInsert: (text: string) => void; isDark: boolean }) => {
    const [tables, setTables] = useState<TableSchema[]>([]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadSchema();
    }, []);

    const loadSchema = async () => {
        setLoading(true);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            
            const tablesRes = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
            const tableNames = tablesRes.toArray().map((r: any) => r.table_name);
            
            const schema: TableSchema[] = [];
            for (const name of tableNames) {
                const colsRes = await conn.query(`DESCRIBE "${name}"`);
                const cols = colsRes.toArray().map((r: any) => ({
                    name: r.column_name,
                    type: String(r.column_type)
                }));
                schema.push({ name, columns: cols });
            }
            setTables(schema);
            await conn.close();
        } catch (e) {
            console.error("Failed to load schema", e);
        } finally {
            setLoading(false);
        }
    };

    const toggleTable = (name: string) => {
        setExpanded(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <div className={`w-64 flex flex-col h-full overflow-hidden border-r ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
            <div className={`p-3 border-b font-semibold flex items-center gap-2 ${isDark ? 'border-slate-700 text-slate-200' : 'border-gray-200 text-gray-700'}`}>
                <Database size={16} className="text-blue-600" />
                <span>Database Schema</span>
            </div>
            <div className="flex-1 overflow-auto p-2">
                {loading ? (
                    <div className={`text-xs p-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading schema...</div>
                ) : (
                    <div className="space-y-1">
                        {tables.map(table => (
                            <div key={table.name} className={`border rounded overflow-hidden ${isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`}>
                                <div 
                                    className={`flex items-center gap-1 p-2 cursor-pointer select-none ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
                                    onClick={() => toggleTable(table.name)}
                                >
                                    {expanded[table.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <Table size={14} className={isDark ? 'text-slate-400' : 'text-gray-500'} />
                                    <span className={`text-sm font-medium truncate flex-1 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>{table.name}</span>
                                    <button 
                                        className="text-xs text-blue-600 hover:text-blue-800 px-1"
                                        onClick={(e) => { e.stopPropagation(); onInsert(`SELECT * FROM "${table.name}" LIMIT 100;`); }}
                                        title="Query Table"
                                    >
                                        Select
                                    </button>
                                </div>
                                {expanded[table.name] && (
                                    <div className={`border-t p-1 space-y-0.5 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                        {table.columns.map(col => (
                                            <div 
                                                key={col.name} 
                                                className={`pl-6 pr-2 py-1 text-xs flex justify-between group cursor-pointer ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}
                                                onClick={() => onInsert(col.name)}
                                            >
                                                <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{col.name}</span>
                                                <span className={`font-mono text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{col.type}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const ExcelView = ({ isDark }: { isDark: boolean }) => {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [rowData, setRowData] = useState<any[]>([]);
    const [colDefs, setColDefs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadTables();
    }, []);

    useEffect(() => {
        if (selectedTable) {
            loadTableData(selectedTable);
        }
    }, [selectedTable]);

    const loadTables = async () => {
        const db = getDuckDB();
        const conn = await db.connect();
        const res = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
        setTables(res.toArray().map((r: any) => r.table_name));
        await conn.close();
    };

    const loadTableData = async (tableName: string) => {
        setLoading(true);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            const res = await conn.query(`SELECT * FROM "${tableName}"`);
            
            const data = res.toArray().map((row: any) => {
                const obj: any = {};
                for (const key of Object.keys(row)) {
                    const val = row[key];
                    obj[key] = typeof val === 'bigint' ? Number(val) : val; // Convert BigInt for AG Grid
                }
                return obj;
            });

            if (data.length > 0) {
                const cols = Object.keys(data[0]).map(key => ({
                    field: key,
                    filter: true,
                    sortable: true,
                    resizable: true
                }));
                setColDefs(cols);
                setRowData(data);
            } else {
                setColDefs([]);
                setRowData([]);
            }
            await conn.close();
        } catch (e) {
            console.error("Failed to load table data", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`flex flex-col h-full ${isDark ? 'bg-slate-950' : 'bg-white'}`}>
            <div className={`p-4 border-b flex items-center gap-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                    <Table className="text-green-600" size={20} />
                    <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-700'}`}>Excel Data Explorer</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Select Table:</span>
                    <select 
                        value={selectedTable} 
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className={`rounded px-2 py-1 text-sm min-w-[200px] border ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                    >
                        <option value="">-- Choose a table --</option>
                        {tables.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                {loading && <span className="text-sm text-blue-500 animate-pulse">Loading data...</span>}
            </div>
            <div className="flex-1 w-full overflow-hidden relative">
                {selectedTable ? (
                    <div className={`absolute inset-0 p-2 ${isDark ? 'ag-theme-quartz-dark dv-aggrid-dark' : 'ag-theme-quartz dv-aggrid-light'}`}>
                         <AgGridReact
                            rowData={rowData}
                            columnDefs={colDefs}
                            defaultColDef={{
                                flex: 1,
                                minWidth: 100,
                                filter: true,
                                sortable: true,
                                resizable: true,
                            }}
                            pagination={true}
                            paginationPageSize={100}
                        />
                    </div>
                ) : (
                    <div className={`flex flex-col items-center justify-center h-full ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                        <Filter size={48} className="mb-2 opacity-20" />
                        <p>Select a table to explore data</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export const QueryEditor: React.FC<QueryEditorProps> = ({ role = 'view' }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const [activeTab, setActiveTab] = useState<'sql' | 'excel'>('sql');
    const [query, setQuery] = useState('SELECT * FROM tables LIMIT 10;');
    const [results, setResults] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [resultSchema, setResultSchema] = useState<ColumnInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showFullView, setShowFullView] = useState(false);
    const [showStructure, setShowStructure] = useState(false);

    const handleExecute = async () => {
        setLoading(true);
        setError(null);
        setResults([]);
        setColumns([]);
        setResultSchema([]);

        // Security Check
        const normalizedQuery = query.trim().toUpperCase();
        const isRead = normalizedQuery.startsWith('SELECT') || normalizedQuery.startsWith('WITH') || normalizedQuery.startsWith('DESCRIBE') || normalizedQuery.startsWith('EXPLAIN') || normalizedQuery.startsWith('SHOW') || normalizedQuery.startsWith('PRAGMA');
        const canWrite = role === 'owner' || role === 'admin';

        if (!isRead && !canWrite) {
            setError(`Permission Denied: Your role '${role}' allows only READ operations (SELECT, WITH, etc.).`);
            setLoading(false);
            return;
        }
        
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            const res = await conn.query(query);
            
            // Extract Schema
            try {
                if (res.schema && res.schema.fields) {
                    const schemaInfo = res.schema.fields.map((f: any) => ({
                        name: f.name,
                        type: String(f.type)
                    }));
                    setResultSchema(schemaInfo);
                }
            } catch (e) { console.warn("Could not extract schema", e); }

            const data = res.toArray().map((row: any) => {
                const obj: any = {};
                // Handle BigInt serialization
                for (const key of Object.keys(row)) {
                    const val = row[key];
                    obj[key] = typeof val === 'bigint' ? val.toString() : val;
                }
                return obj;
            });

            if (data.length > 0) {
                setColumns(Object.keys(data[0]));
                setResults(data);
            } else {
                setResults([]);
                setColumns([]);
            }
            
            await conn.close();
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Query execution failed');
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (results.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(results);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        XLSX.writeFile(wb, "query_results.xlsx");
    };

    const FullScreenModal = () => (
        createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setShowFullView(false)}>
                <div className={`w-full max-w-[95vw] h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`} onClick={e => e.stopPropagation()}>
                    <div className={`p-4 border-b flex justify-between items-center shrink-0 ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-[#F3F2F1] border-gray-300'}`}>
                        <div className="flex items-center gap-4">
                            <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-[#2C2C2C]'}`}>
                                <Table size={20} className="text-blue-600"/>
                                Detailed View
                            </h2>
                            <div className={`flex rounded p-1 gap-1 ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                                <button 
                                    onClick={() => setShowStructure(false)}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${!showStructure ? (isDark ? 'bg-slate-900 text-cyan-300' : 'bg-white shadow text-blue-600') : (isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-300')}`}
                                >
                                    Data
                                </button>
                                <button 
                                    onClick={() => setShowStructure(true)}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${showStructure ? (isDark ? 'bg-slate-900 text-cyan-300' : 'bg-white shadow text-blue-600') : (isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-300')}`}
                                >
                                    Structure
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors shadow-sm"
                            >
                                <Download size={16} /> Export to Excel
                            </button>
                            <button onClick={() => setShowFullView(false)} className={`p-2 rounded transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-200'}`}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className={`flex-1 overflow-auto p-4 ${isDark ? 'bg-slate-950' : 'bg-gray-50'}`}>
                        {showStructure ? (
                            <div className={`rounded border shadow-sm max-w-4xl mx-auto overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                                <table className="w-full text-sm text-left">
                                    <thead className={`uppercase text-xs font-semibold ${isDark ? 'bg-slate-950 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                                        <tr>
                                            <th className={`px-6 py-3 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>Column</th>
                                            <th className={`px-6 py-3 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>Data Type</th>
                                            <th className={`px-6 py-3 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>Example (Row 1)</th>
                                        </tr>
                                    </thead>
                                    <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-gray-100'}>
                                        {resultSchema.map((col, idx) => (
                                            <tr key={idx} className={isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}>
                                                <td className={`px-6 py-3 font-medium ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{col.name}</td>
                                                <td className="px-6 py-3 font-mono text-blue-600 text-xs">{col.type}</td>
                                                <td className={`px-6 py-3 truncate max-w-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    {results.length > 0 ? String(results[0][col.name] ?? 'null') : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                             <div className={`rounded border shadow-sm overflow-auto max-h-full h-full ${isDark ? 'ag-theme-quartz-dark bg-slate-900 border-slate-700 dv-aggrid-dark' : 'ag-theme-quartz bg-white border-gray-200 dv-aggrid-light'}`}>
                                <AgGridReact
                                    rowData={results}
                                    columnDefs={columns.map(c => ({ field: c, filter: true, sortable: true }))}
                                    defaultColDef={{
                                        flex: 1,
                                        minWidth: 100,
                                        filter: true,
                                        sortable: true,
                                        resizable: true,
                                    }}
                                    pagination={true}
                                    paginationPageSize={100}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        )
    );

    return (
        <div className={`dv-themed flex flex-col h-full rounded-lg shadow border overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
            {/* Tabs */}
            <div className={`flex border-b ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                <button
                    onClick={() => setActiveTab('sql')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-r ${isDark ? 'border-slate-700' : 'border-gray-200'} ${activeTab === 'sql' ? (isDark ? 'bg-slate-900 text-cyan-300' : 'bg-white text-blue-600') : (isDark ? 'text-slate-400 hover:bg-slate-900' : 'text-gray-600 hover:bg-gray-100')}`}
                >
                    <Database size={16} /> SQL Editor
                </button>
                <button
                    onClick={() => setActiveTab('excel')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-r ${isDark ? 'border-slate-700' : 'border-gray-200'} ${activeTab === 'excel' ? (isDark ? 'bg-slate-900 text-emerald-300' : 'bg-white text-green-600') : (isDark ? 'text-slate-400 hover:bg-slate-900' : 'text-gray-600 hover:bg-gray-100')}`}
                >
                    <Table size={16} /> Excel Data Explorer
                </button>
            </div>

            {activeTab === 'excel' ? (
                <ExcelView isDark={isDark} />
            ) : (
                <div className="flex flex-1 overflow-hidden">
                    <SchemaSidebar isDark={isDark} onInsert={(text) => setQuery(prev => prev + ' ' + text)} />
                    
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className={`flex items-center justify-between p-2 border-b ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${role === 'owner' || role === 'admin' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                    {role === 'owner' || role === 'admin' ? 'Full Access' : 'Read Only'}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setQuery('')}
                                    className={`p-1.5 rounded ${isDark ? 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/10' : 'text-gray-500 hover:text-red-500 hover:bg-red-50'}`}
                                    title="Clear"
                                >
                                    <Trash2 size={16} />
                                </button>
                                {results.length > 0 && (
                                    <button 
                                        onClick={() => setShowFullView(true)}
                                        className={`p-1.5 rounded ${isDark ? 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                                        title="Maximize / View Details"
                                    >
                                        <Maximize2 size={16} />
                                    </button>
                                )}
                                <button 
                                    onClick={handleExecute}
                                    disabled={loading}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                                >
                                    <Play size={14} /> Run
                                </button>
                            </div>
                        </div>

                        <div className={`h-64 border-b relative ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                             <CodeMirror
                                value={query}
                                height="100%"
                                extensions={[sql()]}
                                theme={isDark ? 'dark' : 'light'}
                                onChange={(value) => setQuery(value)}
                                className="h-full text-sm"
                            />
                        </div>

                        {error && (
                            <div className={`p-3 text-sm border-b font-mono ${isDark ? 'bg-red-500/10 text-red-300 border-red-500/30' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                {error}
                            </div>
                        )}

                        <div className={`flex-1 overflow-auto p-2 ${isDark ? 'bg-slate-950' : 'bg-gray-50'}`}>
                            {results.length > 0 ? (
                                <div className={`h-full w-full rounded shadow-sm overflow-hidden ${isDark ? 'ag-theme-quartz-dark bg-slate-900 border border-slate-700 dv-aggrid-dark' : 'ag-theme-quartz bg-white border border-gray-200 dv-aggrid-light'}`}>
                                     <AgGridReact
                                        rowData={results}
                                        columnDefs={columns.map(c => ({ field: c, filter: true, sortable: true }))}
                                        defaultColDef={{
                                            flex: 1,
                                            minWidth: 100,
                                            filter: true,
                                            sortable: true,
                                            resizable: true,
                                        }}
                                        pagination={true}
                                        paginationPageSize={100}
                                    />
                                </div>
                            ) : (
                                <div className={`flex items-center justify-center h-full text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                    {loading ? 'Running query...' : 'No results to display'}
                                </div>
                            )}
                        </div>
                        
                        {results.length > 0 && (
                            <div className={`p-2 border-t flex justify-end ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                                <span className={`text-xs mr-auto flex items-center pl-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                    {results.length} rows returned
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {showFullView && FullScreenModal()}
        </div>
    );
};
