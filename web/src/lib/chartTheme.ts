export const chartTheme = {
    color: ['#06b6d4', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'],
    textStyle: {
        fontFamily: "'Manrope', 'Space Grotesk', 'Segoe UI', sans-serif",
        color: '#1f2937',
    },
};

export const chartThemePastel = {
    ...chartTheme,
    color: ['#7dd3fc', '#93c5fd', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd', '#99f6e4', '#fdba74'],
};

export const chartThemeDark = {
    ...chartTheme,
    color: ['#67e8f9', '#60a5fa', '#4ade80', '#fbbf24', '#fb7185', '#a78bfa', '#2dd4bf', '#fb923c'],
    textStyle: {
        ...chartTheme.textStyle,
        color: '#e2e8f0',
    },
};

export const chartThemeVibrant = {
    ...chartTheme,
    color: ['#00bcd4', '#1d4ed8', '#16a34a', '#f97316', '#dc2626', '#9333ea', '#0ea5e9', '#84cc16'],
};

export const chartThemeNature = {
    ...chartTheme,
    color: ['#15803d', '#16a34a', '#22c55e', '#84cc16', '#65a30d', '#4d7c0f', '#166534', '#14532d'],
};

export const availableThemes = {
    default: chartTheme,
    pastel: chartThemePastel,
    dark: chartThemeDark,
    vibrant: chartThemeVibrant,
    nature: chartThemeNature,
};

export function applyDVisualTheme(config: Record<string, unknown>, themeName = 'default'): Record<string, unknown> {
    const theme = availableThemes[themeName as keyof typeof availableThemes] || chartTheme;
    const next = { ...config };
    if (!next.color) next.color = theme.color;
    if (!next.textStyle) next.textStyle = theme.textStyle;
    return next;
}

const toText = (value: unknown) => (value == null ? '' : String(value));
const toNumber = (value: unknown) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    if (value == null) return 0;
    const parsed = Number(String(value).replace(/[$,%\s]/g, '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: unknown, granularity: 'day' | 'month' | 'year' = 'day') => {
    if (value == null) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return toText(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (granularity === 'year') return `${year}`;
    if (granularity === 'month') return `${year}/${month}`;
    return `${year}/${month}/${day}`;
};

type SupportedChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'kpi' | 'radar';

export function buildChartConfig(
    rows: Array<Record<string, unknown>>,
    chartType: SupportedChartType,
    xField: string,
    yField: string | string[],
    extraFields?: {
        time?: string;
        seriesBy?: string;
        customLabels?: { title?: string; x?: string; y?: string; legend?: string };
        timeGranularity?: 'day' | 'month' | 'year';
    },
) {
    const yFields = Array.isArray(yField) ? yField : [yField];
    const labels = extraFields?.customLabels || {};
    const isTemporalX = !!extraFields?.time && extraFields.time === xField;
    const xValues = rows.map((row) => (isTemporalX ? formatDate(row[xField], extraFields?.timeGranularity) : toText(row[xField])));
    const title = labels.title || `${chartType.toUpperCase()} - ${xField}`;

    if (chartType === 'pie') {
        if (yFields.length > 1) {
            return {
                title: { text: title },
                series: [
                    {
                        name: labels.legend || 'Valores',
                        type: 'pie',
                        data: yFields.map((field) => ({
                            name: field,
                            value: rows.reduce((acc, row) => acc + toNumber(row[field]), 0),
                        })),
                    },
                ],
            };
        }
        return {
            title: { text: title },
            series: [
                {
                    name: labels.legend || yFields[0],
                    type: 'pie',
                    data: rows.map((row) => ({
                        name: isTemporalX ? formatDate(row[xField], extraFields?.timeGranularity) : toText(row[xField]),
                        value: toNumber(row[yFields[0]]),
                    })),
                },
            ],
        };
    }

    if (chartType === 'radar') {
        return {
            title: { text: title },
            radar: {
                indicator: xValues.map((x) => ({ name: x })),
            },
            series: [
                {
                    name: 'Radar',
                    type: 'radar',
                    data: yFields.map((field) => ({
                        name: field,
                        value: rows.map((row) => toNumber(row[field])),
                    })),
                },
            ],
        };
    }

    if (chartType === 'scatter') {
        return {
            title: { text: title },
            xAxis: {
                type: 'value',
                name: labels.x || xField,
            },
            yAxis: {
                type: 'value',
                name: labels.y || 'Valores',
            },
            series: yFields.map((field) => ({
                name: field,
                type: 'scatter',
                data: rows.map((row) => [toNumber(row[xField]), toNumber(row[field])]),
            })),
        };
    }

    const sourceSeries = extraFields?.seriesBy
        ? (() => {
            const seriesValues = Array.from(new Set(rows.map((row) => toText(row[extraFields.seriesBy as string])))).filter(Boolean);
            return seriesValues.map((seriesName) => ({
                name: seriesName,
                type: chartType,
                smooth: chartType === 'line',
                data: xValues.map((x) => {
                    const row = rows.find((candidate) => {
                        const candidateX = isTemporalX ? formatDate(candidate[xField], extraFields?.timeGranularity) : toText(candidate[xField]);
                        return candidateX === x && toText(candidate[extraFields.seriesBy as string]) === seriesName;
                    });
                    const firstY = yFields[0];
                    return row ? toNumber(row[firstY]) : 0;
                }),
            }));
        })()
        : yFields.map((field) => ({
            name: yFields.length === 1 && labels.legend ? labels.legend : field,
            type: chartType,
            smooth: chartType === 'line',
            data: rows.map((row) => toNumber(row[field])),
        }));

    return {
        title: { text: title },
        xAxis: {
            type: 'category',
            data: xValues,
            name: labels.x || xField,
        },
        yAxis: {
            type: 'value',
            name: labels.y || 'Valores',
        },
        legend: {
            data: sourceSeries.map((serie) => serie.name),
        },
        series: sourceSeries,
    };
}
