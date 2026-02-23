import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface Widget {
    id: string;
    type: 'chart' | 'table' | 'text' | 'image' | 'shape';
    title: string;
    query?: string; // AI generated SQL or defined query
    chartConfig?: any; // Chart spec (legacy + current)
    dataSource?: {
        tableName: string;
        xAxis: string;
        yAxis: string | string[];
        chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'kpi' | 'radar';
        theme?: string;
        extraFields?: any;
    };
    style?: {
        zIndex?: number;
        locked?: boolean;
        bgColor?: string;
        bgOpacity?: number;
        customBg?: boolean;
        showTitle?: boolean;
        titleAlign?: 'left' | 'center' | 'right';
        textAlign?: 'left' | 'center' | 'right';
        textColor?: string;
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        lineHeight?: number;
        shapeType?: 'rect' | 'circle' | 'triangle' | 'line' | 'divider' | 'icon';
        borderColor?: string;
        borderWidth?: number;
        borderRadius?: number;
        shadow?: boolean;
        gradient?: {
            from: string;
            to: string;
            angle: number;
        };
        iconName?: string;
        iconSize?: number;
        openMojiHex?: string;
        openMojiSize?: number;
        openMojiOpacity?: number;
        openMojiMode?: boolean;
        lineWidth?: number;
        lineStyle?: 'solid' | 'dashed' | 'dotted';
        rotation?: number;
    };
}

interface DashboardState {
    layouts: Record<string, any[]>; // generic layout info (x, y, w, h por widget)
    widgets: Record<string, Widget>;
    isEditing: boolean;
}

const initialState: DashboardState = {
    layouts: {
        lg: [
            { i: 'welcome', x: 0, y: 0, w: 12, h: 4 }
        ]
    },
    widgets: {
        'welcome': {
            id: 'welcome',
            type: 'text',
            title: 'Bienvenido a DVisual',
            chartConfig: { text: 'Carga datos y crea tu tablero con ayuda de la IA.' }
        }
    },
    isEditing: false,
};

export const dashboardSlice = createSlice({
    name: 'dashboard',
    initialState,
    reducers: {
        setLayouts: (state, action: PayloadAction<Record<string, any[]>>) => {
            state.layouts = action.payload;
        },
        setWidgets: (state, action: PayloadAction<Record<string, Widget>>) => {
            state.widgets = action.payload;
        },
        addWidget: (state, action: PayloadAction<Widget>) => {
            const newId = action.payload.id;
            const currentMaxZ = Math.max(
                0,
                ...Object.values(state.widgets).map(w => w.style?.zIndex ?? 0)
            );
            const isCompactShape = action.payload.type === 'shape'
                && (action.payload.style?.shapeType === 'icon' || action.payload.style?.openMojiMode);
            const isCompactWidget = action.payload.type === 'text'
                || action.payload.type === 'image'
                || isCompactShape;
            state.widgets[newId] = {
                ...action.payload,
                style: {
                    ...(action.payload.style || {}),
                    zIndex: action.payload.style?.zIndex ?? currentMaxZ + 1,
                },
            };

            if (!state.layouts.lg) {
                state.layouts.lg = [];
            }
            const y = state.layouts.lg.length * 6;
            const compactLayout = action.payload.type === 'text'
                ? { w: 3, h: 1, minW: 1, minH: 1 }
                : action.payload.type === 'image'
                    ? { w: 5, h: 2, minW: 2, minH: 1 }
                    : isCompactShape
                        ? { w: 2, h: 1, minW: 1, minH: 1 }
                        : { w: 6, h: 5, minW: 3, minH: 4 };
            state.layouts.lg.push({
                i: newId,
                x: 0,
                y,
                w: compactLayout.w,
                h: compactLayout.h,
                minW: compactLayout.minW,
                minH: compactLayout.minH,
                ...(isCompactWidget ? { maxW: 24, maxH: 18 } : {}),
            });
        },
        updateWidget: (state, action: PayloadAction<{ id: string, changes: Partial<Widget> }>) => {
            if (state.widgets[action.payload.id]) {
                state.widgets[action.payload.id] = { ...state.widgets[action.payload.id], ...action.payload.changes };
            }
        },
        removeWidget: (state, action: PayloadAction<string>) => {
            const idToRemove = action.payload;
            delete state.widgets[idToRemove];

            // Clean up layouts
            Object.keys(state.layouts).forEach(breakpoint => {
                state.layouts[breakpoint] = state.layouts[breakpoint].filter((item) => item.i !== idToRemove);
            });
        },
        toggleEditMode: (state) => {
            state.isEditing = !state.isEditing;
        }
    },
});

export const { setLayouts, setWidgets, addWidget, updateWidget, removeWidget, toggleEditMode } = dashboardSlice.actions;
export default dashboardSlice.reducer;
