import React from 'react';
import { Sparkles, Star, TrendingUp, Shield, Users, DollarSign, Target, Award, Smile } from 'lucide-react';
import { buildOpenMojiUrl, hexToEmoji } from './OpenMojiPicker';

const iconMap: Record<string, any> = {
    sparkles: Sparkles,
    star: Star,
    trending: TrendingUp,
    shield: Shield,
    users: Users,
    dollar: DollarSign,
    target: Target,
    award: Award,
};

export const DesignWidget = ({ style }: { style?: any }) => {
    const bgColor = style?.bgColor || '#ffffff';
    const bgOpacity = style?.bgOpacity ?? 1;
    const borderColor = style?.borderColor || '#e5e7eb';
    const borderWidth = style?.borderWidth ?? 1;
    const borderRadius = style?.borderRadius ?? 8;
    const shapeType = style?.shapeType || 'rect';
    const textColor = style?.textColor || '#374151';
    const rotation = style?.rotation ?? 0;
    const shadow = style?.shadow;
    const gradient = style?.gradient;
    const lineWidth = style?.lineWidth ?? 2;
    const lineStyle = style?.lineStyle || 'solid';
    const iconName = style?.iconName || 'sparkles';
    const isOpenMojiMode = !!style?.openMojiMode;
    const openMojiHex = String(style?.openMojiHex || '').trim();
    const openMojiSize = Math.min(220, Math.max(20, Math.floor(style?.openMojiSize || style?.iconSize || 56)));
    const openMojiOpacity = Math.max(0.1, Math.min(1, Number(style?.openMojiOpacity ?? 1)));

    const background = gradient
        ? `linear-gradient(${gradient.angle || 90}deg, ${gradient.from}, ${gradient.to})`
        : bgColor;

    const commonStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        background,
        opacity: bgOpacity,
        border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
        borderRadius,
        boxShadow: shadow ? '0 8px 20px rgba(15, 23, 42, 0.12)' : undefined,
        transform: `rotate(${rotation}deg)`,
    };

    if (shapeType === 'line' || shapeType === 'divider') {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div
                    style={{
                        width: shapeType === 'divider' ? '2px' : '100%',
                        height: shapeType === 'divider' ? '100%' : `${lineWidth}px`,
                        background: textColor,
                        opacity: bgOpacity,
                        borderRadius: 999,
                        borderStyle: lineStyle,
                    }}
                />
            </div>
        );
    }

    if (shapeType === 'triangle') {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div
                    style={{
                        ...commonStyle,
                        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    }}
                />
            </div>
        );
    }

    if (shapeType === 'icon') {
        const Icon = iconMap[iconName] || Sparkles;
        const iconContainerStyle: React.CSSProperties = {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            transform: `rotate(${rotation}deg)`,
        };

        if (isOpenMojiMode && !openMojiHex) {
            return (
                <div className="w-full h-full p-0.5" style={{ transform: `rotate(${rotation}deg)` }}>
                    <div
                        className="w-full h-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1"
                        style={{
                            borderColor: '#94a3b8',
                            background: 'rgba(148,163,184,0.08)',
                            color: textColor,
                        }}
                    >
                        <Smile size={24} />
                        <div style={{ fontSize: '12px', lineHeight: 1.2, textAlign: 'center' }}>OpenMoji</div>
                        <div style={{ fontSize: '10px', lineHeight: 1.2, opacity: 0.75, textAlign: 'center' }}>Configurar en Diseno</div>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'transparent' }}>
                <div style={iconContainerStyle}>
                    {openMojiHex ? (
                        <img
                            src={buildOpenMojiUrl(openMojiHex)}
                            alt="OpenMoji decorativo"
                            style={{ width: openMojiSize, height: openMojiSize, opacity: openMojiOpacity }}
                            onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = 'inline';
                            }}
                        />
                    ) : (
                        <Icon size={Math.min(96, Math.max(28, Math.floor((style?.iconSize || 48))))} color={textColor} />
                    )}
                    {openMojiHex ? (
                        <span style={{ display: 'none', fontSize: `${Math.max(24, Math.min(110, openMojiSize))}px`, lineHeight: 1 }}>
                            {hexToEmoji(openMojiHex) || '?'}
                        </span>
                    ) : null}
                </div>
            </div>
        );
    }

    const adjustedRadius = shapeType === 'circle' ? 999 : borderRadius;

    return (
        <div className="w-full h-full relative" style={{ ...commonStyle, borderRadius: adjustedRadius }}>
            {shapeType === 'rect' && openMojiHex ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <img
                        src={buildOpenMojiUrl(openMojiHex)}
                        alt="OpenMoji decorativo"
                        style={{ width: openMojiSize, height: openMojiSize, opacity: openMojiOpacity }}
                        onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'inline';
                        }}
                    />
                    <span style={{ display: 'none', fontSize: `${Math.max(24, Math.min(110, openMojiSize))}px`, lineHeight: 1 }}>
                        {hexToEmoji(openMojiHex) || '?'}
                    </span>
                </div>
            ) : null}
        </div>
    );
};
