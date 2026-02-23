import React, { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import { toApexFigure } from '../lib/apexAdapter';
import { useThemeMode } from '../lib/theme';

interface ApexChartProps {
    config: Record<string, unknown>;
    className?: string;
    style?: React.CSSProperties;
    onDataPointClick?: (value: string | number | null) => void;
}

export const ApexChart: React.FC<ApexChartProps> = ({ config, className, style, onDataPointClick }) => {
    const theme = useThemeMode();
    const figure = useMemo(() => toApexFigure(config), [config, theme]);
    const remountKey = useMemo(() => {
        const xCategories = Array.isArray((figure.options as any)?.xaxis?.categories)
            ? (figure.options as any).xaxis.categories.length
            : 0;
        const seriesShape = Array.isArray(figure.series)
            ? figure.series
                .map((serie: any) => `${String(serie?.name || '')}:${Array.isArray(serie?.data) ? serie.data.length : 0}`)
                .join('|')
            : '';
        return `${figure.type}|${xCategories}|${seriesShape}`;
    }, [figure]);

    const options = useMemo(() => {
        const baseOptions = figure.options || {};
        const baseTooltip = (baseOptions.tooltip || {}) as { shared?: boolean; intersect?: boolean };
        const sharedTooltip = baseTooltip.shared === true;
        return {
            ...baseOptions,
            tooltip: {
                ...baseTooltip,
                shared: sharedTooltip,
                intersect: sharedTooltip ? false : (baseTooltip.intersect ?? true),
            },
            chart: {
                ...(baseOptions.chart || {}),
                events: {
                    ...(baseOptions.chart?.events || {}),
                    dataPointSelection: (_event: unknown, _ctx: unknown, detail: { seriesIndex: number; dataPointIndex: number }) => {
                        if (!onDataPointClick) return;
                        onDataPointClick(figure.getLabelFromSelection(detail.seriesIndex, detail.dataPointIndex));
                    },
                },
            },
        };
    }, [figure, onDataPointClick, theme]);

    return (
        <div className={className || 'w-full h-full'} style={style}>
            <ReactApexChart
                key={remountKey}
                options={options}
                series={figure.series as never}
                type={figure.type}
                width="100%"
                height="100%"
            />
        </div>
    );
};
