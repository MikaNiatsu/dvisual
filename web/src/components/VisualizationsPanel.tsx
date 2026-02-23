import React from 'react';
import { BarChart, LineChart, PieChart, Image, Type, Table, ScatterChart, Hash, Square, Circle, Triangle, Minus, Sparkles, Smile } from 'lucide-react';
import { useThemeMode } from '../lib/theme';
import { motion } from 'framer-motion';

interface VisualizationsPanelProps {
    onAddWidget: (type: 'chart' | 'text' | 'image' | 'table' | 'shape', chartType?: string) => void;
}

const SectionTitle = ({ title }: { title: string }) => (
    <div className="px-4 pt-4 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
    </div>
);

const ActionCard = ({
    icon,
    label,
    onClick,
    tone = 'default',
    isDark = false,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'accent';
    isDark?: boolean;
}) => (
    <motion.button
        onClick={onClick}
        className={`flex h-20 flex-col items-center justify-center rounded-xl border text-xs font-medium transition-all ${
            tone === 'accent'
                ? isDark
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                : isDark
                    ? 'border-slate-700 bg-slate-900 text-slate-300 hover:-translate-y-0.5 hover:border-slate-600 hover:text-slate-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900'
        }`}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
    >
        <span className={`mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{icon}</span>
        <span>{label}</span>
    </motion.button>
);

export const VisualizationsPanel: React.FC<VisualizationsPanelProps> = ({ onAddWidget }) => {
    const theme = useThemeMode();
    const isDark = theme === 'dark';

    const visuals = [
        { type: 'chart', chartType: 'bar', icon: <BarChart size={20} />, label: 'Barras' },
        { type: 'chart', chartType: 'line', icon: <LineChart size={20} />, label: 'Lineas' },
        { type: 'chart', chartType: 'pie', icon: <PieChart size={20} />, label: 'Torta' },
        { type: 'chart', chartType: 'scatter', icon: <ScatterChart size={20} />, label: 'Dispersion' },
        { type: 'chart', chartType: 'kpi', icon: <Hash size={20} />, label: 'KPI' },
        { type: 'text', icon: <Type size={20} />, label: 'Texto' },
        { type: 'image', icon: <Image size={20} />, label: 'Imagen' },
        { type: 'table', icon: <Table size={20} />, label: 'Tabla' },
    ];

    const designItems = [
        { type: 'shape', chartType: 'rect', icon: <Square size={18} />, label: 'Rectangulo' },
        { type: 'shape', chartType: 'circle', icon: <Circle size={18} />, label: 'Circulo' },
        { type: 'shape', chartType: 'triangle', icon: <Triangle size={18} />, label: 'Triangulo' },
        { type: 'shape', chartType: 'line', icon: <Minus size={18} />, label: 'Linea' },
        { type: 'shape', chartType: 'divider', icon: <Minus size={18} className="rotate-90" />, label: 'Divisor' },
        { type: 'shape', chartType: 'icon', icon: <Sparkles size={18} />, label: 'Icono' },
        { type: 'shape', chartType: 'openmoji', icon: <Smile size={18} />, label: 'OpenMoji' },
    ];

    return (
        <div id="dv-visualizations-panel" className={`flex h-full flex-col overflow-auto bg-transparent ${isDark ? 'dv-themed' : ''}`}>
            <SectionTitle title="Visualizaciones" />
            <div className="grid grid-cols-2 gap-2 px-4">
                {visuals.map((v, i) => (
                    <ActionCard
                        key={i}
                        icon={v.icon}
                        label={v.label}
                        onClick={() => onAddWidget(v.type as any, v.chartType)}
                        isDark={isDark}
                    />
                ))}
            </div>

            <SectionTitle title="Diseno" />
            <div className="grid grid-cols-2 gap-2 px-4">
                {designItems.map((v, i) => (
                    <ActionCard
                        key={i}
                        icon={v.icon}
                        label={v.label}
                        onClick={() => onAddWidget(v.type as any, v.chartType)}
                        isDark={isDark}
                    />
                ))}
            </div>

            <div className="pb-4" />
        </div>
    );
};
