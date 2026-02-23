import { Database } from "duckdb";

console.log("Testing DuckDB Write...");
try {
    const db = new Database('dvisual.duckdb');
    
    db.run("CREATE TABLE IF NOT EXISTS test_write (id INTEGER)", (err) => {
        if (err) {
            console.error("Create table failed:", err);
            return;
        }
        console.log("Table created/verified");
        
        db.run("INSERT INTO test_write VALUES (1)", (err) => {
            if (err) {
                console.error("Insert failed:", err);
            } else {
                console.log("Insert success");
                
                db.all("SELECT * FROM test_write", (err, rows) => {
                    if (err) console.error("Select failed:", err);
                    else console.log("Select success, rows:", rows);
                });
            }
        });
    });
} catch (e) {
    console.error("Exception:", e);
}
