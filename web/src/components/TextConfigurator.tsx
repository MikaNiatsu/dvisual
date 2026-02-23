import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AlignCenter, AlignLeft, AlignRight, Palette, Save, Type, X } from 'lucide-react';
import type { RootState } from '../store';
import { updateWidget } from '../store/dashboardSlice';
import { useThemeMode } from '../lib/theme';
import { OpenMojiPicker } from './OpenMojiPicker';

type TextAlign = 'left' | 'center' | 'right';

interface TextConfiguratorProps {
    widgetId: string;
    onClose: () => void;
}

const colorSwatches = ['#e2e8f0', '#cbd5e1', '#94a3b8', '#0ea5e9', '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];
const backgroundSwatches = ['#020617', '#0f172a', '#111827', '#1e293b', '#334155', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#dbeafe'];
const hexToRgba = (hex: string, alpha: number) => {
    const raw = hex.replace('#', '').trim();
    const normalized = raw.length === 3 ? raw.split('').map((x) => x + x).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
    const n = parseInt(normalized, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

export const TextConfigurator: React.FC<TextConfiguratorProps> = ({ widgetId, onClose }) => {
    const dispatch = useDispatch();
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const widget = useSelector((state: RootState) => state.dashboard.widgets[widgetId]);

    const [title, setTitle] = useState('Texto');
    const [content, setContent] = useState('');
    const [showTitle, setShowTitle] = useState(false);
    const [textColor, setTextColor] = useState(isDark ? '#e2e8f0' : '#334155');
    const [fontFamily, setFontFamily] = useState('system');
    const [textAlign, setTextAlign] = useState<TextAlign>('center');
    const [fontSize, setFontSize] = useState(16);
    const [fontWeight, setFontWeight] = useState(500);
    const [lineHeight, setLineHeight] = useState(1.4);
    const [bgColor, setBgColor] = useState(isDark ? '#0f172a' : '#ffffff');
    const [bgOpacity, setBgOpacity] = useState(0);
    const contentRef = React.useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!widget) return;
        setTitle(widget.title || 'Texto');
        setContent(widget.chartConfig?.text || '');
        setShowTitle(widget.style?.showTitle === true);
        setTextColor(widget.style?.textColor || (isDark ? '#e2e8f0' : '#334155'));
        setFontFamily(widget.style?.fontFamily || 'system');
        setTextAlign((widget.style?.textAlign || 'center') as TextAlign);
        setFontSize(Math.max(12, Math.min(64, Number(widget.style?.fontSize || 16))));
        setFontWeight(Math.max(300, Math.min(800, Number(widget.style?.fontWeight || 500))));
        setLineHeight(Math.max(1, Math.min(2.4, Number(widget.style?.lineHeight || 1.4))));
        setBgColor(widget.style?.bgColor || (isDark ? '#0f172a' : '#ffffff'));
        setBgOpacity(typeof widget.style?.bgOpacity === 'number' ? widget.style.bgOpacity : 0);
    }, [widget, isDark]);

    const inputClass = isDark
        ? 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500'
        : 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';
    const panelClass = isDark
        ? 'rounded-2xl border border-slate-700 bg-slate-950/85 p-4'
        : 'rounded-2xl border border-slate-200 bg-slate-50/90 p-4';
    const labelClass = isDark
        ? 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400'
        : 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';

    const previewTextStyle = useMemo<React.CSSProperties>(() => ({
        color: textColor,
        fontSize: `${fontSize}px`,
        fontWeight,
        lineHeight,
        textAlign,
        fontFamily: fontFamily === 'system' ? undefined : fontFamily,
    }), [textColor, fontSize, fontWeight, lineHeight, textAlign, fontFamily]);

    const handleSave = () => {
        dispatch(updateWidget({
            id: widgetId,
            changes: {
                title: title.trim() || 'Texto',
                chartConfig: {
                    ...(widget?.chartConfig || {}),
                    text: content || 'Doble clic para editar el texto',
                },
                style: {
                    ...(widget?.style || {}),
                    showTitle,
                    textColor,
                    fontFamily,
                    textAlign,
                    fontSize,
                    fontWeight,
                    lineHeight,
                    bgColor,
                    bgOpacity,
                    customBg: true,
                },
            },
        }));
        onClose();
    };

    const insertEmoji = (emoji: string) => {
        const el = contentRef.current;
        if (!el) {
            setContent((prev) => `${prev}${emoji}`);
            return;
        }
        const start = el.selectionStart ?? content.length;
        const end = el.selectionEnd ?? start;
        const next = `${content.slice(0, start)}${emoji}${content.slice(end)}`;
        setContent(next);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + emoji.length;
            el.setSelectionRange(pos, pos);
        });
    };

    return (
        <div className={`h-full w-full overflow-auto p-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className={`text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Texto del widget</h3>
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personaliza contenido, tipografia y fondo.</p>
                    </div>
                    <button onClick={onClose} className={`rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`} aria-label="Cerrar">
                        <X size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
                    <div className={`${panelClass} space-y-3`}>
                        <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Type size={14} /> Contenido
                        </div>
                        <div>
                            <label className={labelClass}>Titulo del widget</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className={inputClass}
                                placeholder="Ej: Mensaje comercial"
                            />
                        </div>
                        <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
                            Mostrar titulo
                        </label>
                        <div>
                            <label className={labelClass}>Texto</label>
                            <textarea
                                ref={contentRef}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className={`${inputClass} min-h-[180px] resize-y`}
                                placeholder="Escribe el contenido que quieres mostrar en el widget."
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <OpenMojiPicker onSelect={insertEmoji} isDark={isDark} buttonLabel="OpenMoji" />
                            <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                OpenMoji se inserta en el contenido
                            </span>
                        </div>
                    </div>

                    <div className={`${panelClass} space-y-3`}>
                        <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Palette size={14} /> Estilo
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>Color texto</label>
                                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-full rounded-lg border border-slate-400 bg-transparent p-1" />
                            </div>
                            <div>
                                <label className={labelClass}>Fuente</label>
                                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className={inputClass}>
                                    <option value="system">Sistema</option>
                                    <option value="Manrope">Manrope</option>
                                    <option value="Space Grotesk">Space Grotesk</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="monospace">Monospace</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Tamano ({fontSize}px)</label>
                                <input type="range" min={12} max={64} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
                            </div>
                            <div>
                                <label className={labelClass}>Peso ({fontWeight})</label>
                                <input type="range" min={300} max={800} step={100} value={fontWeight} onChange={(e) => setFontWeight(Number(e.target.value))} className="w-full" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className={labelClass}>Interlineado ({lineHeight.toFixed(1)})</label>
                                <input type="range" min={1} max={2.4} step={0.1} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} className="w-full" />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Alineacion</label>
                            <div className={`grid grid-cols-3 gap-2 rounded-xl border p-1 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'}`}>
                                <button
                                    onClick={() => setTextAlign('left')}
                                    className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${textAlign === 'left' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <AlignLeft size={14} /> Izq
                                </button>
                                <button
                                    onClick={() => setTextAlign('center')}
                                    className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${textAlign === 'center' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <AlignCenter size={14} /> Centro
                                </button>
                                <button
                                    onClick={() => setTextAlign('right')}
                                    className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${textAlign === 'right' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <AlignRight size={14} /> Der
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                            <div>
                                <label className={labelClass}>Fondo</label>
                                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-10 w-14 rounded-lg border border-slate-400 bg-transparent p-1" />
                            </div>
                            <div>
                                <label className={labelClass}>Opacidad</label>
                                <input type="range" min={0} max={100} value={Math.round(bgOpacity * 100)} onChange={(e) => setBgOpacity(Number(e.target.value) / 100)} className="w-full" />
                            </div>
                            <div className={`pt-5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{Math.round(bgOpacity * 100)}%</div>
                        </div>
                    </div>
                </div>

                <div className={`${panelClass} space-y-3`}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <div className={labelClass}>Paleta texto</div>
                            <div className="flex flex-wrap gap-2">
                                {colorSwatches.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setTextColor(color)}
                                        className="h-7 w-7 rounded-full border border-slate-400"
                                        style={{ background: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className={labelClass}>Paleta fondo</div>
                            <div className="flex flex-wrap gap-2">
                                {backgroundSwatches.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setBgColor(color)}
                                        className="h-7 w-7 rounded-full border border-slate-400"
                                        style={{ background: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`${panelClass}`}>
                    <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Preview</div>
                    <div
                        className={`min-h-[160px] rounded-xl border p-5 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
                        style={{ background: hexToRgba(bgColor, bgOpacity) }}
                    >
                        <p style={previewTextStyle}>{content || 'Vista previa del texto del widget'}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className={`rounded-lg px-4 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500">
                        <Save size={14} /> Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};
