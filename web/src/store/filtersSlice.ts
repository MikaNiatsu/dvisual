import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface GlobalFilter {
    tableName: string;
    column: string;
    values: (string | number)[];
}

interface FiltersState {
    activeFilters: Record<string, GlobalFilter>;
    version: number;
}

const initialState: FiltersState = {
    activeFilters: {},
    version: 0,
};

const getKey = (tableName: string, column: string) => `${tableName}::${column}`;

export const filtersSlice = createSlice({
    name: 'filters',
    initialState,
    reducers: {
        setFilter: (state, action: PayloadAction<GlobalFilter>) => {
            const key = getKey(action.payload.tableName, action.payload.column);
            state.activeFilters[key] = action.payload;
            state.version += 1;
        },
        clearFilter: (state, action: PayloadAction<{ tableName: string; column: string }>) => {
            const key = getKey(action.payload.tableName, action.payload.column);
            delete state.activeFilters[key];
            state.version += 1;
        },
        clearAllFilters: (state) => {
            state.activeFilters = {};
            state.version += 1;
        },
        setFilters: (state, action: PayloadAction<Record<string, GlobalFilter>>) => {
            state.activeFilters = action.payload;
            state.version += 1;
        },
    },
});

export const { setFilter, clearFilter, clearAllFilters, setFilters } = filtersSlice.actions;
export default filtersSlice.reducer;
