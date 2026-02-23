import React, { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

interface OpenMojiPickerProps {
    onSelect: (emoji: string) => void;
    onSelectItem?: (item: OpenMojiSelection) => void;
    isDark?: boolean;
    buttonLabel?: string;
}

interface OpenMojiItem {
    hex: string;
    name: string;
    keywords: string[];
}

export interface OpenMojiSelection extends OpenMojiItem {
    emoji: string;
    url: string;
}

export const OPENMOJI_CDN_SOURCES = [
    'https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji/color/svg',
    'https://openmoji.org/data/color/svg',
] as const;

export const buildOpenMojiUrl = (hex: string, sourceIndex = 0) => {
    const source = OPENMOJI_CDN_SOURCES[sourceIndex] || OPENMOJI_CDN_SOURCES[0];
    return `${source}/${hex}.svg`;
};

export const hexToEmoji = (hex: string) => {
    const points = hex
        .split('-')
        .map((part) => parseInt(part, 16))
        .filter((value) => Number.isFinite(value));
    if (points.length === 0) return '';
    try {
        return String.fromCodePoint(...points);
    } catch {
        return '';
    }
};

const normalizeHex = (value: unknown) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    const parts = raw.split('-').map((part) => part.replace(/[^0-9A-F]/g, '')).filter(Boolean);
    if (parts.length === 0) return '';
    return parts.join('-');
};

const emojiToHex = (emoji: string) => {
    const points: string[] = [];
    for (const char of Array.from(emoji || '')) {
        const codePoint = char.codePointAt(0);
        if (typeof codePoint === 'number') points.push(codePoint.toString(16).toUpperCase());
    }
    return points.join('-');
};

export const OpenMojiPicker: React.FC<OpenMojiPickerProps> = ({ onSelect, onSelectItem, isDark = false, buttonLabel = 'OpenMoji' }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        const unified = String(emojiData.unifiedWithoutSkinTone || emojiData.unified || '').replace(/_/g, '-');
        const rawHex = normalizeHex(unified) || normalizeHex(emojiData.unified) || normalizeHex(emojiToHex(emojiData.emoji));
        if (!rawHex) return;
        const emoji = emojiData.emoji || hexToEmoji(rawHex);
        const names = Array.isArray(emojiData.names) ? emojiData.names.map((n) => String(n || '').trim()).filter(Boolean) : [];
        const name = names[0] || rawHex;
        const keywords = Array.from(new Set(names));
        const url = buildOpenMojiUrl(rawHex);
        onSelect(emoji);
        onSelectItem?.({
            hex: rawHex,
            name,
            keywords,
            emoji,
            url,
        });
        setOpen(false);
    };

    return (
        <div className="relative inline-flex" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
                <Smile size={14} /> {buttonLabel}
            </button>
            {open && (
                <div className={`absolute left-0 top-full z-50 mt-2 w-[366px] overflow-hidden rounded-xl border p-2 shadow-xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                    <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme={isDark ? Theme.DARK : Theme.LIGHT}
                        emojiStyle={EmojiStyle.NATIVE}
                        searchPlaceholder="Buscar emoji..."
                        previewConfig={{ showPreview: false }}
                        lazyLoadEmojis
                        autoFocusSearch={false}
                        width="100%"
                        height={368}
                    />
                </div>
            )}
        </div>
    );
};
