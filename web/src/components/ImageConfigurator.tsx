import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { updateWidget } from '../store/dashboardSlice';
import { Save, X, Image as ImageIcon, Type, Palette, Upload, Link2 } from 'lucide-react';
import { useThemeMode } from '../lib/theme';

interface ImageConfiguratorProps {
    widgetId: string;
    onClose: () => void;
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
});

const loadImageFromUrl = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada'));
    img.src = src;
});

const convertFileToWebpDataUrl = async (file: File, quality = 0.9) => {
    const sourceUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromUrl(sourceUrl);
    const maxSide = 2560;
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar el conversor de imagen');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/webp', Math.max(0.1, Math.min(1, quality)));
};

export const ImageConfigurator: React.FC<ImageConfiguratorProps> = ({ widgetId, onClose }) => {
    const dispatch = useDispatch();
    const theme = useThemeMode();
    const isDark = theme === 'dark';
    const widget = useSelector((state: RootState) => (state.dashboard as any).widgets[widgetId]);

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [bgColor, setBgColor] = useState('#ffffff');
    const [bgOpacity, setBgOpacity] = useState(1);
    const [showTitle, setShowTitle] = useState(true);
    const [quality, setQuality] = useState(90);
    const [isConverting, setIsConverting] = useState(false);
    const [uploadInfo, setUploadInfo] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!widget) return;
        setUrl(widget.chartConfig?.url || '');
        setTitle(widget.title || 'Imagen');
        setBgColor(widget.style?.bgColor || '#ffffff');
        setBgOpacity(widget.style?.bgOpacity ?? 1);
        setShowTitle(widget.style?.showTitle !== false);
    }, [widget]);

    const inputClass = isDark
        ? 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500'
        : 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';

    const handleSelectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsConverting(true);
        setUploadInfo(null);
        try {
            const webpDataUrl = await convertFileToWebpDataUrl(file, quality / 100);
            setUrl(webpDataUrl);
            setUploadInfo(`Archivo convertido a WEBP (${Math.round(quality)}%). Listo para aplicar.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al convertir imagen';
            setUploadInfo(message);
        } finally {
            setIsConverting(false);
            event.target.value = '';
        }
    };

    const handleSave = () => {
        dispatch(updateWidget({
            id: widgetId,
            changes: {
                title,
                chartConfig: { ...(widget?.chartConfig || {}), url },
                style: {
                    ...(widget?.style || {}),
                    bgColor,
                    bgOpacity,
                    showTitle,
                    customBg: true,
                },
            },
        }));
        onClose();
    };

    return (
        <div className={`h-full w-full overflow-auto p-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Configurar imagen</h3>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ajusta titulo, fondo y origen de la imagen.</p>
                    </div>
                    <button onClick={onClose} className={`rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <X size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className={`space-y-4 rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                        <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Type size={14} /> Titulo
                        </div>
                        <div>
                            <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Texto titulo</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Nombre del widget" />
                        </div>
                        <label className={`inline-flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />
                            Mostrar titulo
                        </label>
                    </div>

                    <div className={`space-y-4 rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                        <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            <Palette size={14} /> Fondo
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="h-10 w-12 rounded border border-slate-400 bg-transparent p-1" />
                            <input type="range" min={0} max={100} value={Math.round(bgOpacity * 100)} onChange={e => setBgOpacity(Number(e.target.value) / 100)} />
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{Math.round(bgOpacity * 100)}%</span>
                        </div>
                    </div>
                </div>

                <div className={`space-y-3 rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                    <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        <ImageIcon size={14} /> Fuente de imagen
                    </div>
                    <div className="space-y-2 rounded-lg border border-slate-700/30 p-3">
                        <div className={`mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Link2 size={12} /> URL externa
                        </div>
                        <input
                            type="text"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="https://ejemplo.com/imagen.png"
                            className={inputClass}
                        />
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-700/30 p-3">
                        <div className={`mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Upload size={12} /> Desde tu equipo (convertir a WEBP)
                        </div>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <input
                                type="range"
                                min={50}
                                max={100}
                                step={5}
                                value={quality}
                                onChange={(e) => setQuality(Number(e.target.value))}
                            />
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{quality}%</span>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleSelectFile}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isConverting}
                            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'} disabled:opacity-50`}
                        >
                            <Upload size={14} />
                            {isConverting ? 'Convirtiendo...' : 'Seleccionar imagen'}
                        </button>
                        {uploadInfo && (
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{uploadInfo}</p>
                        )}
                    </div>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Puedes usar URL o cargar un archivo local. El archivo local se guarda como WEBP en el widget.</p>
                </div>

                <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                    <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Preview</div>
                    <div className={`flex h-72 items-center justify-center overflow-hidden rounded-lg border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                        {url ? (
                            <img
                                src={url}
                                alt="Preview"
                                className="max-h-full max-w-full object-contain"
                                onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/240x140?text=Invalid+Image+URL')}
                            />
                        ) : (
                            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Sin imagen</span>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className={`rounded-lg px-4 py-2 text-sm ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-400 hover:to-blue-500">
                        <Save size={16} /> Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};
