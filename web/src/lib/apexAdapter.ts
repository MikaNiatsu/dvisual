import type { ApexOptions } from 'apexcharts';

type ApexType = 'bar' | 'line' | 'pie' | 'scatter' | 'radar';
type AxisSeries = Array<{ name: string; data: Array<number | { x: string | number; y: number }> }>;
type NonAxisSeries = number[];

export interface ApexFigure {
    type: ApexType;
    options: ApexOptions;
    series: AxisSeries | NonAxisSeries;
    getLabelFromSelection: (seriesIndex: number, dataPointIndex: number) => string | number | null;
}

const DEFAULT_COLORS = ['#06b6d4', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

const asNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    if (value == null) return 0;
    const parsed = Number(String(value).replace(/[$,%\s]/g, '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value: unknown): string => (value == null ? '' : String(value));
const formatCompactNumber = (value: unknown): string => {
    const numeric = asNumber(value);
    if (!Number.isFinite(numeric)) return '0';
    const abs = Math.abs(numeric);
    const maxDecimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
    return numeric.toLocaleString('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
    });
};

const baseOptions = (config: Record<string, unknown>, type: ApexType): ApexOptions => {
    const palette = Array.isArray(config.color) && config.color.length > 0 ? config.color as string[] : DEFAULT_COLORS;
    const styleCfg = (config.style && typeof config.style === 'object' ? config.style : {}) as {
        smoothLines?: boolean;
        showDataLabels?: boolean;
        showGrid?: boolean;
    };
    const currentTheme = typeof document !== 'undefined'
        ? document.documentElement.getAttribute('data-theme') || localStorage.getItem('dvisual_theme')
        : null;
    const isDark = currentTheme === 'dark';
    const sharedTooltip = type === 'line' || type === 'bar';
    const showDataLabels = typeof styleCfg.showDataLabels === 'boolean' ? styleCfg.showDataLabels : (type === 'pie' || type === 'radar');
    const showGrid = styleCfg.showGrid !== false;

    return {
        chart: {
            type,
            toolbar: { show: false },
            zoom: { enabled: false },
            animations: { enabled: true, speed: 280 },
            background: 'transparent',
            foreColor: isDark ? '#cbd5e1' : '#475569',
        },
        colors: palette,
        dataLabels: { enabled: showDataLabels },
        stroke: {
            show: true,
            curve: type === 'line' ? (styleCfg.smoothLines === false ? 'straight' : 'smooth') : 'straight',
            width: type === 'line' ? 3 : 2,
        },
        grid: {
            show: showGrid,
            borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.25)',
            strokeDashArray: 3,
        },
        plotOptions: {
            bar: {},
            line: {},
            pie: {},
            radar: {},
        },
        legend: {
            show: config.legend !== undefined ? (config.legend as { show?: boolean }).show !== false : true,
            position: 'bottom',
            labels: {
                colors: isDark ? '#cbd5e1' : '#475569',
            },
        },
        title: {
            text: (config.title as { text?: string })?.text || '',
            align: (config.title as { left?: string })?.left === 'center'
                ? 'center'
                : (config.title as { left?: string })?.left === 'right'
                    ? 'right'
                    : 'left',
            style: {
                fontSize: '14px',
                fontWeight: 600,
                color: isDark ? '#e2e8f0' : '#0f172a',
            },
        },
        tooltip: {
            shared: sharedTooltip,
            intersect: sharedTooltip ? false : true,
            theme: isDark ? 'dark' : 'light',
            y: {
                formatter: (value: number) => formatCompactNumber(value),
            },
        },
    };
};

const buildPieFigure = (config: Record<string, unknown>): ApexFigure => {
    const options = baseOptions(config, 'pie');
    const seriesData = Array.isArray((config.series as unknown[])) ? (config.series as Array<Record<string, unknown>>) : [];

    let labels: string[] = [];
    let values: number[] = [];

    if (seriesData.length > 0 && Array.isArray(seriesData[0].data) && typeof seriesData[0].data[0] === 'object') {
        const rows = seriesData[0].data as Array<Record<string, unknown>>;
        labels = rows.map((row) => asText(row.name));
        values = rows.map((row) => asNumber(row.value));
    } else if (seriesData.length > 1) {
        labels = seriesData.map((s, idx) => asText(s.name) || `Serie ${idx + 1}`);
        values = seriesData.map((s) => (
            Array.isArray(s.data)
                ? (s.data as unknown[]).reduce<number>((acc, v) => acc + asNumber(v), 0)
                : 0
        ));
    } else {
        labels = ['Sin datos'];
        values = [0];
    }

    return {
        type: 'pie',
        options: {
            ...options,
            labels,
            plotOptions: {
                pie: {
                    donut: { size: '55%' },
                },
            },
        },
        series: values,
        getLabelFromSelection: (_seriesIndex, dataPointIndex) => labels[dataPointIndex] ?? null,
    };
};

const buildRadarFigure = (config: Record<string, unknown>): ApexFigure => {
    const options = baseOptions(config, 'radar');
    const radarConfig = config.radar as { indicator?: Array<{ name?: string }> } | undefined;
    const labels = Array.isArray(radarConfig?.indicator)
        ? radarConfig!.indicator!.map((indicator) => asText(indicator.name))
        : [];
    const sourceSeries = Array.isArray(config.series) ? (config.series as Array<Record<string, unknown>>) : [];
    const radarRows = sourceSeries[0] && Array.isArray(sourceSeries[0].data)
        ? sourceSeries[0].data as Array<Record<string, unknown>>
        : [];

    const series: AxisSeries = radarRows.map((row, idx) => ({
        name: asText(row.name) || `Serie ${idx + 1}`,
        data: Array.isArray(row.value) ? (row.value as unknown[]).map(asNumber) : [],
    }));

    return {
        type: 'radar',
        options: {
            ...options,
            xaxis: { categories: labels },
        },
        series,
        getLabelFromSelection: (_seriesIndex, dataPointIndex) => labels[dataPointIndex] ?? null,
    };
};

const buildScatterFigure = (config: Record<string, unknown>): ApexFigure => {
    const options = baseOptions(config, 'scatter');
    const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
    const sourceSeries = Array.isArray(config.series) ? (config.series as Array<Record<string, unknown>>) : [];
    const xSource = (config.xAxis as { data?: unknown[] } | undefined)?.data;
    const xData = Array.isArray(xSource) ? xSource : [];

    const series: AxisSeries = sourceSeries.map((serie, idx) => {
        const rawData = Array.isArray(serie.data) ? serie.data as unknown[] : [];
        const points = rawData.map((item, pointIdx) => {
            if (Array.isArray(item)) {
                return { x: asNumber(item[0]), y: asNumber(item[1]) };
            }
            const xValue = xData[pointIdx] ?? pointIdx + 1;
            return { x: asText(xValue), y: asNumber(item) };
        });

        return {
            name: asText(serie.name) || `Serie ${idx + 1}`,
            data: points,
        };
    });

    return {
        type: 'scatter',
        options: {
            ...options,
            xaxis: {
                tickAmount: 6,
                labels: {
                    style: {
                        colors: isDark ? '#94a3b8' : '#64748b',
                    },
                },
            },
            yaxis: {
                labels: {
                    style: {
                        colors: isDark ? '#94a3b8' : '#64748b',
                    },
                },
            },
            markers: {
                size: 6,
            },
        },
        series,
        getLabelFromSelection: (seriesIndex, dataPointIndex) => {
            const point = series[seriesIndex]?.data[dataPointIndex];
            if (!point || typeof point !== 'object' || !('x' in point)) return null;
            return point.x;
        },
    };
};

const buildAxisFigure = (config: Record<string, unknown>, type: 'bar' | 'line'): ApexFigure => {
    const options = baseOptions(config, type);
    const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
    const sourceSeries = Array.isArray(config.series) ? (config.series as Array<Record<string, unknown>>) : [];
    const xSource = (config.xAxis as { data?: unknown[] } | undefined)?.data;
    const xData = Array.isArray(xSource) ? xSource.map(asText) : [];

    const series: AxisSeries = sourceSeries.map((serie, idx) => ({
        name: asText(serie.name) || `Serie ${idx + 1}`,
        data: Array.isArray(serie.data) ? (serie.data as unknown[]).map(asNumber) : [],
    }));

    return {
        type,
        options: {
            ...options,
            xaxis: {
                categories: xData,
                title: { text: (config.xAxis as { name?: string } | undefined)?.name || '' },
                labels: {
                    style: {
                        colors: isDark ? '#94a3b8' : '#64748b',
                    },
                },
            },
            yaxis: {
                title: { text: (config.yAxis as { name?: string } | undefined)?.name || '' },
                labels: {
                    formatter: (value: number) => formatCompactNumber(value),
                    style: {
                        colors: isDark ? '#94a3b8' : '#64748b',
                    },
                },
            },
            ...(type === 'bar'
                ? {
                    plotOptions: {
                        ...(options.plotOptions || {}),
                        bar: {
                            borderRadius: 4,
                            columnWidth: '52%',
                        },
                    },
                }
                : {}),
        },
        series,
        getLabelFromSelection: (_seriesIndex, dataPointIndex) => xData[dataPointIndex] ?? null,
    };
};

const fallbackFigure = (title = 'Sin datos'): ApexFigure => ({
    type: 'bar',
    options: {
        ...baseOptions({ title: { text: title } }, 'bar'),
        xaxis: { categories: ['Sin datos'] },
    },
    series: [{ name: 'Valor', data: [0] }],
    getLabelFromSelection: () => null,
});

export const toApexFigure = (config: Record<string, unknown> | null | undefined): ApexFigure => {
    if (!config) return fallbackFigure('Sin configuracion');
    if ((config as { kpi?: unknown }).kpi) return fallbackFigure('KPI');
    if ((config as { __emptyFiltered?: boolean }).__emptyFiltered) return fallbackFigure('Sin datos para filtro');

    const series = Array.isArray(config.series) ? config.series as Array<Record<string, unknown>> : [];
    const chartHint = asText((config.chart as { type?: string } | undefined)?.type).toLowerCase();

    if (chartHint === 'pie' && Array.isArray(config.series) && typeof config.series[0] === 'number') {
        const labels = Array.isArray((config as { labels?: unknown[] }).labels)
            ? ((config as { labels?: unknown[] }).labels as unknown[]).map(asText)
            : (config.series as unknown[]).map((_value, idx) => `Serie ${idx + 1}`);
        return {
            type: 'pie',
            options: {
                ...baseOptions(config, 'pie'),
                labels,
            },
            series: (config.series as unknown[]).map(asNumber),
            getLabelFromSelection: (_seriesIndex, dataPointIndex) => labels[dataPointIndex] ?? null,
        };
    }

    const firstType = asText(series[0]?.type || chartHint || 'bar').toLowerCase();

    if (firstType === 'pie') return buildPieFigure(config);
    if (firstType === 'radar') return buildRadarFigure(config);
    if (firstType === 'scatter') return buildScatterFigure(config);
    if (firstType === 'line') return buildAxisFigure(config, 'line');
    if (firstType === 'bar') return buildAxisFigure(config, 'bar');

    return buildAxisFigure(config, 'bar');
};
