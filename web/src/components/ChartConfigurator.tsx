import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Eye, Hash, LineChart, BarChart, PieChart, ScatterChart, Radar, Save, X } from 'lucide-react';
import type { RootState } from '../store';
import { updateWidget } from '../store/dashboardSlice';
import { getDuckDB } from '../lib/duckdb';
import { applyDVisualTheme, buildChartConfig } from '../lib/chartTheme';
import { ApexChart } from './ApexChart';
import { useThemeMode } from '../lib/theme';

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'kpi' | 'radar';
type Aggregation = 'SUM' | 'COUNT' | 'COUNT_DISTINCT' | 'COUNT_ROWS' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
type TimeUnit = 'day' | 'month' | 'year';
type WidgetTitleAlign = 'left' | 'center' | 'right';
type ChartThemePreset = 'default' | 'pastel' | 'dark' | 'vibrant' | 'nature' | 'custom';

interface ChartConfiguratorProps {
    widgetId: string;
    dashboardId: string;
    onClose?: () => void;
}

interface Relationship {
    table1: string;
    col1: string;
    table2: string;
    col2: string;
    type: 'suggested' | 'confirmed';
}

interface ColumnOption {
    value: string;
    label: string;
    type: string;
}

const stripNum = (ref: string) =>
    `TRY_CAST(REPLACE(REPLACE(REPLACE(CAST(${ref} AS VARCHAR), '$', ''), ',', ''), ' ', '') AS DOUBLE)`;
const asTimestamp = (ref: string) =>
    `COALESCE(
        TRY_CAST(${ref} AS TIMESTAMP),
        TRY_CAST(TO_TIMESTAMP(TRY_CAST(${ref} AS DOUBLE)) AS TIMESTAMP),
        TRY_CAST(TO_TIMESTAMP(TRY_CAST(${ref} AS DOUBLE) / 1000.0) AS TIMESTAMP)
    )`;
const safeNum = (value: unknown) => (value == null ? 0 : Number(value) || 0);
const parseCustomColors = (value: string) => (
    value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(item))
);
const parseSeriesAliasMap = (value: string): Record<string, string> => {
    const out: Record<string, string> = {};
    value.split('\n').forEach((line) => {
        const cleaned = line.trim();
        if (!cleaned) return;
        const sep = cleaned.includes('=') ? '=' : ':';
        const idx = cleaned.indexOf(sep);
        if (idx === -1) return;
        const from = cleaned.slice(0, idx).trim();
        const to = cleaned.slice(idx + 1).trim();
        if (!from || !to) return;
        out[from] = to;
    });
    return out;
};
const serializeSeriesAliasMap = (map?: Record<string, string>) => {
    if (!map) return '';
    return Object.entries(map)
        .filter(([from, to]) => from && to)
        .map(([from, to]) => `${from}=${to}`)
        .join('\n');
};

export const ChartConfigurator: React.FC<ChartConfiguratorProps> = ({ widgetId, dashboardId, onClose }) => {
    const dispatch = useDispatch();
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const tables = useSelector((state: RootState) => state.datasets.tables);
    const widget = useSelector((state: RootState) => (state.dashboard as any).widgets[widgetId]);

    const [selectedTable, setSelectedTable] = useState('');
    const [selectedX, setSelectedX] = useState('');
    const [selectedY, setSelectedY] = useState<string[]>([]);
    const [chartType, setChartType] = useState<ChartType>('bar');
    const [aggregation, setAggregation] = useState<Aggregation>('SUM');
    const [seriesBy, setSeriesBy] = useState('');
    const [timeGranularity, setTimeGranularity] = useState<TimeUnit>('day');
    const [kpiTimeColumn, setKpiTimeColumn] = useState('');
    const [kpiWindowValue, setKpiWindowValue] = useState(30);
    const [kpiWindowUnit, setKpiWindowUnit] = useState<TimeUnit>('day');
    const [kpiThresholds, setKpiThresholds] = useState({ low: 0, high: 0 });
    const [kpiLegend, setKpiLegend] = useState('');
    const [kpiFilterXAxis, setKpiFilterXAxis] = useState('');
    const [showLegend, setShowLegend] = useState(true);
    const [widgetTitle, setWidgetTitle] = useState('');
    const [showWidgetTitle, setShowWidgetTitle] = useState(true);
    const [titleAlign, setTitleAlign] = useState<WidgetTitleAlign>('left');
    const [chartInternalTitle, setChartInternalTitle] = useState('');
    const [xAxisLabel, setXAxisLabel] = useState('');
    const [yAxisLabel, setYAxisLabel] = useState('');
    const [seriesAliasesText, setSeriesAliasesText] = useState('');
    const [widgetBgColor, setWidgetBgColor] = useState(isDark ? '#0f172a' : '#ffffff');
    const [widgetBgOpacity, setWidgetBgOpacity] = useState(isDark ? 0.95 : 1);
    const [chartThemePreset, setChartThemePreset] = useState<ChartThemePreset>('default');
    const [customThemeColors, setCustomThemeColors] = useState('');
    const [smoothLines, setSmoothLines] = useState(true);
    const [showDataLabels, setShowDataLabels] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [previewConfig, setPreviewConfig] = useState<Record<string, unknown> | null>(null);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const style = widget?.style || {};
        const cfg = widget?.chartConfig as Record<string, any> | undefined;
        const extra = widget?.dataSource?.extraFields || {};

        setWidgetTitle(widget?.title || '');
        setShowWidgetTitle(style.showTitle !== false);
        setTitleAlign((style.titleAlign || 'left') as WidgetTitleAlign);
        setWidgetBgColor(style.bgColor || (isDark ? '#0f172a' : '#ffffff'));
        setWidgetBgOpacity(typeof style.bgOpacity === 'number' ? style.bgOpacity : (isDark ? 0.95 : 1));
        setChartInternalTitle(extra.chartInternalTitle || '');
        setXAxisLabel(extra.xAxisLabel || '');
        setYAxisLabel(extra.yAxisLabel || '');
        setSeriesAliasesText(serializeSeriesAliasMap(extra.seriesAliasMap));

        const themeFromExtra = extra.chartThemePreset as ChartThemePreset | undefined;
        const themeFromMeta = cfg?.meta?.themePreset as ChartThemePreset | undefined;
        const resolvedTheme = themeFromExtra || themeFromMeta || 'default';
        setChartThemePreset(resolvedTheme);
        setCustomThemeColors(Array.isArray(cfg?.color) ? (cfg?.color as string[]).join(', ') : (extra.customThemeColors || ''));
        setSmoothLines((cfg?.style?.smoothLines ?? extra.smoothLines ?? true) !== false);
        setShowDataLabels(Boolean(cfg?.style?.showDataLabels ?? extra.showDataLabels ?? false));
        setShowGrid((cfg?.style?.showGrid ?? extra.showGrid ?? true) !== false);

        const ds = widget?.dataSource;
        if (!ds) return;
        setSelectedTable(ds.extraFields?.baseTable || ds.tableName || '');
        setSelectedX(ds.xAxis || '');
        setSelectedY(Array.isArray(ds.yAxis) ? ds.yAxis : ds.yAxis ? [ds.yAxis] : []);
        setChartType((ds.chartType || 'bar') as ChartType);
        setAggregation((ds.extraFields?.aggregation || 'SUM') as Aggregation);
        setSeriesBy(ds.extraFields?.seriesBy || '');
        setTimeGranularity((ds.extraFields?.timeGranularity || 'day') as TimeUnit);
        setKpiTimeColumn(ds.extraFields?.kpiTimeColumn || '');
        setKpiWindowValue(ds.extraFields?.kpiWindowValue || 30);
        setKpiWindowUnit((ds.extraFields?.kpiWindowUnit || 'day') as TimeUnit);
        setKpiThresholds(ds.extraFields?.kpiThresholds || { low: 0, high: 0 });
        setKpiLegend(ds.extraFields?.kpiLegend || cfg?.kpi?.label || '');
        setKpiFilterXAxis(ds.extraFields?.kpiFilterXAxis || '');
        const legendFromExtra = ds.extraFields?.showLegend;
        const legendFromConfig = (widget?.chartConfig as { legend?: { show?: boolean } } | undefined)?.legend?.show;
        setShowLegend(typeof legendFromExtra === 'boolean' ? legendFromExtra : legendFromConfig !== false);
    }, [widget, isDark]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(`dvisual_relations_${dashboardId}`);
            const parsed = raw ? JSON.parse(raw) : [];
            setRelationships(Array.isArray(parsed) ? parsed : []);
        } catch {
            setRelationships([]);
        }
    }, [dashboardId]);

    const availableColumns = useMemo<ColumnOption[]>(() => {
        if (!selectedTable) return [];
        const related = new Set<string>([selectedTable]);
        relationships.filter((r) => r.type === 'confirmed').forEach((r) => {
            if (r.table1 === selectedTable) related.add(r.table2);
            if (r.table2 === selectedTable) related.add(r.table1);
        });
        const out: ColumnOption[] = [];
        Array.from(related).forEach((tableName) => {
            const table = tables.find((t: any) => t.name === tableName);
            table?.columns?.forEach((c: any) => {
                out.push({ value: `${tableName}.${c.name}`, label: `${tableName}.${c.name}`, type: String(c.type || '') });
            });
        });
        return out;
    }, [relationships, selectedTable, tables]);

    const selectedXType = useMemo(() => (
        (availableColumns.find((c) => c.value === selectedX)?.type || '').toUpperCase()
    ), [availableColumns, selectedX]);
    const selectedYType = useMemo(() => (
        (availableColumns.find((c) => c.value === selectedY[0])?.type || '').toUpperCase()
    ), [availableColumns, selectedY]);
    const selectedYIsTextLike = useMemo(() => (
        selectedYType.includes('CHAR')
        || selectedYType.includes('TEXT')
        || selectedYType.includes('STRING')
        || selectedYType.includes('VARCHAR')
    ), [selectedYType]);
    const hasTemporalXAxis = selectedXType.includes('DATE') || selectedXType.includes('TIME');
    const seriesCandidates = useMemo(() => {
        const currentSeries = Array.isArray((previewConfig as any)?.series)
            ? ((previewConfig as any).series as Array<{ name?: string }>).map((s) => String(s?.name || '').trim()).filter(Boolean)
            : [];
        if (currentSeries.length > 0) return Array.from(new Set(currentSeries));
        const widgetSeries = Array.isArray((widget?.chartConfig as any)?.series)
            ? (((widget?.chartConfig as any).series as Array<{ name?: string }>).map((s) => String(s?.name || '').trim()).filter(Boolean))
            : [];
        if (widgetSeries.length > 0) return Array.from(new Set(widgetSeries));
        return Array.from(new Set(selectedY));
    }, [previewConfig, widget?.chartConfig, selectedY]);

    useEffect(() => {
        if (chartType !== 'kpi') return;
        if (!selectedYIsTextLike) return;
        if (aggregation === 'COUNT' || aggregation === 'COUNT_DISTINCT' || aggregation === 'COUNT_ROWS') return;
        setAggregation('COUNT');
    }, [aggregation, chartType, selectedYIsTextLike]);

    const getSQLConfig = async () => {
        if (!selectedTable) throw new Error('Selecciona tabla');
        if (chartType !== 'kpi' && (!selectedX || selectedY.length === 0)) throw new Error('Selecciona X y Y');
        if (chartType === 'kpi' && selectedY.length === 0) throw new Error('Selecciona un valor KPI');

        const split = (field: string) => {
            const idx = field.indexOf('.');
            return idx === -1 ? { table: selectedTable, column: field } : { table: field.slice(0, idx), column: field.slice(idx + 1) };
        };
        const usedTables = new Set<string>();
        [selectedX, ...selectedY, seriesBy, kpiTimeColumn, kpiFilterXAxis].filter(Boolean).forEach((field) => usedTables.add(split(field).table));
        const alias: Record<string, string> = {};
        alias[selectedTable] = 't0';
        let idx = 1;
        Array.from(usedTables).filter((t) => t !== selectedTable).forEach((t) => { alias[t] = `t${idx++}`; });
        let fromSql = `"${selectedTable}" ${alias[selectedTable]}`;
        for (const table of Object.keys(alias).filter((t) => t !== selectedTable)) {
            const rel = relationships.find((r) => r.type === 'confirmed' && ((r.table1 === selectedTable && r.table2 === table) || (r.table2 === selectedTable && r.table1 === table)));
            if (!rel) throw new Error(`Relacion faltante entre ${selectedTable} y ${table}`);
            const l = rel.table1 === selectedTable ? rel.col1 : rel.col2;
            const r = rel.table1 === selectedTable ? rel.col2 : rel.col1;
            fromSql += ` JOIN "${table}" ${alias[table]} ON ${alias[selectedTable]}."${l}" = ${alias[table]}."${r}"`;
        }
        const ref = (field: string) => {
            const f = split(field);
            return `${alias[f.table]}."${f.column}"`;
        };
        const aggregateValue = (rawRef: string, numericRef: string) => {
            if (aggregation === 'COUNT') return `COUNT(${rawRef})`;
            if (aggregation === 'COUNT_DISTINCT') return `COUNT(DISTINCT ${rawRef})`;
            if (aggregation === 'COUNT_ROWS') return 'COUNT(*)';
            if (aggregation === 'NONE') return `SUM(${numericRef})`;
            return `${aggregation}(${numericRef})`;
        };

        if (chartType === 'kpi') {
            const metricRaw = ref(selectedY[0]);
            const metricNum = stripNum(metricRaw);
            const valueExpr = aggregation === 'COUNT_ROWS'
                ? '1'
                : (aggregation === 'COUNT' || aggregation === 'COUNT_DISTINCT')
                    ? metricRaw
                    : metricNum;
            const aggOnBase = aggregation === 'COUNT_ROWS'
                ? 'COUNT(*)'
                : (aggregation === 'COUNT')
                    ? 'COUNT(v)'
                    : (aggregation === 'COUNT_DISTINCT')
                        ? 'COUNT(DISTINCT v)'
                        : (aggregation === 'NONE')
                            ? 'SUM(v)'
                            : `${aggregation}(v)`;
            if (kpiTimeColumn) {
                const ts = asTimestamp(ref(kpiTimeColumn));
                const iv = `${Math.max(1, Number(kpiWindowValue || 1))} ${kpiWindowUnit}`;
                return `
                    WITH base AS (
                        SELECT ${ts} AS t, ${valueExpr} AS v
                        FROM ${fromSql}
                        WHERE ${ts} IS NOT NULL
                    ),
                    dates AS (SELECT MAX(t) AS max_t FROM base),
                    ranges AS (
                        SELECT CAST(max_t AS TIMESTAMP) AS max_t,
                               CAST(max_t AS TIMESTAMP) - INTERVAL '${iv}' AS start_curr,
                               CAST(max_t AS TIMESTAMP) - INTERVAL '${iv}' * 2 AS start_prev,
                               CAST(max_t AS TIMESTAMP) - INTERVAL '${iv}' AS end_prev
                        FROM dates
                    )
                    SELECT
                        COALESCE((SELECT ${aggOnBase} FROM base, ranges WHERE t > start_curr AND t <= max_t), 0) AS current_value,
                        COALESCE((SELECT ${aggOnBase} FROM base, ranges WHERE t > start_prev AND t <= end_prev), 0) AS previous_value
                `;
            }
            return `SELECT COALESCE(${aggregateValue(metricRaw, metricNum)}, 0) AS current_value, NULL AS previous_value FROM ${fromSql}`;
        }

        if (chartType === 'scatter') {
            return `SELECT ${stripNum(ref(selectedX))} AS "${selectedX}", ${selectedY.map((y) => `${stripNum(ref(y))} AS "${y}"`).join(', ')} FROM ${fromSql}`;
        }

        let xExpr = ref(selectedX);
        if (hasTemporalXAxis) {
            const ts = asTimestamp(ref(selectedX));
            xExpr = timeGranularity === 'month' ? `DATE_TRUNC('month', ${ts})` : timeGranularity === 'year' ? `DATE_TRUNC('year', ${ts})` : ts;
        }
        if (aggregation === 'NONE') {
            return `SELECT ${xExpr} AS "${selectedX}", ${selectedY.map((y) => `${stripNum(ref(y))} AS "${y}"`).join(', ')}${seriesBy ? `, ${ref(seriesBy)} AS "${seriesBy}"` : ''} FROM ${fromSql}`;
        }
        return `SELECT ${xExpr} AS "${selectedX}"${seriesBy ? `, ${ref(seriesBy)} AS "${seriesBy}"` : ''}, ${selectedY.map((y) => {
            const yRaw = ref(y);
            const yNum = stripNum(yRaw);
            return `${aggregateValue(yRaw, yNum)} AS "${y}"`;
        }).join(', ')} FROM ${fromSql} GROUP BY ${xExpr}${seriesBy ? `, ${ref(seriesBy)}` : ''} ORDER BY ${xExpr}`;
    };

    const generateConfig = async () => {
        const db = getDuckDB();
        const conn = await db.connect();
        try {
            const result = await conn.query(await getSQLConfig());
            const rows = result.toArray().map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
            if (!rows.length) throw new Error('No hay datos');
            if (chartType === 'kpi') {
                const current = safeNum(rows[0].current_value);
                const previous = rows[0].previous_value == null ? null : safeNum(rows[0].previous_value);
                return { kpi: { label: kpiLegend.trim() || selectedY[0], value: current, previous, deltaPct: previous == null || previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100, thresholds: kpiThresholds, window: kpiTimeColumn ? { value: kpiWindowValue, unit: kpiWindowUnit, column: kpiTimeColumn } : null } };
            }
            const shouldFormatTime = hasTemporalXAxis && chartType !== 'scatter';
            const themeForBuilder = chartThemePreset === 'custom' ? 'default' : chartThemePreset;
            const themedConfig = applyDVisualTheme(
                buildChartConfig(rows, chartType, selectedX, selectedY, {
                    seriesBy,
                    time: shouldFormatTime ? selectedX : undefined,
                    timeGranularity,
                    customLabels: {
                        title: chartInternalTitle.trim() || undefined,
                        x: xAxisLabel.trim() || undefined,
                        y: yAxisLabel.trim() || undefined,
                    },
                }),
                themeForBuilder
            ) as Record<string, unknown>;
            const customColors = parseCustomColors(customThemeColors);
            if (chartThemePreset === 'custom' && customColors.length > 0) {
                themedConfig.color = customColors;
            }
            const aliasMap = parseSeriesAliasMap(seriesAliasesText);
            if (Object.keys(aliasMap).length > 0 && Array.isArray(themedConfig.series)) {
                themedConfig.series = (themedConfig.series as Array<Record<string, unknown>>).map((serie) => {
                    const name = String((serie as any)?.name || '').trim();
                    const alias = aliasMap[name];
                    return alias ? { ...serie, name: alias } : serie;
                });
            }
            const legend = themedConfig.legend && typeof themedConfig.legend === 'object' ? themedConfig.legend as Record<string, unknown> : {};
            const legendData = Array.isArray(legend.data)
                ? (legend.data as unknown[]).map((item) => {
                    const key = String(item || '').trim();
                    return aliasMap[key] || item;
                })
                : legend.data;
            themedConfig.legend = { ...legend, show: showLegend, data: legendData };
            const style = themedConfig.style && typeof themedConfig.style === 'object' ? themedConfig.style as Record<string, unknown> : {};
            themedConfig.style = { ...style, smoothLines, showDataLabels, showGrid };
            const meta = themedConfig.meta && typeof themedConfig.meta === 'object' ? themedConfig.meta as Record<string, unknown> : {};
            themedConfig.meta = { ...meta, themePreset: chartThemePreset };
            return themedConfig;
        } finally {
            await conn.close();
        }
    };

    const apply = async (previewOnly: boolean) => {
        setIsLoading(true);
        try {
            const cfg = previewOnly ? (previewConfig || (await generateConfig())) : await generateConfig();
            if (previewOnly) setPreviewConfig(cfg as Record<string, unknown>);
            else {
                const nextTitle = widgetTitle.trim() || `${chartType.toUpperCase()} - ${selectedTable}`;
                dispatch(updateWidget({
                    id: widgetId,
                    changes: {
                        type: 'chart',
                        chartConfig: cfg,
                        title: nextTitle,
                        style: {
                            ...(widget?.style || {}),
                            showTitle: showWidgetTitle,
                            titleAlign,
                            bgColor: widgetBgColor,
                            bgOpacity: widgetBgOpacity,
                            customBg: true,
                        },
                        dataSource: {
                            tableName: selectedTable,
                            xAxis: chartType === 'kpi' ? '' : selectedX,
                            yAxis: selectedY,
                            chartType,
                            extraFields: {
                                baseTable: selectedTable,
                                aggregation,
                                seriesBy,
                                timeGranularity,
                                kpiTimeColumn,
                                kpiWindowValue,
                                kpiWindowUnit,
                                kpiThresholds,
                                kpiLegend,
                                kpiFilterXAxis,
                                showLegend,
                                chartThemePreset,
                                customThemeColors,
                                smoothLines,
                                showDataLabels,
                                showGrid,
                                chartInternalTitle: chartInternalTitle.trim(),
                                xAxisLabel: xAxisLabel.trim(),
                                yAxisLabel: yAxisLabel.trim(),
                                seriesAliasMap: parseSeriesAliasMap(seriesAliasesText),
                            },
                        },
                    },
                }));
                onClose?.();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error';
            setError(`SQL Error: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const panelClass = isDark
        ? 'rounded-2xl border border-slate-700 bg-slate-950/85 p-4'
        : 'rounded-2xl border border-slate-200 bg-slate-50/90 p-4';
    const labelClass = isDark
        ? 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400'
        : 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
    const inputClass = isDark
        ? 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500'
        : 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';
    const sectionTitleClass = isDark ? 'mb-3 text-sm font-semibold text-slate-200' : 'mb-3 text-sm font-semibold text-slate-800';

    return (
        <div id="dv-chart-configurator" className={`h-full w-full overflow-auto p-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className={`text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Configurar grafica</h3>
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Define datos, estilo y comportamiento del widget.</p>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className={`rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`} aria-label="Cerrar">
                            <X size={16} />
                        </button>
                    )}
                </div>

                {error && (
                    <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                        <section className={panelClass}>
                            <div className={sectionTitleClass}>Fuente de datos</div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <label className={labelClass}>Tabla base</label>
                                    <select value={selectedTable} onChange={(e) => { setSelectedTable(e.target.value); setSelectedX(''); setSelectedY([]); setPreviewConfig(null); }} className={inputClass}>
                                        <option value="">Selecciona tabla</option>
                                        {tables.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Eje X</label>
                                    <select value={selectedX} onChange={(e) => { setSelectedX(e.target.value); setPreviewConfig(null); }} className={inputClass}>
                                        <option value="">Selecciona columna</option>
                                        {availableColumns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="mt-3">
                                <label className={labelClass}>Series Y (maximo 8)</label>
                                <div className={`max-h-44 overflow-auto rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                                    {availableColumns.length === 0 && (
                                        <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Selecciona una tabla para ver columnas.</div>
                                    )}
                                    {availableColumns.map((c) => (
                                        <label key={c.value} className={`mb-1 flex items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            <input
                                                type={chartType === 'kpi' ? 'radio' : 'checkbox'}
                                                checked={selectedY.includes(c.value)}
                                                onChange={() => {
                                                    setSelectedY((prev) => {
                                                        if (chartType === 'kpi') return [c.value];
                                                        if (prev.includes(c.value)) return prev.filter((y) => y !== c.value);
                                                        if (prev.length >= 8) return prev;
                                                        return [...prev, c.value];
                                                    });
                                                    setPreviewConfig(null);
                                                }}
                                            />
                                            {c.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3">
                                <label className={labelClass}>Tipo de grafica</label>
                                <div className={`grid grid-cols-3 gap-2 rounded-xl border p-2 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                                    {[
                                        { t: 'kpi', i: <Hash size={14} />, l: 'KPI' },
                                        { t: 'bar', i: <BarChart size={14} />, l: 'Barras' },
                                        { t: 'line', i: <LineChart size={14} />, l: 'Linea' },
                                        { t: 'pie', i: <PieChart size={14} />, l: 'Pie' },
                                        { t: 'scatter', i: <ScatterChart size={14} />, l: 'Dispersion' },
                                        { t: 'radar', i: <Radar size={14} />, l: 'Radar' },
                                    ].map((o) => (
                                        <button
                                            key={o.t}
                                            onClick={() => { setChartType(o.t as ChartType); setPreviewConfig(null); }}
                                            className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${
                                                chartType === o.t
                                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                                                    : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            {o.i} {o.l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className={panelClass}>
                            <div className={sectionTitleClass}>Contenedor del widget</div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <label className={labelClass}>Titulo del widget</label>
                                    <input
                                        value={widgetTitle}
                                        onChange={(e) => setWidgetTitle(e.target.value)}
                                        placeholder="Titulo visible en el dashboard"
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Alineacion del titulo</label>
                                    <select value={titleAlign} onChange={(e) => setTitleAlign(e.target.value as WidgetTitleAlign)} className={inputClass}>
                                        <option value="left">Izquierda</option>
                                        <option value="center">Centro</option>
                                        <option value="right">Derecha</option>
                                    </select>
                                </div>
                            </div>
                            <label className={`mt-3 inline-flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                <input type="checkbox" checked={showWidgetTitle} onChange={(e) => setShowWidgetTitle(e.target.checked)} />
                                Mostrar titulo del widget
                            </label>
                            <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                                <input type="color" value={widgetBgColor} onChange={(e) => setWidgetBgColor(e.target.value)} className="h-10 w-14 rounded-lg border border-slate-400 bg-transparent p-1" />
                                <input type="range" min={0} max={100} value={Math.round(widgetBgOpacity * 100)} onChange={(e) => setWidgetBgOpacity(Number(e.target.value) / 100)} className="w-full" />
                                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{Math.round(widgetBgOpacity * 100)}%</span>
                            </div>
                        </section>

                        {chartType !== 'kpi' && (
                            <section className={panelClass}>
                                <div className={sectionTitleClass}>Calculo y agrupacion</div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                        <label className={labelClass}>Agregacion</label>
                                        <select value={aggregation} onChange={(e) => { setAggregation(e.target.value as Aggregation); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="SUM">SUM</option>
                                            <option value="COUNT">COUNT</option>
                                            <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                                            <option value="COUNT_ROWS">COUNT ROWS</option>
                                            <option value="AVG">AVG</option>
                                            <option value="MIN">MIN</option>
                                            <option value="MAX">MAX</option>
                                            <option value="NONE">NONE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Serie adicional</label>
                                        <select value={seriesBy} onChange={(e) => { setSeriesBy(e.target.value); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="">Sin serie adicional</option>
                                            {availableColumns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {chartType !== 'scatter' && hasTemporalXAxis && (
                                    <div className="mt-3">
                                        <label className={labelClass}>Agrupar fecha</label>
                                        <select value={timeGranularity} onChange={(e) => { setTimeGranularity(e.target.value as TimeUnit); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="day">Por dias</option>
                                            <option value="month">Por meses</option>
                                            <option value="year">Por anos</option>
                                        </select>
                                    </div>
                                )}

                                <label className={`mt-3 inline-flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <input type="checkbox" checked={showLegend} onChange={(e) => { setShowLegend(e.target.checked); setPreviewConfig(null); }} />
                                    Mostrar leyenda inferior
                                </label>
                            </section>
                        )}

                        {chartType !== 'kpi' && (
                            <section className={panelClass}>
                                <div className={sectionTitleClass}>Tema y estilo de grafica</div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                        <label className={labelClass}>Tema</label>
                                        <select value={chartThemePreset} onChange={(e) => { setChartThemePreset(e.target.value as ChartThemePreset); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="default">Default</option>
                                            <option value="pastel">Pastel</option>
                                            <option value="dark">Dark</option>
                                            <option value="vibrant">Vibrante</option>
                                            <option value="nature">Nature</option>
                                            <option value="custom">Custom colores</option>
                                        </select>
                                    </div>
                                    {chartThemePreset === 'custom' && (
                                        <div>
                                            <label className={labelClass}>Colores custom</label>
                                            <input value={customThemeColors} onChange={(e) => { setCustomThemeColors(e.target.value); setPreviewConfig(null); }} placeholder="#06b6d4, #3b82f6, #22c55e" className={inputClass} />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-1">
                                    <label className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}><input type="checkbox" checked={smoothLines} onChange={(e) => { setSmoothLines(e.target.checked); setPreviewConfig(null); }} />Lineas suavizadas</label>
                                    <label className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}><input type="checkbox" checked={showDataLabels} onChange={(e) => { setShowDataLabels(e.target.checked); setPreviewConfig(null); }} />Mostrar labels de datos</label>
                                    <label className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}><input type="checkbox" checked={showGrid} onChange={(e) => { setShowGrid(e.target.checked); setPreviewConfig(null); }} />Mostrar grilla</label>
                                </div>
                            </section>
                        )}

                        {chartType !== 'kpi' && (
                            <section className={panelClass}>
                                <div className={sectionTitleClass}>Nombres y titulos internos</div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="md:col-span-3">
                                        <label className={labelClass}>Titulo interno de la grafica</label>
                                        <input
                                            value={chartInternalTitle}
                                            onChange={(e) => { setChartInternalTitle(e.target.value); setPreviewConfig(null); }}
                                            placeholder="Opcional: reemplaza el titulo default de la libreria"
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nombre eje X</label>
                                        <input
                                            value={xAxisLabel}
                                            onChange={(e) => { setXAxisLabel(e.target.value); setPreviewConfig(null); }}
                                            placeholder="Opcional"
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nombre eje Y</label>
                                        <input
                                            value={yAxisLabel}
                                            onChange={(e) => { setYAxisLabel(e.target.value); setPreviewConfig(null); }}
                                            placeholder="Opcional"
                                            className={inputClass}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <label className={labelClass}>Renombrar series</label>
                                    <textarea
                                        value={seriesAliasesText}
                                        onChange={(e) => { setSeriesAliasesText(e.target.value); setPreviewConfig(null); }}
                                        placeholder={'Una regla por linea\nnombre_original=nombre_visible'}
                                        className={`${inputClass} min-h-[96px] resize-y`}
                                    />
                                    {seriesCandidates.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {seriesCandidates.map((name) => (
                                                <button
                                                    key={name}
                                                    onClick={() => {
                                                        if (seriesAliasesText.includes(`${name}=`)) return;
                                                        const next = seriesAliasesText.trim() ? `${seriesAliasesText.trim()}\n${name}=` : `${name}=`;
                                                        setSeriesAliasesText(next);
                                                        setPreviewConfig(null);
                                                    }}
                                                    className={`rounded px-2 py-0.5 text-[10px] ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {chartType === 'kpi' && (
                            <section className={panelClass}>
                                <div className={sectionTitleClass}>Comparacion KPI</div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                        <label className={labelClass}>Agregacion KPI</label>
                                        <select value={aggregation} onChange={(e) => { setAggregation(e.target.value as Aggregation); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="SUM" disabled={selectedYIsTextLike}>SUM</option>
                                            <option value="AVG" disabled={selectedYIsTextLike}>AVG</option>
                                            <option value="MIN" disabled={selectedYIsTextLike}>MIN</option>
                                            <option value="MAX" disabled={selectedYIsTextLike}>MAX</option>
                                            <option value="COUNT">COUNT (no vacios)</option>
                                            <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                                            <option value="COUNT_ROWS">COUNT ROWS</option>
                                            <option value="NONE" disabled={selectedYIsTextLike}>NONE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Vincular con eje X</label>
                                        <select value={kpiFilterXAxis} onChange={(e) => { setKpiFilterXAxis(e.target.value); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="">Sin vinculacion especifica</option>
                                            {availableColumns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Leyenda del KPI</label>
                                        <input
                                            value={kpiLegend}
                                            onChange={(e) => { setKpiLegend(e.target.value); setPreviewConfig(null); }}
                                            placeholder="Texto visible debajo del titulo del widget"
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Columna de tiempo</label>
                                        <select value={kpiTimeColumn} onChange={(e) => { setKpiTimeColumn(e.target.value); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="">Sin comparacion</option>
                                            {availableColumns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Ventana</label>
                                        <input type="number" min={1} value={kpiWindowValue} onChange={(e) => { setKpiWindowValue(Number(e.target.value)); setPreviewConfig(null); }} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Unidad</label>
                                        <select value={kpiWindowUnit} onChange={(e) => { setKpiWindowUnit(e.target.value as TimeUnit); setPreviewConfig(null); }} className={inputClass}>
                                            <option value="day">Dias</option>
                                            <option value="month">Meses</option>
                                            <option value="year">Anos</option>
                                        </select>
                                    </div>
                                </div>
                                {selectedYIsTextLike && (
                                    <div className={`mt-2 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Serie Y detectada como texto: se recomienda usar COUNT, COUNT DISTINCT o COUNT ROWS.
                                    </div>
                                )}
                            </section>
                        )}

                        <section className={panelClass}>
                            <div className={sectionTitleClass}>Guia rapida</div>
                            <div className={`space-y-1 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                <div>1. Selecciona tabla base, eje X y series Y.</div>
                                <div>2. Elige agregacion, tema y etiquetas.</div>
                                <div>3. Usa previsualizar antes de aplicar.</div>
                                <div className="pt-1 font-semibold">Limites recomendados</div>
                                <div>- Maximo 8 series Y por grafico.</div>
                                <div>- Pie: hasta 30 categorias legibles.</div>
                                <div>- Scatter: hasta 5000 puntos por serie.</div>
                            </div>
                        </section>
                    </div>

                    <aside className={`${panelClass} h-fit xl:sticky xl:top-0`}>
                        <div className={sectionTitleClass}>Previsualizacion</div>
                        <div className={`h-[380px] overflow-hidden rounded-xl border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                            {previewConfig ? (
                                (previewConfig as any).kpi ? (
                                    <div className="flex h-full flex-col items-start justify-center p-4">
                                        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{String((previewConfig as any).kpi.label)}</div>
                                        <div className={`text-3xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{safeNum((previewConfig as any).kpi.value).toLocaleString('es-ES')}</div>
                                    </div>
                                ) : (
                                    <ApexChart key={`preview-${chartType}`} config={previewConfig} />
                                )
                            ) : (
                                <div className={`flex h-full items-center justify-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sin previsualizacion</div>
                            )}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <button onClick={() => apply(true)} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50">
                                <Eye size={14} /> Previsualizar
                            </button>
                            <button onClick={() => apply(false)} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50">
                                <Save size={14} /> Aplicar cambios
                            </button>
                            {onClose && (
                                <button onClick={onClose} className={`rounded-lg px-4 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};
