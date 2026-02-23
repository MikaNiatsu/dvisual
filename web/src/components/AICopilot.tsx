import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Send, Bot, User, Minimize2, Maximize2, X, Database, Plus } from 'lucide-react';
import type { RootState } from '../store';
import { addWidget } from '../store/dashboardSlice';
import { getDuckDB } from '../lib/duckdb';
import { applyDVisualTheme } from '../lib/chartTheme';
import { ApexChart } from './ApexChart';
import { useThemeMode } from '../lib/theme';
import { AnimatePresence, motion } from 'framer-motion';
import { toApexFigure } from '../lib/apexAdapter';

const MAX_RETRIES = 2;
const AI_DISCLAIMER = 'La IA puede equivocarse. Verifica resultados y consultas antes de tomar decisiones.';
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    tableData?: any[];
    chartConfig?: any;
}

type ResponseMode = 'auto' | 'chart' | 'summary';

interface AICopilotProps {
    canInsertToDashboard?: boolean;
}

async function getSampleData(tables: any[]): Promise<string> {
    try {
        const db = getDuckDB();
        const conn = await db.connect();
        const samples: string[] = [];

        for (const t of tables) {
            try {
                const res = await conn.query(`SELECT * FROM "${t.name}" LIMIT 3`);
                const rows = res.toArray().map((r: any) => {
                    const obj: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(r)) {
                        obj[k] = typeof v === 'bigint' ? Number(v) : v;
                    }
                    return obj;
                });
                samples.push(`Tabla "${t.name}" - Primeras 3 filas:\n${JSON.stringify(rows, null, 1)}`);
            } catch {
                // Skip table sample errors
            }
        }

        await conn.close();
        return samples.join('\n\n');
    } catch {
        return '(No se pudieron obtener datos de ejemplo)';
    }
}

function extractSQL(text: string): string | null {
    const tag = text.match(/\[SQL\]([\s\S]*?)\[\/SQL\]/i);
    if (tag) return tag[1].trim();

    const code = text.match(/```sql\s*\n([\s\S]*?)\n```/i);
    if (code) return code[1].trim();

    const generic = text.match(/```\s*\n([\s\S]*?)\n```/);
    if (generic) {
        const block = generic[1].trim();
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|DROP|ALTER)/i.test(block)) {
            return block;
        }
    }

    if (/^\s*(SELECT|WITH)\s/i.test(text.trim()) && text.trim().split('\n').length < 15) {
        return text.trim();
    }

    return null;
}

function extractChart(text: string): any | null {
    const tag = text.match(/\[CHART\]([\s\S]*?)\[\/CHART\]/i);
    if (tag) {
        try {
            return JSON.parse(tag[1].trim());
        } catch {
            return null;
        }
    }

    const code = text.match(/```json\s*\n([\s\S]*?)\n```/i);
    if (code) {
        try {
            const parsed = JSON.parse(code[1].trim());
            if (parsed.series || parsed.xAxis || parsed.title || parsed.kpi) return parsed;
        } catch {
            return null;
        }
    }

    return null;
}

function cleanDisplay(text: string): string {
    return text
        .replace(/\[SQL\][\s\S]*?\[\/SQL\]/gi, '')
        .replace(/\[CHART\][\s\S]*?\[\/CHART\]/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const toNumeric = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(/[$,%\s]/g, '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const buildChartFromRows = (rows: any[], title = 'Grafico IA'): any | null => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const sample = rows[0] || {};
    const keys = Object.keys(sample);
    if (keys.length === 0) return null;

    const xKey = keys[0];
    const numericKeys = keys.filter((key) => rows.some((row) => toNumeric(row?.[key]) != null));

    if (numericKeys.length > 0) {
        const yKey = numericKeys[0];
        const trimmed = rows.slice(0, 24);
        return {
            title: { text: title },
            xAxis: { data: trimmed.map((row) => String(row?.[xKey] ?? '')), name: xKey },
            yAxis: { name: yKey },
            series: [
                {
                    type: 'bar',
                    name: yKey,
                    data: trimmed.map((row) => toNumeric(row?.[yKey]) ?? 0),
                },
            ],
        };
    }

    const counts = new Map<string, number>();
    rows.forEach((row) => {
        const key = String(row?.[xKey] ?? 'Sin valor');
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24);

    return {
        title: { text: `${title} (conteo)` },
        xAxis: { data: top.map(([k]) => k), name: xKey },
        yAxis: { name: 'Cantidad' },
        series: [
            {
                type: 'bar',
                name: 'Cantidad',
                data: top.map(([, v]) => v),
            },
        ],
    };
};

const compactText = (text: string, maxLines = 5, maxChars = 520) => {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, maxLines);
    const joined = lines.join('\n');
    return joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}...` : joined;
};

const hasRenderableSeries = (config: any) => {
    if (!config || !Array.isArray(config.series) || config.series.length === 0) return false;
    return config.series.some((serie: any) => {
        const data = Array.isArray(serie?.data) ? serie.data : [];
        return data.length > 0;
    });
};

const normalizeChartConfig = (raw: any, rowsFallback?: any[]): any | null => {
    if (!raw || typeof raw !== 'object') {
        return rowsFallback && rowsFallback.length > 0 ? buildChartFromRows(rowsFallback, 'Grafico generado') : null;
    }

    let config: any = { ...raw };

    if (config.data && Array.isArray(config.data?.datasets) && Array.isArray(config.data?.labels)) {
        const labels = config.data.labels.map((label: unknown) => String(label ?? ''));
        const baseType = String(config.type || 'bar').toLowerCase();
        config = {
            title: config.title || { text: 'Grafico IA' },
            xAxis: { data: labels },
            yAxis: { name: 'Valores' },
            series: config.data.datasets.map((ds: any, idx: number) => ({
                type: baseType,
                name: String(ds?.label || `Serie ${idx + 1}`),
                data: Array.isArray(ds?.data) ? ds.data : [],
            })),
        };
    }

    if (config.series && !Array.isArray(config.series) && typeof config.series === 'object') {
        config.series = [config.series];
    }

    if (!Array.isArray(config.series)) {
        return rowsFallback && rowsFallback.length > 0 ? buildChartFromRows(rowsFallback, 'Grafico generado') : null;
    }

    let inferredLabels: string[] = [];
    config.series = config.series.map((serie: any, idx: number) => {
        const safeType = String(serie?.type || config?.type || 'bar').toLowerCase();
        let data = Array.isArray(serie?.data) ? serie.data : [];

        if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
            const first = data[0] as any;
            if ('value' in first || 'name' in first) {
                inferredLabels = data.map((point: any, pointIdx: number) => String(point?.name ?? `Item ${pointIdx + 1}`));
                data = data.map((point: any) => {
                    const n = toNumeric(point?.value);
                    return n == null ? 0 : n;
                });
            } else if ('y' in first || 'x' in first) {
                inferredLabels = data.map((point: any, pointIdx: number) => String(point?.x ?? `Item ${pointIdx + 1}`));
                data = data.map((point: any) => {
                    const n = toNumeric(point?.y);
                    return n == null ? 0 : n;
                });
            }
        }

        const normalized = {
            ...serie,
            type: safeType,
            name: String(serie?.name || `Serie ${idx + 1}`),
            data,
        };

        if (safeType === 'pie' && Array.isArray(normalized.data) && normalized.data.length > 0 && typeof normalized.data[0] !== 'object') {
            const axisLabels = Array.isArray(config?.xAxis?.data) ? config.xAxis.data.map((v: unknown) => String(v ?? '')) : inferredLabels;
            normalized.data = normalized.data.map((value: unknown, pointIdx: number) => ({
                name: axisLabels[pointIdx] || `Item ${pointIdx + 1}`,
                value: toNumeric(value) ?? 0,
            }));
        }

        return normalized;
    });

    if ((!config.xAxis || !Array.isArray(config.xAxis?.data)) && inferredLabels.length > 0) {
        config.xAxis = { ...(config.xAxis || {}), data: inferredLabels };
    }

    if (!hasRenderableSeries(config)) {
        return rowsFallback && rowsFallback.length > 0 ? buildChartFromRows(rowsFallback, 'Grafico generado') : null;
    }

    try {
        toApexFigure(config);
        return config;
    } catch {
        return rowsFallback && rowsFallback.length > 0 ? buildChartFromRows(rowsFallback, 'Grafico generado') : null;
    }
};

export const AICopilot: React.FC<AICopilotProps> = ({ canInsertToDashboard = true }) => {
    const dispatch = useDispatch();
    const theme = useThemeMode();
    const isDark = theme === 'dark';

    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Hola. Pideme consultas SQL o visualizaciones y te ayudo al instante.' },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [expandedTable, setExpandedTable] = useState<any[] | null>(null);
    const [responseMode, setResponseMode] = useState<ResponseMode>('auto');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const tables = useSelector((state: RootState) => state.datasets.tables);
    const auth = useSelector((state: RootState) => state.auth);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const callAI = async (prompt: string, extraContext?: string): Promise<string> => {
        const sampleData = await getSampleData(tables);
        const res = await fetch(`${API_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
                prompt,
                schema: tables,
                sampleData,
                extraContext: extraContext || '',
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error del servidor');
        return data.response || '';
    };

    const executeSQL = async (sql: string): Promise<any[]> => {
        const db = getDuckDB();
        const conn = await db.connect();
        const result = await conn.query(sql);
        const rows = result.toArray().map((r: any) => {
            const obj: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(r)) {
                obj[k] = typeof v === 'bigint' ? Number(v) : v;
            }
            return obj;
        });
        await conn.close();
        return rows;
    };

    const handleAddToDashboard = (config: any) => {
        if (!canInsertToDashboard) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Tu rol es solo lectura. No puedes insertar graficas al tablero.',
                },
            ]);
            return;
        }
        const id = `chart_${Date.now()}`;
        dispatch(
            addWidget({
                id,
                type: 'chart',
                title: config.title?.text || 'Grafico IA',
                chartConfig: config,
            }),
        );
    };

    const getModeInstruction = (mode: ResponseMode) => {
        if (mode === 'chart') {
            return [
                'Modo solicitado: GRAFICAR.',
                'Prioriza salida visual y breve.',
                'Si necesitas datos, devuelve SQL en [SQL]...[/SQL].',
                'Devuelve configuracion de grafico en [CHART]...[/CHART] con JSON valido.',
                'Evita explicaciones largas.',
            ].join('\n');
        }
        if (mode === 'summary') {
            return [
                'Modo solicitado: RESUMEN EN PALABRAS.',
                'No devuelvas [CHART] ni bloques SQL en la respuesta visible.',
                'Si usas SQL interno, mantenlo solo en [SQL]...[/SQL].',
                'Resume en espanol claro y accionable.',
            ].join('\n');
        }
        return [
            'Modo solicitado: AUTO.',
            'Puedes responder con texto, SQL y/o grafico segun convenga.',
        ].join('\n');
    };

    const summarizeRowsWithAI = async (rows: any[], userGoal: string) => {
        const compactRows = rows.slice(0, 40);
        const prompt = [
            'Resume los siguientes resultados en espanol claro para negocio.',
            `Objetivo del usuario: ${userGoal}`,
            'Entrega maximo 5 puntos breves y una conclusion.',
            'No incluyas SQL, JSON ni markdown tecnico.',
            `Resultados JSON:\n${JSON.stringify(compactRows)}`,
        ].join('\n\n');
        const response = await callAI(prompt, 'No generar SQL. No generar CHART.');
        return cleanDisplay(response);
    };

    const handleSend = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!input.trim()) return;

        const userMsg = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const responseText = await callAI(userMsg, getModeInstruction(responseMode));
            let sql = extractSQL(responseText);
            let chartConfig = responseMode === 'summary' ? null : normalizeChartConfig(extractChart(responseText));
            const displayText = compactText(cleanDisplay(responseText));
            let sqlRows: any[] = [];
            let sqlExecuted = false;

            if (displayText && responseMode !== 'chart') {
                setMessages((prev) => [...prev, { role: 'assistant', content: displayText }]);
            }

            if (sql) {
                let retries = 0;
                let lastError = '';

                while (retries <= MAX_RETRIES) {
                    try {
                        const rows = await executeSQL(sql);
                        sqlRows = rows;
                        sqlExecuted = true;
                        if (rows.length > 0) {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    role: 'assistant',
                                    content: `Resultados (${rows.length} filas):`,
                                    tableData: rows,
                                },
                            ]);
                            if (responseMode === 'summary') {
                                try {
                                    const summary = compactText(await summarizeRowsWithAI(rows, userMsg), 5, 560);
                                    setMessages((prev) => [
                                        ...prev,
                                        {
                                            role: 'assistant',
                                            content: summary || 'Ya tengo los datos. Puedo darte mas detalle si lo necesitas.',
                                        },
                                    ]);
                                } catch {
                                    setMessages((prev) => [
                                        ...prev,
                                        {
                                            role: 'assistant',
                                            content: 'Ya tengo los datos, pero no pude resumirlos en este intento. Puedes pedir un resumen mas corto.',
                                        },
                                    ]);
                                }
                            }
                        } else {
                            setMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: 'La consulta se ejecuto pero no devolvio resultados.' },
                            ]);
                        }
                        break;
                    } catch (err: any) {
                        lastError = err.message;
                        retries += 1;

                        if (retries <= MAX_RETRIES) {
                            setMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: `No pude ejecutar la consulta. Reintento ${retries}/${MAX_RETRIES}...` },
                            ]);

                            const retryPrompt = `La consulta SQL que generaste fallo con este error:\nERROR: ${lastError}\n\nLa SQL que fallo fue:\n${sql}\n\nPor favor genera una nueva consulta SQL corregida que solucione ese error. Recuerda que los datos pueden tener formatos como '$32,370.00' en columnas numericas y debes limpiarlos antes de CAST. Responde SOLO con la SQL corregida dentro de [SQL]...[/SQL].`;

                            const retryResponse = await callAI(retryPrompt, 'Devuelve solo SQL corregida dentro de [SQL]...[/SQL].');
                            const fixedSql = extractSQL(retryResponse);
                            if (fixedSql) {
                                sql = fixedSql;
                            } else {
                                setMessages((prev) => [
                                    ...prev,
                                    { role: 'assistant', content: 'No pude corregir la consulta automaticamente. Intenta reformular la peticion.' },
                                ]);
                                break;
                            }
                        } else {
                            setMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: `No pude ejecutar la consulta despues de ${MAX_RETRIES} reintentos.` },
                            ]);
                        }
                    }
                }
            }

            if (responseMode === 'chart' && !chartConfig && sqlExecuted && sqlRows.length > 0) {
                chartConfig = buildChartFromRows(sqlRows, 'Grafico generado');
            }
            if (chartConfig && sqlRows.length > 0) {
                chartConfig = normalizeChartConfig(chartConfig, sqlRows);
            } else if (chartConfig) {
                chartConfig = normalizeChartConfig(chartConfig);
            }

            if (chartConfig && responseMode !== 'summary') {
                const themedConfig = applyDVisualTheme(chartConfig);
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: 'He generado este grafico:',
                        chartConfig: themedConfig,
                    },
                ]);
            } else if (responseMode === 'chart' && !chartConfig) {
                setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: 'No pude construir un grafico con esta solicitud. Prueba indicando metrica y dimension.' },
                ]);
            }
        } catch (error) {
            console.error('AI Copilot error:', error);
            setMessages((prev) => [...prev, { role: 'assistant', content: 'No pude procesar la solicitud ahora. Intenta nuevamente.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const shellClass = isDark
        ? 'border-slate-700/90 bg-slate-900/95 text-slate-100'
        : 'border-slate-200 bg-white text-slate-900';

    if (!isOpen) {
        return (
            <motion.button
                onClick={() => setIsOpen(true)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xl shadow-cyan-950/35 transition-transform hover:scale-105"
                title="Abrir copiloto"
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                whileTap={{ scale: 0.95 }}
            >
                <Bot size={24} />
            </motion.button>
        );
    }

    return (
        <>
            <motion.div
                className={`flex h-[500px] max-h-[calc(100vh-90px)] w-[390px] max-w-[calc(100vw-90px)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur ${shellClass}`}
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
            >
                <div className={`flex items-center justify-between border-b px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-900/95' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDark ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700'}`}>
                            <Bot size={16} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold">Copiloto de Datos</div>
                            <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>SQL + IA + ApexCharts</div>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className={`rounded-md p-1.5 ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}
                    >
                        <Minimize2 size={15} />
                    </button>
                </div>
                <div className={`border-b px-3 py-1.5 text-[10px] ${isDark ? 'border-slate-700 bg-amber-500/10 text-amber-200' : 'border-slate-200 bg-amber-50 text-amber-700'}`}>
                    {AI_DISCLAIMER}
                </div>

                <div className={`flex-1 overflow-y-auto p-3 ${isDark ? 'bg-slate-950/60' : 'bg-white'}`}>
                    <div className="flex flex-col gap-3">
                        {messages.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            return (
                                <motion.div
                                    key={idx}
                                    className={`flex w-full gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'}`}>
                                        {isUser ? <User size={12} /> : <Bot size={12} />}
                                    </div>
                                    <div
                                        className={`max-w-[86%] overflow-hidden rounded-2xl p-2.5 text-xs ${isUser
                                            ? 'rounded-tr-none bg-blue-600 text-white'
                                            : isDark
                                                ? 'rounded-tl-none border border-slate-700 bg-slate-900 text-slate-100'
                                                : 'rounded-tl-none border border-slate-200 bg-slate-100 text-slate-800'
                                            }`}
                                    >
                                        {msg.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>}

                                        {msg.chartConfig && (
                                            <div className={`mt-3 overflow-hidden rounded-xl border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                                <div className="h-[220px] w-full p-1">
                                                    <ApexChart config={msg.chartConfig} />
                                                </div>
                                                <button
                                                    onClick={() => handleAddToDashboard(msg.chartConfig)}
                                                    disabled={!canInsertToDashboard}
                                                    title={canInsertToDashboard ? 'Agregar al tablero' : 'Solo lectura: no puedes insertar'}
                                                    className={`flex w-full items-center justify-center gap-1 border-t py-2 text-[11px] font-medium ${
                                                        canInsertToDashboard
                                                            ? (isDark ? 'border-slate-700 bg-slate-900 text-cyan-300 hover:bg-slate-800' : 'border-slate-200 bg-slate-50 text-cyan-700 hover:bg-slate-100')
                                                            : (isDark ? 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500' : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400')
                                                    }`}
                                                >
                                                    <Plus size={12} /> {canInsertToDashboard ? 'Agregar al tablero' : 'Solo lectura'}
                                                </button>
                                            </div>
                                        )}

                                        {msg.tableData && msg.tableData.length > 0 && (
                                            <div className={`mt-2 overflow-hidden rounded-lg border ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-[10px]">
                                                        <thead className={isDark ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-600'}>
                                                            <tr>
                                                                {Object.keys(msg.tableData[0]).map((k) => (
                                                                    <th key={k} className={`border-b px-2 py-1 font-medium ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                                                                        {k}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {msg.tableData.slice(0, 5).map((row: any, rowIndex: number) => (
                                                                <tr key={rowIndex} className={isDark ? 'border-b border-slate-800' : 'border-b border-slate-100'}>
                                                                    {Object.values(row).map((value: any, cellIndex: number) => (
                                                                        <td key={cellIndex} className={`max-w-[120px] truncate px-2 py-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                            {String(value)}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {msg.tableData.length > 5 && (
                                                    <button
                                                        onClick={() => setExpandedTable(msg.tableData || null)}
                                                        className={`flex w-full items-center justify-center gap-1 border-t py-1.5 text-[10px] ${isDark ? 'border-slate-700 text-cyan-300 hover:bg-slate-900' : 'border-slate-200 text-cyan-700 hover:bg-slate-50'}`}
                                                    >
                                                        <Maximize2 size={10} /> Ver {msg.tableData.length} filas
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}

                        {isLoading && (
                            <div className="flex gap-2">
                                <div className={`flex h-6 w-6 items-center justify-center rounded-full ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>
                                    <Bot size={12} />
                                </div>
                                <div className={`flex items-center gap-1 rounded-2xl rounded-tl-none border px-2.5 py-2 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-100'}`}>
                                    <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} style={{ animationDelay: '0ms' }} />
                                    <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} style={{ animationDelay: '120ms' }} />
                                    <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} style={{ animationDelay: '240ms' }} />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className={`border-t p-2.5 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="mb-2 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setResponseMode('auto')}
                            className={`rounded-md px-2 py-1 text-[10px] ${responseMode === 'auto'
                                ? 'bg-cyan-600 text-white'
                                : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                        >
                            Auto
                        </button>
                        <button
                            type="button"
                            onClick={() => setResponseMode('chart')}
                            className={`rounded-md px-2 py-1 text-[10px] ${responseMode === 'chart'
                                ? 'bg-cyan-600 text-white'
                                : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                        >
                            Graficar
                        </button>
                        <button
                            type="button"
                            onClick={() => setResponseMode('summary')}
                            className={`rounded-md px-2 py-1 text-[10px] ${responseMode === 'summary'
                                ? 'bg-cyan-600 text-white'
                                : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                        >
                            Resumir
                        </button>
                        <span className={`ml-auto text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Modo: {responseMode === 'auto' ? 'automatico' : responseMode === 'chart' ? 'grafico' : 'resumen'}
                        </span>
                    </div>
                    <form onSubmit={handleSend} className="relative flex items-center">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Describe la consulta, grafico o resumen"
                            className={`w-full rounded-xl border py-2 pl-3 pr-10 text-xs outline-none transition ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-cyan-500' : 'border-slate-300 bg-white text-slate-800 focus:border-cyan-500'}`}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-1 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 p-1.5 text-white transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Send size={12} />
                        </button>
                    </form>
                </div>
            </motion.div>

            {typeof document !== 'undefined'
                ? createPortal(
                    <AnimatePresence>
                        {expandedTable && (
                            <motion.div
                                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
                                onClick={() => setExpandedTable(null)}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <motion.div
                                    className={`flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
                                    onClick={(e) => e.stopPropagation()}
                                    initial={{ y: 16, scale: 0.98 }}
                                    animate={{ y: 0, scale: 1 }}
                                    exit={{ y: 16, scale: 0.98 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                                            <Database size={16} className={isDark ? 'text-cyan-300' : 'text-cyan-700'} />
                                            Vista completa ({expandedTable.length} filas)
                                        </h3>
                                        <button
                                            onClick={() => setExpandedTable(null)}
                                            className={`rounded-md p-1.5 ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className={`${isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'} sticky top-0`}>
                                                <tr>
                                                    {Object.keys(expandedTable[0] || {}).map((key) => (
                                                        <th key={key} className={`border-b px-4 py-2 font-medium ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                                                            {key}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {expandedTable.map((row: any, rowIndex: number) => (
                                                    <tr key={rowIndex} className={isDark ? 'border-b border-slate-800' : 'border-b border-slate-100'}>
                                                        {Object.values(row).map((value: any, colIndex: number) => (
                                                            <td key={colIndex} className={`px-4 py-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                {String(value)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body,
                )
                : null}
        </>
    );
};


