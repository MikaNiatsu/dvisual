import React, { useState, useEffect, useMemo } from 'react';
import { ApexChart } from './ApexChart';
import { useThemeMode } from '../lib/theme';
import { getDuckDB } from '../lib/duckdb';
import { Image as ImageIcon } from 'lucide-react';

interface ChartDataSource {
    tableName?: string;
    xAxis?: string;
    yAxis?: string | string[];
    chartType?: string;
    extraFields?: {
        baseTable?: string;
        aggregation?: 'SUM' | 'COUNT' | 'COUNT_DISTINCT' | 'COUNT_ROWS' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
        kpiTimeColumn?: string;
        kpiWindowValue?: number;
        kpiWindowUnit?: 'day' | 'month' | 'year';
        kpiFilterXAxis?: string;
    };
}

interface ActiveFilter {
    tableName: string;
    column: string;
    values: (string | number)[];
}

interface ChartWidgetProps {
    id?: string;
    type?: 'chart' | 'text' | 'image';
    config: any;
    onUpdate?: (widgetId: string, changes: any) => void;
    isEditing?: boolean;
    styleConfig?: {
        textColor?: string;
        fontFamily?: string;
        textAlign?: 'left' | 'center' | 'right';
        fontSize?: number;
        fontWeight?: number;
        lineHeight?: number;
    };
    dataSource?: ChartDataSource;
    activeFilters?: Record<string, ActiveFilter>;
    onFilterSelection?: (widgetId: string, source: { tableName?: string; xAxis?: string }, value: string | number | null) => void;
    refreshKey?: number;
}

const splitField = (field?: string, fallbackTable?: string) => {
    const raw = String(field || '').trim();
    if (!raw) return { tableName: fallbackTable || '', column: '' };
    const idx = raw.indexOf('.');
    if (idx === -1) return { tableName: fallbackTable || '', column: raw };
    return { tableName: raw.slice(0, idx), column: raw.slice(idx + 1) };
};

const quoteIdent = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;

const sqlValue = (value: string | number) => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
};

const stripNum = (ref: string) =>
    `TRY_CAST(REPLACE(REPLACE(REPLACE(CAST(${ref} AS VARCHAR), '$', ''), ',', ''), ' ', '') AS DOUBLE)`;

const asTimestamp = (ref: string) =>
    `COALESCE(
        TRY_CAST(${ref} AS TIMESTAMP),
        TRY_CAST(TO_TIMESTAMP(TRY_CAST(${ref} AS DOUBLE)) AS TIMESTAMP),
        TRY_CAST(TO_TIMESTAMP(TRY_CAST(${ref} AS DOUBLE) / 1000.0) AS TIMESTAMP)
    )`;

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

const ChartWidgetComponent: React.FC<ChartWidgetProps> = ({ id, type = 'chart', config, onUpdate, isEditing, styleConfig, dataSource, activeFilters, onFilterSelection, refreshKey }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const unitLabels: Record<string, string> = {
        day: 'dias',
        month: 'meses',
        year: 'anos',
    };
    const [localText, setLocalText] = useState(config?.text || '');
    const [isTextEditing, setIsTextEditing] = useState(false);
    const [runtimeKpi, setRuntimeKpi] = useState<any | null>(null);
    const [hasImageError, setHasImageError] = useState(false);

    const getFilterTarget = (tableName?: string, xAxis?: string) => {
        if (!tableName || !xAxis) return { tableName: tableName || '', column: xAxis || '' };
        const idx = xAxis.indexOf('.');
        if (idx === -1) return { tableName, column: xAxis };
        return { tableName: xAxis.slice(0, idx), column: xAxis.slice(idx + 1) };
    };

    useEffect(() => {
        if (type !== 'text') return;
        setLocalText(config?.text || '');
    }, [config, type]);

    useEffect(() => {
        if (type !== 'image') return;
        setHasImageError(false);
    }, [config?.url, type]);

    const resolvedTextAlign = styleConfig?.textAlign || 'center';
    const resolvedFontSize = Math.max(12, Math.min(64, Number(styleConfig?.fontSize || 16)));
    const resolvedFontWeight = Math.max(300, Math.min(800, Number(styleConfig?.fontWeight || 500)));
    const resolvedLineHeight = Math.max(1, Math.min(2.4, Number(styleConfig?.lineHeight || 1.4)));

    const handleTextSave = () => {
        setIsTextEditing(false);
        if (onUpdate && id && localText !== config?.text) {
            onUpdate(id, { chartConfig: { ...config, text: localText } });
        }
    };

    const chartFilterValues = useMemo(() => {
        if (!config || !dataSource || !dataSource.tableName || !dataSource.xAxis || !activeFilters) return null;
        const filterEntries = Object.values(activeFilters).filter((f) => f.values && f.values.length > 0);
        if (filterEntries.length === 0) return null;

        const target = getFilterTarget(dataSource.tableName, dataSource.xAxis);
        const targetColumnNorm = normalize(target.column);
        const valuesFromAxis = new Set<string>();
        const chartType = dataSource.chartType || '';
        if (chartType === 'pie' && Array.isArray(config?.series?.[0]?.data)) {
            config.series[0].data.forEach((row: any) => valuesFromAxis.add(normalize(row?.name)));
        } else if (Array.isArray(config?.xAxis?.data)) {
            config.xAxis.data.forEach((x: unknown) => valuesFromAxis.add(normalize(x)));
        }

        const values = new Set<string>();
        filterEntries.forEach((filter) => {
            const sameAxis = filter.tableName === target.tableName && normalize(filter.column) === targetColumnNorm;
            const similarAxis = normalize(filter.column) === targetColumnNorm;
            const overlapsCurrentValues = valuesFromAxis.size > 0 && filter.values.some((value) => valuesFromAxis.has(normalize(value)));
            if (!sameAxis && !similarAxis && !overlapsCurrentValues) return;
            filter.values.forEach((value) => values.add(normalize(value)));
        });

        if (values.size === 0) return null;
        return values;
    }, [activeFilters, config, dataSource]);

    const filteredConfig = useMemo(() => {
        if (!config || !dataSource || !chartFilterValues) return config;
        const chartType = dataSource.chartType || '';
        const base = config || {};

        if (chartType === 'pie') {
            if (!base.series || !Array.isArray(base.series) || !base.series[0] || !Array.isArray(base.series[0].data)) {
                return config;
            }
            const nextSeries = base.series.map((s: any, idx: number) => {
                if (idx !== 0 || !Array.isArray(s.data)) return s;
                const data = s.data.filter((d: any) => chartFilterValues.has(normalize(d?.name)));
                return { ...s, data };
            });
            if (nextSeries[0]?.data?.length === base.series?.[0]?.data?.length) return config;
            return { ...base, series: nextSeries };
        }

        if (!base.xAxis || !Array.isArray(base.xAxis.data) || !Array.isArray(base.series)) {
            return config;
        }

        const xData: any[] = base.xAxis.data;
        const indices = xData
            .map((v, idx) => (chartFilterValues.has(normalize(v)) ? idx : -1))
            .filter((idx) => idx >= 0);

        if (indices.length === xData.length) return config;
        if (indices.length === 0) {
            return {
                ...base,
                __emptyFiltered: true,
                xAxis: {
                    ...base.xAxis,
                    data: [],
                },
                series: base.series.map((s: any) => ({ ...s, data: [] })),
            };
        }

        const newXData = indices.map((i) => xData[i]);
        const newSeries = base.series.map((s: any) => {
            if (!Array.isArray(s.data)) return s;
            const data = indices.map((i) => s.data[i]);
            return { ...s, data };
        });

        return {
            ...base,
            xAxis: {
                ...base.xAxis,
                data: newXData,
            },
            series: newSeries,
        };
    }, [chartFilterValues, config, dataSource]);

    useEffect(() => {
        let cancelled = false;

        const runKpi = async () => {
            if (!dataSource || dataSource.chartType !== 'kpi' || !config?.kpi) {
                if (!cancelled) setRuntimeKpi(null);
                return;
            }

            const extra = dataSource.extraFields || {};
            const baseTable = String(extra.baseTable || dataSource.tableName || '').trim();
            const rawY = Array.isArray(dataSource.yAxis) ? dataSource.yAxis[0] : dataSource.yAxis;
            const yField = splitField(rawY, baseTable);
            if (!baseTable || !yField.column || (yField.tableName && yField.tableName !== baseTable)) {
                if (!cancelled) setRuntimeKpi(null);
                return;
            }

            const linkField = splitField(extra.kpiFilterXAxis, baseTable);
            const linkColumnNorm = normalize(linkField.column);
            const hasLinkAxis = !!linkColumnNorm;
            const filters = Object.values(activeFilters || {}).filter((filter) => {
                if (!filter.values || filter.values.length === 0) return false;
                if (!hasLinkAxis) return filter.tableName === baseTable;
                return normalize(filter.column) === linkColumnNorm;
            });
            if (filters.length === 0) {
                if (!cancelled) setRuntimeKpi(null);
                return;
            }
            const filterColumn = hasLinkAxis ? linkField.column : '';
            const mergedLinkValues = hasLinkAxis
                ? Array.from(new Set(filters.flatMap((filter) => filter.values).map((value) => String(value))))
                : [];
            const whereClause = hasLinkAxis
                ? (mergedLinkValues.length > 0
                    ? `t0.${quoteIdent(filterColumn)} IN (${mergedLinkValues.map((value) => sqlValue(value)).join(', ')})`
                    : '1=0')
                : filters
                    .map((filter) => {
                        const valuesSql = filter.values.map(sqlValue).join(', ');
                        return `t0.${quoteIdent(filter.column)} IN (${valuesSql})`;
                    })
                    .join(' AND ');

            const agg = (extra.aggregation || 'SUM') as 'SUM' | 'COUNT' | 'COUNT_DISTINCT' | 'COUNT_ROWS' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
            const metricRaw = `t0.${quoteIdent(yField.column)}`;
            const metricNum = stripNum(metricRaw);
            const directAgg = agg === 'COUNT_ROWS'
                ? 'COUNT(*)'
                : agg === 'COUNT'
                    ? `COUNT(${metricRaw})`
                    : agg === 'COUNT_DISTINCT'
                        ? `COUNT(DISTINCT ${metricRaw})`
                        : agg === 'NONE'
                            ? `SUM(${metricNum})`
                            : `${agg}(${metricNum})`;
            const valueExpr = agg === 'COUNT_ROWS'
                ? '1'
                : (agg === 'COUNT' || agg === 'COUNT_DISTINCT')
                    ? metricRaw
                    : metricNum;
            const aggOnBase = agg === 'COUNT_ROWS'
                ? 'COUNT(*)'
                : agg === 'COUNT'
                    ? 'COUNT(v)'
                    : agg === 'COUNT_DISTINCT'
                        ? 'COUNT(DISTINCT v)'
                        : agg === 'NONE'
                            ? 'SUM(v)'
                            : `${agg}(v)`;
            const timeField = splitField(extra.kpiTimeColumn, baseTable);
            const hasTimeComparison = !!timeField.column && (!timeField.tableName || timeField.tableName === baseTable);

            let sql = '';
            if (hasTimeComparison) {
                const ts = asTimestamp(`t0.${quoteIdent(timeField.column)}`);
                const kpiWindowValue = Math.max(1, Number(extra.kpiWindowValue || 30));
                const kpiWindowUnit = (extra.kpiWindowUnit || 'day') as 'day' | 'month' | 'year';
                const iv = `${kpiWindowValue} ${kpiWindowUnit}`;
                sql = `
                    WITH base AS (
                        SELECT ${ts} AS t, ${valueExpr} AS v
                        FROM ${quoteIdent(baseTable)} t0
                        WHERE ${ts} IS NOT NULL AND ${whereClause}
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
            } else {
                sql = `
                    SELECT COALESCE(${directAgg}, 0) AS current_value, NULL AS previous_value
                    FROM ${quoteIdent(baseTable)} t0
                    WHERE ${whereClause}
                `;
            }

            try {
                const db = getDuckDB();
                const conn = await db.connect();
                const result = await conn.query(sql);
                await conn.close();
                const row = result.toArray()[0] as any;
                if (!row || cancelled) return;

                const current = Number(row.current_value ?? 0);
                const previous = row.previous_value == null ? null : Number(row.previous_value ?? 0);
                const deltaPct = previous == null || previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

                if (!cancelled) {
                    setRuntimeKpi({
                        ...config.kpi,
                        value: current,
                        previous,
                        deltaPct,
                    });
                }
            } catch {
                if (!cancelled) setRuntimeKpi(null);
            }
        };

        runKpi();
        return () => {
            cancelled = true;
        };
    }, [activeFilters, config, dataSource, refreshKey]);

    const onEvents = useMemo(() => {
        if (!dataSource || !dataSource.tableName || !dataSource.xAxis || !onFilterSelection || !id) return undefined;
        return {
            click: (value: string | number | null) => {
                const target = getFilterTarget(dataSource.tableName, dataSource.xAxis);
                onFilterSelection(
                    id,
                    { tableName: target.tableName, xAxis: target.column },
                    value ?? null,
                );
            },
        };
    }, [dataSource, onFilterSelection, id]);

    if (type === 'image') {
        return (
            <div className="w-full h-full flex items-center justify-center overflow-hidden relative group">
                {config?.url && !hasImageError ? (
                    <img
                        src={config.url}
                        alt="Widget"
                        className="h-full w-full object-contain"
                        onError={() => setHasImageError(true)}
                    />
                ) : (
                    <div className={`flex h-full w-full flex-col items-center justify-center border-2 border-dashed ${isDark ? 'border-slate-600 bg-slate-900/80 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
                        <ImageIcon size={28} className="mb-2 opacity-80" />
                        <div className="text-sm font-medium">Widget de imagen</div>
                        <div className="mt-1 text-[11px]">Configura una URL o sube un archivo</div>
                    </div>
                )}
            </div>
        );
    }

    if (type === 'text') {
        if (isTextEditing) {
            return (
                <div className="w-full h-full p-1">
                    <textarea
                        autoFocus
                        className="w-full h-full resize-none border-none outline-none bg-transparent text-base"
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        onBlur={handleTextSave}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleTextSave();
                            }
                        }}
                        style={{
                            textAlign: resolvedTextAlign,
                            color: styleConfig?.textColor || (isDark ? '#e2e8f0' : '#374151'),
                            fontFamily: styleConfig?.fontFamily && styleConfig.fontFamily !== 'system' ? styleConfig.fontFamily : undefined,
                            fontSize: `${resolvedFontSize}px`,
                            fontWeight: resolvedFontWeight,
                            lineHeight: resolvedLineHeight,
                        }}
                    />
                </div>
            );
        }

        return (
            <div
                className={`w-full h-full flex items-start justify-start p-1.5 overflow-auto ${isEditing ? (isDark ? 'cursor-text hover:bg-slate-800/40' : 'cursor-text hover:bg-gray-50') : ''}`}
                onDoubleClick={() => {
                    if (isEditing) setIsTextEditing(true);
                }}
            >
                <p
                    className="max-w-full text-base whitespace-pre-wrap break-words"
                    style={{
                        textAlign: resolvedTextAlign,
                        color: styleConfig?.textColor || (isDark ? '#e2e8f0' : '#374151'),
                        fontFamily: styleConfig?.fontFamily && styleConfig.fontFamily !== 'system' ? styleConfig.fontFamily : undefined,
                        fontSize: `${resolvedFontSize}px`,
                        fontWeight: resolvedFontWeight,
                        lineHeight: resolvedLineHeight,
                    }}
                >
                    {config?.text || 'Doble clic para editar'}
                </p>
            </div>
        );
    }

    const renderedKpi = runtimeKpi || config?.kpi;
    const chartRenderKey = useMemo(() => {
        const effectiveConfig = (filteredConfig || config) as any;
        const series = Array.isArray(effectiveConfig?.series) ? effectiveConfig.series : [];
        const seriesTypes = series.map((s: any) => String(s?.type || '')).join(',');
        const dataLens = series.map((s: any) => (Array.isArray(s?.data) ? s.data.length : 0)).join(',');
        return [
            id || 'chart',
            refreshKey || 0,
            dataSource?.chartType || '',
            seriesTypes,
            dataLens,
        ].join('|');
    }, [id, refreshKey, dataSource?.chartType, filteredConfig, config]);

    return (
        <div className="w-full h-full flex items-center justify-center p-2">
            {!config ? (
                <div className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Sin configuracion de grafico</div>
            ) : (
                (dataSource?.chartType === 'kpi' && renderedKpi) ? (
                    <div className="w-full h-full flex flex-col justify-center items-start gap-2 px-3">
                        <div className={`text-xs tracking-wide ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{renderedKpi.label}</div>
                        <div className="text-3xl font-bold" style={{ color: (() => {
                            const low = Number(renderedKpi.thresholds?.low ?? 0);
                            const high = Number(renderedKpi.thresholds?.high ?? 0);
                            const val = Number(renderedKpi.value ?? 0);
                            if (high === 0 && low === 0) return isDark ? '#e2e8f0' : '#0f172a';
                            if (val < low) return '#dc2626';
                            if (val >= high) return '#16a34a';
                            return '#f59e0b';
                        })() }}>
                            {new Intl.NumberFormat('es-ES').format(Number(renderedKpi.value ?? 0))}
                        </div>
                        {renderedKpi.previous != null && (
                            <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                <span>Anterior: {new Intl.NumberFormat('es-ES').format(Number(renderedKpi.previous))}</span>
                                {renderedKpi.deltaPct != null && (
                                    <span className={`font-semibold ${renderedKpi.deltaPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {renderedKpi.deltaPct >= 0 ? 'Sube' : 'Baja'} {Math.abs(renderedKpi.deltaPct).toFixed(2)}%
                                    </span>
                                )}
                            </div>
                        )}
                        {renderedKpi.deltaValue != null && (
                            <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                Variacion: {new Intl.NumberFormat('es-ES').format(Number(renderedKpi.deltaValue))}
                            </div>
                        )}
                        {renderedKpi.window && (
                            <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                Comparacion: {renderedKpi.window.value} {unitLabels[String(renderedKpi.window.unit)] || String(renderedKpi.window.unit)} · {renderedKpi.window.column}
                            </div>
                        )}
                    </div>
                ) : (
                    <ApexChart
                        key={chartRenderKey}
                        config={filteredConfig || config}
                        onDataPointClick={(value) => onEvents?.click?.(value)}
                    />
                )
            )}
        </div>
    );
};

export const ChartWidget = React.memo(ChartWidgetComponent);

