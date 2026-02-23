import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { updateWidget } from '../store/dashboardSlice';
import { Palette, Shapes, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useThemeMode } from '../lib/theme';
import { OpenMojiPicker, buildOpenMojiUrl, hexToEmoji } from './OpenMojiPicker';

const palette = ['#0f172a', '#1e293b', '#334155', '#0ea5e9', '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];
const iconOptions = ['sparkles', 'star', 'trending', 'shield', 'users', 'dollar', 'target', 'award'];

export const DesignConfigurator = ({ widgetId, onClose }: { widgetId: string; onClose?: () => void }) => {
    const dispatch = useDispatch();
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const widget = useSelector((state: RootState) => state.dashboard.widgets[widgetId]);
    const style = widget?.style || {};

    const [shapeType, setShapeType] = useState(style.shapeType || 'rect');
    const [bgColor, setBgColor] = useState(style.bgColor || '#ffffff');
    const [bgOpacity, setBgOpacity] = useState(style.bgOpacity ?? 1);
    const [borderColor, setBorderColor] = useState(style.borderColor || '#e5e7eb');
    const [borderWidth, setBorderWidth] = useState(style.borderWidth ?? 1);
    const [borderRadius, setBorderRadius] = useState(style.borderRadius ?? 8);
    const [shadow, setShadow] = useState(!!style.shadow);
    const [textColor, setTextColor] = useState(style.textColor || '#374151');
    const [gradientFrom, setGradientFrom] = useState(style.gradient?.from || '#ffffff');
    const [gradientTo, setGradientTo] = useState(style.gradient?.to || '#f1f5f9');
    const [gradientAngle, setGradientAngle] = useState(style.gradient?.angle ?? 90);
    const [useGradient, setUseGradient] = useState(!!style.gradient);
    const [lineWidth, setLineWidth] = useState(style.lineWidth ?? 2);
    const [lineStyle, setLineStyle] = useState(style.lineStyle || 'solid');
    const [rotation, setRotation] = useState(style.rotation ?? 0);
    const [iconName, setIconName] = useState(style.iconName || 'sparkles');
    const [iconSize, setIconSize] = useState(style.iconSize || 48);
    const [openMojiHex, setOpenMojiHex] = useState(style.openMojiHex || '');
    const [openMojiSize, setOpenMojiSize] = useState(style.openMojiSize || 56);
    const [openMojiOpacity, setOpenMojiOpacity] = useState(style.openMojiOpacity ?? 1);

    const panelClass = isDark ? 'rounded-xl border border-slate-700 bg-slate-950 p-3' : 'rounded-xl border border-slate-200 bg-slate-50 p-3';
    const labelClass = isDark ? 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400' : 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
    const inputClass = isDark ? 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500' : 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';

    const shapeOptions = useMemo(() => ([
        { value: 'rect', label: 'Rectangulo' },
        { value: 'circle', label: 'Circulo' },
        { value: 'triangle', label: 'Triangulo' },
        { value: 'line', label: 'Linea' },
        { value: 'divider', label: 'Divisor' },
        { value: 'icon', label: 'Icono' },
    ]), []);

    const applyChanges = () => {
        dispatch(updateWidget({
            id: widgetId,
            changes: {
                style: {
                    ...(widget?.style || {}),
                    shapeType,
                    bgColor,
                    bgOpacity,
                    borderColor,
                    borderWidth,
                    borderRadius,
                    shadow,
                    textColor,
                    lineWidth,
                    lineStyle,
                    rotation,
                    iconName,
                    iconSize,
                    openMojiHex,
                    openMojiSize,
                    openMojiOpacity,
                    gradient: useGradient ? { from: gradientFrom, to: gradientTo, angle: gradientAngle } : undefined,
                },
            },
        }));
        onClose?.();
    };

    return (
        <div className={`h-full w-full overflow-auto p-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Diseno y formas</h2>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Configura estilo, color y acabados del elemento.</p>
                    </div>
                    <button onClick={onClose} className={`rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <X size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className={`${panelClass} space-y-3`}>
                        <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Shapes size={14} /> Forma
                        </div>
                        <div>
                            <label className={labelClass}>Tipo</label>
                            <select value={shapeType} onChange={(e) => setShapeType(e.target.value as any)} className={inputClass}>
                                {shapeOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Rotacion</label>
                            <input type="range" min={-180} max={180} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full" />
                            <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{rotation}deg</div>
                        </div>
                    </div>

                    <div className={`${panelClass} space-y-3`}>
                        <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Palette size={14} /> Apariencia
                        </div>
                        {(shapeType !== 'line' && shapeType !== 'divider') && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Color fondo</label>
                                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                                </div>
                                <div>
                                    <label className={labelClass}>Opacidad</label>
                                    <input type="range" min={0.1} max={1} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))} className="w-full" />
                                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{Math.round(bgOpacity * 100)}%</div>
                                </div>
                            </div>
                        )}

                        {(shapeType === 'line' || shapeType === 'divider') && (
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className={labelClass}>Color</label>
                                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                                </div>
                                <div>
                                    <label className={labelClass}>Grosor</label>
                                    <input type="number" min={1} max={20} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Estilo</label>
                                    <select value={lineStyle} onChange={(e) => setLineStyle(e.target.value as any)} className={inputClass}>
                                        <option value="solid">Solido</option>
                                        <option value="dashed">Guiones</option>
                                        <option value="dotted">Punteado</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {shapeType === 'icon' && (
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className={labelClass}>Icono</label>
                                    <select value={iconName} onChange={(e) => setIconName(e.target.value)} className={inputClass}>
                                        {iconOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Color</label>
                                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                                </div>
                                <div>
                                    <label className={labelClass}>Tamano</label>
                                    <input type="number" min={16} max={160} value={iconSize} onChange={(e) => setIconSize(Number(e.target.value))} className={inputClass} />
                                </div>
                            </div>
                        )}

                        {(shapeType === 'icon' || shapeType === 'rect') && (
                            <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>OpenMoji decorativo</div>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <OpenMojiPicker
                                        onSelect={() => {}}
                                        onSelectItem={(item) => setOpenMojiHex(item.hex)}
                                        isDark={isDark}
                                        buttonLabel="Elegir OpenMoji"
                                    />
                                    {openMojiHex ? (
                                        <button
                                            type="button"
                                            onClick={() => setOpenMojiHex('')}
                                            className={`rounded px-2 py-1 text-[11px] ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                        >
                                            Quitar
                                        </button>
                                    ) : null}
                                </div>
                                {openMojiHex ? (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-1 flex items-center justify-center">
                                            <img
                                                src={buildOpenMojiUrl(openMojiHex)}
                                                alt="OpenMoji"
                                                className="h-10 w-10 object-contain"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                                    if (fallback) fallback.style.display = 'inline';
                                                }}
                                            />
                                            <span className="text-xl leading-none" style={{ display: 'none' }}>{hexToEmoji(openMojiHex) || '?'}</span>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Tamano</label>
                                            <input type="number" min={20} max={220} value={openMojiSize} onChange={(e) => setOpenMojiSize(Number(e.target.value))} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Opacidad</label>
                                            <input type="range" min={0.1} max={1} step={0.05} value={openMojiOpacity} onChange={(e) => setOpenMojiOpacity(Number(e.target.value))} className="w-full" />
                                            <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{Math.round(openMojiOpacity * 100)}%</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        Selecciona un OpenMoji para usarlo como decoracion en icono o rectangulo.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {shapeType !== 'line' && shapeType !== 'divider' && shapeType !== 'icon' && (
                    <div className={`${panelClass} grid grid-cols-1 gap-3 xl:grid-cols-4`}>
                        <div>
                            <label className={labelClass}>Borde</label>
                            <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                        </div>
                        <div>
                            <label className={labelClass}>Grosor borde</label>
                            <input type="number" min={0} max={12} value={borderWidth} onChange={(e) => setBorderWidth(Number(e.target.value))} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Radio</label>
                            <input type="number" min={0} max={100} value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))} className={inputClass} />
                        </div>
                        <div className="flex items-end pb-2">
                            <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
                                Sombra
                            </label>
                        </div>
                    </div>
                )}

                <div className={`${panelClass} space-y-3`}>
                    <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        <SlidersHorizontal size={14} /> Degradado y paleta
                    </div>
                    <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input type="checkbox" checked={useGradient} onChange={(e) => setUseGradient(e.target.checked)} />
                        Usar degradado
                    </label>
                    {useGradient && (
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelClass}>Desde</label>
                                <input type="color" value={gradientFrom} onChange={(e) => setGradientFrom(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                            </div>
                            <div>
                                <label className={labelClass}>Hasta</label>
                                <input type="color" value={gradientTo} onChange={(e) => setGradientTo(e.target.value)} className="h-10 w-full rounded border border-slate-400 bg-transparent p-1" />
                            </div>
                            <div>
                                <label className={labelClass}>Angulo</label>
                                <input type="number" min={0} max={360} value={gradientAngle} onChange={(e) => setGradientAngle(Number(e.target.value))} className={inputClass} />
                            </div>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {palette.map((color) => (
                            <button key={color} onClick={() => setBgColor(color)} className="h-7 w-7 rounded-full border border-slate-400" style={{ background: color }} />
                        ))}
                    </div>
                </div>

                <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                    <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        <Sparkles size={14} /> Preview rapido
                    </div>
                    <div className="relative h-16 rounded-lg border"
                        style={{
                            background: useGradient ? `linear-gradient(${gradientAngle}deg, ${gradientFrom}, ${gradientTo})` : bgColor,
                            borderColor,
                            borderWidth,
                            borderStyle: 'solid',
                            borderRadius,
                            opacity: bgOpacity,
                        }}
                    >
                        {(shapeType === 'icon' || shapeType === 'rect') && openMojiHex && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <img
                                    src={buildOpenMojiUrl(openMojiHex)}
                                    alt="OpenMoji preview"
                                    style={{ width: Math.min(54, openMojiSize), height: Math.min(54, openMojiSize), opacity: openMojiOpacity }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className={`rounded-lg px-4 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Cancelar</button>
                    <button onClick={applyChanges} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500">Aplicar</button>
                </div>
            </div>
        </div>
    );
};
