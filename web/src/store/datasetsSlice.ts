import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface TableSchema {
    name: string;
    columns: { name: string, type: string }[];
}

interface DatasetState {
    tables: TableSchema[];
    isDuckDBReady: boolean;
}

const initialState: DatasetState = {
    tables: [],
    isDuckDBReady: false,
};

export const datasetsSlice = createSlice({
    name: 'datasets',
    initialState,
    reducers: {
        setDuckDBReady: (state, action: PayloadAction<boolean>) => {
            state.isDuckDBReady = action.payload;
        },
        addTableSchema: (state, action: PayloadAction<TableSchema>) => {
            if (!state.tables.find(t => t.name === action.payload.name)) {
                state.tables.push(action.payload);
            }
        },
        removeTableSchema: (state, action: PayloadAction<string>) => {
            state.tables = state.tables.filter(t => t.name !== action.payload);
        },
        clearTables: (state) => {
            state.tables = [];
        }
    },
});

export const { setDuckDBReady, addTableSchema, removeTableSchema, clearTables } = datasetsSlice.actions;
export default datasetsSlice.reducer;
