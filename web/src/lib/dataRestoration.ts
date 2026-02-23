import { getDuckDB, initDuckDB } from './duckdb';
import { fetchDatasets, fetchDatasetContent } from './api';
import { addTableSchema, clearTables } from '../store/datasetsSlice';
import { Dispatch } from 'redux';

export const ensureDuckDBAndRestore = async (dispatch: Dispatch, dashboardId?: string) => {
    try {
        await initDuckDB();
        
        const datasets = await fetchDatasets(dashboardId);
        const db = getDuckDB();
        const conn = await db.connect();

        const tablesRes = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
        const existing = tablesRes.toArray().map((r: any) => r.table_name);
        for (const name of existing) {
            await conn.query(`DROP TABLE IF EXISTS "${name}"`);
        }
        dispatch(clearTables());
        
        for (const ds of datasets) {
            const contentRes = await fetchDatasetContent(ds.id);
            if (contentRes.content) {
                // Register file
                await db.registerFileText(`${ds.name}.json`, contentRes.content);
                // Create table
                await conn.query(`CREATE TABLE "${ds.name}" AS SELECT * FROM read_json_auto('${ds.name}.json')`);
                // Update Redux
                dispatch(addTableSchema({ name: ds.name, columns: ds.schema }));
            }
        }
        await conn.close();
        return true;
    } catch (e) {
        console.error("Failed to restore datasets", e);
        return false;
    }
};
