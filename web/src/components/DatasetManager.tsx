import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { Database, Upload, Trash2, Check, X } from 'lucide-react';
import { getDuckDB } from '../lib/duckdb';
import * as duckdb from '@duckdb/duckdb-wasm';
import * as XLSX from 'xlsx';
import { addTableSchema, clearTables, removeTableSchema } from '../store/datasetsSlice';
import { saveDataset, deleteDataset } from '../lib/api';
import { useThemeMode } from '../lib/theme';

interface Column {
    name: string;
    type: string;
    selected: boolean;
}

interface StagedDataset {
    fileName: string;
    tableName: string;
    columns: Column[];
    previewData: any[];
}

export const DatasetManager = ({ dashboardId }: { dashboardId: string }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const modalOverlayClass = "fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm";
    const modalCardClass = `w-full max-w-md rounded-2xl border shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`;
    const modalCardWideClass = `w-full max-w-3xl rounded-2xl border shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`;
    const modalTitleClass = isDark ? 'text-lg font-semibold text-slate-100' : 'text-lg font-semibold text-slate-900';
    const modalTextClass = isDark ? 'text-sm text-slate-300' : 'text-sm text-slate-700';
    const modalCancelClass = `px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`;
    const modalPrimaryClass = "px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500";
    const modalDangerClass = "px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700";
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dispatch = useDispatch();
    const tables = useSelector((state: RootState) => state.datasets.tables);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stagedDataset, setStagedDataset] = useState<StagedDataset | null>(null);
    const [excelSheetModal, setExcelSheetModal] = useState<{
        fileName: string;
        tableName: string;
        buffer: ArrayBuffer;
        sheetNames: string[];
    } | null>(null);
    const [excelHeaderModal, setExcelHeaderModal] = useState<{
        fileName: string;
        tableName: string;
        buffer: ArrayBuffer;
        sheetName: string;
        rowsPreview: any[][];
    } | null>(null);
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
    const [pendingDeleteTable, setPendingDeleteTable] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const importExcelSheet = async (tableName: string, fileName: string, csvData: string) => {
        const db = getDuckDB();
        const conn = await db.connect();
        const tempTableName = `temp_${tableName}`;

        const csvFileName = `${tableName}_converted.csv`;
        await db.registerFileText(csvFileName, csvData);
        await conn.query(`CREATE TABLE ${tempTableName} AS SELECT * FROM read_csv_auto('${csvFileName}')`);

        const schemaQuery = await conn.query(`DESCRIBE ${tempTableName}`);
        const columns = schemaQuery.toArray().map((row: any) => ({
            name: row.column_name,
            type: row.column_type,
            selected: true
        }));

        const previewQuery = await conn.query(`SELECT * FROM ${tempTableName} LIMIT 5`);
        const previewData = previewQuery.toArray().map((row: any) => {
            const obj: any = {};
            for (const key of Object.keys(row)) {
                obj[key] = typeof row[key] === 'bigint' ? row[key].toString() : row[key];
            }
            return obj;
        });

        setStagedDataset({
            fileName,
            tableName,
            columns,
            previewData
        });

        await conn.close();
    };

    const openHeaderSelection = (fileName: string, tableName: string, buffer: ArrayBuffer, sheetName: string) => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const worksheet = workbook.Sheets[sheetName];
        const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        const previewRows = allRows.slice(0, 30);

        let defaultHeaderRow = 0;
        for (let i = 0; i < previewRows.length; i++) {
            if (previewRows[i].some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
                defaultHeaderRow = i;
                break;
            }
        }

        setExcelHeaderModal({
            fileName,
            tableName,
            buffer,
            sheetName,
            rowsPreview: previewRows,
        });
        setSelectedHeaderRow(defaultHeaderRow);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);
        try {
            const db = getDuckDB();
            let tableName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
            const fileExtension = file.name.split('.').pop()?.toLowerCase();

            if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetNames = workbook.SheetNames;

                if (sheetNames.length > 1) {
                    setExcelSheetModal({
                        fileName: file.name,
                        tableName,
                        buffer: data,
                        sheetNames,
                    });
                    setSelectedSheet(sheetNames[0]);
                } else {
                    openHeaderSelection(file.name, tableName, data, sheetNames[0]);
                }
            } else {
                const conn = await db.connect();
                const tempTableName = `temp_${tableName}`;
                let query = '';

                if (fileExtension === 'csv') {
                    await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
                    query = `CREATE TABLE ${tempTableName} AS SELECT * FROM read_csv_auto('${file.name}')`;
                } else if (fileExtension === 'parquet') {
                    await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
                    query = `CREATE TABLE ${tempTableName} AS SELECT * FROM read_parquet('${file.name}')`;
                } else {
                    throw new Error("Formato no soportado. Usa CSV, Parquet o Excel.");
                }

                await conn.query(query);

                const schemaQuery = await conn.query(`DESCRIBE ${tempTableName}`);
                const columns = schemaQuery.toArray().map((row: any) => ({
                    name: row.column_name,
                    type: row.column_type,
                    selected: true
                }));

                const previewQuery = await conn.query(`SELECT * FROM ${tempTableName} LIMIT 5`);
                const previewData = previewQuery.toArray().map((row: any) => {
                    const obj: any = {};
                    for (const key of Object.keys(row)) {
                        obj[key] = typeof row[key] === 'bigint' ? row[key].toString() : row[key];
                    }
                    return obj;
                });

                setStagedDataset({
                    fileName: file.name,
                    tableName,
                    columns,
                    previewData
                });

                await conn.close();
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error uploading file');
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleColumn = (idx: number) => {
        if (!stagedDataset) return;
        const newCols = [...stagedDataset.columns];
        newCols[idx].selected = !newCols[idx].selected;
        setStagedDataset({ ...stagedDataset, columns: newCols });
    };

    const handleConfirmUpload = async () => {
        if (!stagedDataset) return;
        setIsLoading(true);
        setError(null);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            const tempTableName = `temp_${stagedDataset.tableName}`;
            
            // Filter selected columns
            const selectedCols = stagedDataset.columns.filter(c => c.selected);
            const colNames = selectedCols.map(c => `"${c.name}"`).join(', ');
            
            // Create final table in WASM
            await conn.query(`CREATE TABLE ${stagedDataset.tableName} AS SELECT ${colNames} FROM ${tempTableName}`);
            await conn.query(`DROP TABLE ${tempTableName}`);
            
            // Persist to Backend
            const result = await conn.query(`SELECT * FROM ${stagedDataset.tableName}`);
            const data = result.toArray().map((row: any) => {
                const obj: any = {};
                for (const key of Object.keys(row)) {
                    obj[key] = row[key];
                }
                return obj;
            });
            
            // Serialize values that are not JSON-safe (BigInt, Infinity, NaN)
            const jsonContent = JSON.stringify(data, (key, value) => {
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                if (typeof value === 'number' && !Number.isFinite(value)) {
                    return String(value);
                }
                return value;
            });

            const datasetId = `${dashboardId || 'global'}__${stagedDataset.tableName}`;

            await saveDataset(
                datasetId,
                stagedDataset.tableName,
                jsonContent,
                selectedCols,
                dashboardId
            );

            dispatch(addTableSchema({
                name: stagedDataset.tableName,
                columns: selectedCols
            }));

            setStagedDataset(null);
            await conn.close();
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error saving dataset');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelUpload = async () => {
        if (!stagedDataset) return;
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            await conn.query(`DROP TABLE IF EXISTS temp_${stagedDataset.tableName}`);
            await conn.close();
        } catch (e) { }
        setStagedDataset(null);
    };

    const handleDeleteTable = (tableName: string) => {
        setPendingDeleteTable(tableName);
    };

    const confirmDeleteTable = async () => {
        if (!pendingDeleteTable) return;
        const tableName = pendingDeleteTable;
        setPendingDeleteTable(null);
        setIsLoading(true);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
            await conn.close();
            dispatch(removeTableSchema(tableName));

            try {
                const datasetId = `${dashboardId || 'global'}__${tableName}`;
                await deleteDataset(datasetId);
            } catch {
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Error deleting table');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearDB = () => {
        setShowClearConfirm(true);
    };

    const confirmClearDB = async () => {
        setShowClearConfirm(false);
        setIsLoading(true);
        try {
            const db = getDuckDB();
            const conn = await db.connect();
            const tablesRes = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
            const tableNames = tablesRes.toArray().map((r: any) => r.table_name);
            
            for (const name of tableNames) {
                 await conn.query(`DROP TABLE IF EXISTS "${name}"`);
                 try {
                    const datasetId = `${dashboardId || 'global'}__${name}`;
                    await deleteDataset(datasetId);
                 } catch {
                 }
            }
            await conn.close();
            dispatch(clearTables());
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Error clearing database');
        } finally {
            setIsLoading(false);
        }
    };

    if (stagedDataset) {
        return (
            <>
            <div className={`dv-themed flex flex-col gap-4 p-4 shadow-md rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-lg font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
                    <Check size={20} className="text-green-600" />
                    Vista previa: {stagedDataset.fileName}
                </h3>
                <p className={isDark ? 'text-sm text-slate-400' : 'text-sm text-gray-500'}>Selecciona las columnas que deseas importar a la base de datos local:</p>

                {error && (
                    <div className={`text-sm p-2 rounded border ${isDark ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'text-red-600 bg-red-50 border-red-200'}`}>
                        {error}
                    </div>
                )}

                <div className={`max-h-64 overflow-y-auto rounded-lg border p-2 ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                    {stagedDataset.columns.map((col, idx) => (
                        <label key={col.name} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${isDark ? 'hover:bg-slate-800/70' : 'hover:bg-gray-100'} ${col.selected ? (isDark ? 'text-slate-200' : 'text-gray-800') : (isDark ? 'text-slate-500 line-through' : 'text-gray-400 line-through')}`}>
                            <input
                                type="checkbox"
                                checked={col.selected}
                                onChange={() => handleToggleColumn(idx)}
                                className="w-4 h-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="font-mono text-sm">{col.name}</span>
                            <span className={`text-xs ml-auto px-2 py-1 rounded ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-600'}`}>{col.type}</span>
                        </label>
                    ))}
                </div>

                {stagedDataset.previewData && stagedDataset.previewData.length > 0 && (
                    <div className="mt-2">
                        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>Vista previa (primeras 5 filas)</h4>
                        <div className={`overflow-x-auto rounded-lg border ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                            <table className={`w-full text-xs text-left ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                <thead className={`text-xs uppercase ${isDark ? 'text-slate-300 bg-slate-900' : 'text-gray-700 bg-gray-100'}`}>
                                    <tr>
                                        {stagedDataset.columns.map(col => (
                                            <th key={col.name} className={`px-2 py-1 border-b whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-200'} ${!col.selected && 'opacity-50'}`}>
                                                {col.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {stagedDataset.previewData.map((row, i) => (
                                        <tr key={i} className={`${isDark ? 'bg-slate-950 border-b border-slate-800 hover:bg-slate-900' : 'bg-white border-b hover:bg-gray-50'}`}>
                                            {stagedDataset.columns.map(col => (
                                                <td key={col.name} className={`px-2 py-1 whitespace-nowrap max-w-xs truncate ${isDark ? 'border-slate-800' : 'border-gray-100'} ${!col.selected && 'opacity-50'}`}>
                                                    {row[col.name] !== null ? String(row[col.name]) : <span className={isDark ? 'text-slate-500 italic' : 'text-gray-300 italic'}>null</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 mt-2">
                    <button
                        onClick={handleCancelUpload}
                        disabled={isLoading}
                        className={`flex-1 py-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmUpload}
                        disabled={isLoading}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow"
                    >
                        {isLoading ? 'Guardando...' : 'Guardar Tabla'}
                    </button>
                </div>
            </div>

            {excelSheetModal && (
                <div className={modalOverlayClass}>
                    <div className={`${modalCardClass} p-6`}>
                        <h3 className={`${modalTitleClass} mb-2`}>Seleccionar hoja de Excel</h3>
                        <p className={`${modalTextClass} mb-3`}>
                            El archivo {excelSheetModal.fileName} tiene varias hojas. Selecciona la que deseas importar.
                        </p>
                        <div className={`max-h-48 overflow-y-auto mb-4 rounded-lg border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                            {excelSheetModal.sheetNames.map(name => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedSheet(name)}
                                    className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${isDark ? 'border-slate-800' : 'border-gray-100'} ${
                                        selectedSheet === name
                                            ? 'bg-cyan-500/15 text-cyan-300'
                                            : (isDark ? 'bg-slate-950 text-slate-200 hover:bg-slate-900' : 'bg-white text-gray-800 hover:bg-gray-50')
                                    }`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setExcelSheetModal(null); setSelectedSheet(''); }}
                                className={modalCancelClass}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (!excelSheetModal || !selectedSheet) return;
                                    openHeaderSelection(
                                        excelSheetModal.fileName,
                                        excelSheetModal.tableName,
                                        excelSheetModal.buffer,
                                        selectedSheet
                                    );
                                    setExcelSheetModal(null);
                                }}
                                className={modalPrimaryClass}
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {excelHeaderModal && (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <div className={`${modalCardWideClass} p-6`}>
                        <h3 className={`${modalTitleClass} mb-2`}>Seleccionar fila de encabezados</h3>
                        <p className={`${modalTextClass} mb-3`}>
                            Haz clic en la fila donde empiezan los nombres de las columnas.
                        </p>
                        <div className={`max-h-80 overflow-auto rounded mb-4 border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                            <table className={`w-full text-xs text-left ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                <tbody>
                                    {excelHeaderModal.rowsPreview.map((row, rowIndex) => (
                                        <tr
                                            key={rowIndex}
                                            onClick={() => setSelectedHeaderRow(rowIndex)}
                                            className={`cursor-pointer ${selectedHeaderRow === rowIndex ? 'bg-cyan-500/15' : (isDark ? 'hover:bg-slate-900' : 'hover:bg-gray-50')}`}
                                        >
                                            <td className={`px-2 py-1 text-[10px] border-r align-top ${isDark ? 'text-slate-500 border-slate-800' : 'text-gray-400 border-gray-200'}`}>
                                                {rowIndex + 1}
                                            </td>
                                            {row.map((cell: any, colIndex: number) => (
                                                <td
                                                    key={colIndex}
                                                    className={`px-2 py-1 border-b whitespace-nowrap max-w-xs truncate ${isDark ? 'border-slate-800' : 'border-gray-100'}`}
                                                >
                                                    {cell !== null && cell !== undefined && String(cell).trim() !== ''
                                                        ? String(cell)
                                                        : <span className={isDark ? 'text-slate-500 italic' : 'text-gray-300 italic'}>vacio</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setExcelHeaderModal(null)}
                                className={modalCancelClass}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    if (!excelHeaderModal) return;
                                    setIsLoading(true);
                                    try {
                                        const workbook = XLSX.read(excelHeaderModal.buffer, { type: 'array' });
                                        const worksheet = workbook.Sheets[excelHeaderModal.sheetName];
                                        const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                                        const effectiveRows = allRows.slice(selectedHeaderRow);
                                        const newSheet = XLSX.utils.aoa_to_sheet(effectiveRows);
                                        const csvData = XLSX.utils.sheet_to_csv(newSheet);
                                        await importExcelSheet(
                                            excelHeaderModal.tableName,
                                            excelHeaderModal.fileName,
                                            csvData
                                        );
                                        setExcelHeaderModal(null);
                                    } catch (e: any) {
                                        console.error(e);
                                        setError(e.message || 'Error al aplicar la fila de encabezados seleccionada');
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                className={modalPrimaryClass}
                            >
                                Usar esta fila
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingDeleteTable && (
                <div className={modalOverlayClass}>
                    <div className={`${modalCardClass} p-6`}>
                        <h3 className={`${modalTitleClass} mb-2`}>Eliminar tabla</h3>
                        <p className={`${modalTextClass} mb-4`}>
                            Estas seguro de eliminar la tabla {pendingDeleteTable}? Tambien se eliminara su dataset asociado.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setPendingDeleteTable(null)}
                                className={modalCancelClass}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteTable}
                                className={modalDangerClass}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showClearConfirm && (
                <div className={modalOverlayClass}>
                    <div className={`${modalCardClass} p-6`}>
                        <h3 className={`${modalTitleClass} mb-2`}>Limpiar base de datos</h3>
                        <p className={`${modalTextClass} mb-4`}>
                            Estas seguro de limpiar TODA la base de datos local para este tablero? Se eliminaran todas las tablas y datasets asociados.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className={modalCancelClass}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmClearDB}
                                className={modalDangerClass}
                            >
                                Limpiar todo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>
        );
    }

    return (
        <>
        <div className={`dv-themed flex flex-col gap-4 p-4 shadow-md rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
                    <Database size={20} className="text-blue-600" />
                    Fuentes de datos
                </h3>
                {tables.length > 0 && (
                    <button
                        onClick={handleClearDB}
                        disabled={isLoading}
                        className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${isDark ? 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                    >
                        <Trash2 size={14} /> Limpiar DB
                    </button>
                )}
            </div>

            {error && <div className={`text-sm p-2 rounded border ${isDark ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'text-red-600 bg-red-50 border-red-200'}`}>{error}</div>}

            <input
                type="file"
                accept=".csv,.parquet,.xlsx,.xls"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
            />

            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors disabled:opacity-50 group ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300'}` }
            >
                {isLoading ? <span className="animate-spin">...</span> : <Upload size={18} className="group-hover:-translate-y-1 transition-transform" />}
                {isLoading ? 'Procesando...' : 'Subir datos (CSV, Excel, Parquet)'}
            </button>

            <div className="flex flex-col gap-2 mt-2">
                {tables.length > 0 && <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Tablas Cargadas</h4>}
                {tables.map(table => (
                    <div key={table.name} className={`flex items-center justify-between p-2 rounded text-sm transition-colors ${isDark ? 'bg-slate-950 border border-slate-700 hover:bg-slate-900' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'}`}>
                        <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                            <Database size={14} className="text-blue-500" />
                            {table.name}
                        </span>
                        <button 
                            onClick={() => handleDeleteTable(table.name)}
                            disabled={isLoading}
                            className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors"
                            title="Eliminar tabla"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                {tables.length === 0 && !isLoading && (
                    <div className={`text-center p-4 text-sm border border-dashed rounded-lg ${isDark ? 'text-slate-500 border-slate-700' : 'text-gray-400 border-gray-200'}`}>
                        No hay tablas cargadas
                    </div>
                )}
            </div>
        </div>

        {excelSheetModal && (
            <div className={modalOverlayClass}>
                <div className={`${modalCardClass} p-6`}>
                    <h3 className={`${modalTitleClass} mb-2`}>Seleccionar hoja de Excel</h3>
                    <p className={`${modalTextClass} mb-3`}>
                        El archivo {excelSheetModal.fileName} tiene varias hojas. Selecciona la que deseas importar.
                    </p>
                    <div className={`max-h-48 overflow-y-auto mb-4 rounded-lg border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                        {excelSheetModal.sheetNames.map(name => (
                            <button
                                key={name}
                                onClick={() => setSelectedSheet(name)}
                                className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${isDark ? 'border-slate-800' : 'border-gray-100'} ${
                                    selectedSheet === name
                                        ? 'bg-cyan-500/15 text-cyan-300'
                                        : (isDark ? 'bg-slate-950 text-slate-200 hover:bg-slate-900' : 'bg-white text-gray-800 hover:bg-gray-50')
                                }`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setExcelSheetModal(null); setSelectedSheet(''); }}
                            className={modalCancelClass}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (!excelSheetModal || !selectedSheet) return;
                                openHeaderSelection(
                                    excelSheetModal.fileName,
                                    excelSheetModal.tableName,
                                    excelSheetModal.buffer,
                                    selectedSheet
                                );
                                setExcelSheetModal(null);
                            }}
                            className={modalPrimaryClass}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {excelHeaderModal && (
            <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                <div className={`${modalCardWideClass} p-6`}>
                    <h3 className={`${modalTitleClass} mb-2`}>Seleccionar fila de encabezados</h3>
                    <p className={`${modalTextClass} mb-3`}>
                        Haz clic en la fila donde empiezan los nombres de las columnas.
                    </p>
                    <div className={`max-h-80 overflow-auto rounded mb-4 border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                        <table className={`w-full text-xs text-left ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            <tbody>
                                {excelHeaderModal.rowsPreview.map((row, rowIndex) => (
                                    <tr
                                        key={rowIndex}
                                        onClick={() => setSelectedHeaderRow(rowIndex)}
                                        className={`cursor-pointer ${selectedHeaderRow === rowIndex ? 'bg-cyan-500/15' : (isDark ? 'hover:bg-slate-900' : 'hover:bg-gray-50')}`}
                                    >
                                        <td className={`px-2 py-1 text-[10px] border-r align-top ${isDark ? 'text-slate-500 border-slate-800' : 'text-gray-400 border-gray-200'}`}>
                                            {rowIndex + 1}
                                        </td>
                                        {row.map((cell: any, colIndex: number) => (
                                            <td
                                                key={colIndex}
                                                className={`px-2 py-1 border-b whitespace-nowrap max-w-xs truncate ${isDark ? 'border-slate-800' : 'border-gray-100'}`}
                                            >
                                                {cell !== null && cell !== undefined && String(cell).trim() !== ''
                                                    ? String(cell)
                                                    : <span className={isDark ? 'text-slate-500 italic' : 'text-gray-300 italic'}>vacio</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setExcelHeaderModal(null)}
                            className={modalCancelClass}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={async () => {
                                if (!excelHeaderModal) return;
                                setIsLoading(true);
                                try {
                                    const workbook = XLSX.read(excelHeaderModal.buffer, { type: 'array' });
                                    const worksheet = workbook.Sheets[excelHeaderModal.sheetName];
                                    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                                    const effectiveRows = allRows.slice(selectedHeaderRow);
                                    const newSheet = XLSX.utils.aoa_to_sheet(effectiveRows);
                                    const csvData = XLSX.utils.sheet_to_csv(newSheet);
                                    await importExcelSheet(
                                        excelHeaderModal.tableName,
                                        excelHeaderModal.fileName,
                                        csvData
                                    );
                                    setExcelHeaderModal(null);
                                } catch (e: any) {
                                    console.error(e);
                                    setError(e.message || 'Error al aplicar la fila de encabezados seleccionada');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            className={modalPrimaryClass}
                        >
                            Usar esta fila
                        </button>
                    </div>
                </div>
            </div>
        )}

        {pendingDeleteTable && (
            <div className={modalOverlayClass}>
                <div className={`${modalCardClass} p-6`}>
                    <h3 className={`${modalTitleClass} mb-2`}>Eliminar tabla</h3>
                    <p className={`${modalTextClass} mb-4`}>
                        Estas seguro de eliminar la tabla {pendingDeleteTable}? Tambien se eliminara su dataset asociado.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setPendingDeleteTable(null)}
                            className={modalCancelClass}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmDeleteTable}
                            className={modalDangerClass}
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showClearConfirm && (
            <div className={modalOverlayClass}>
                <div className={`${modalCardClass} p-6`}>
                    <h3 className={`${modalTitleClass} mb-2`}>Limpiar base de datos</h3>
                    <p className={`${modalTextClass} mb-4`}>
                        Estas seguro de limpiar TODA la base de datos local para este tablero? Se eliminaran todas las tablas y datasets asociados.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setShowClearConfirm(false)}
                            className={modalCancelClass}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmClearDB}
                            className={modalDangerClass}
                        >
                            Limpiar todo
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};


