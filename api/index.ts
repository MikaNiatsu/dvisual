import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import Database from "better-sqlite3";
import { Groq } from "groq-sdk";
import { existsSync, unlinkSync } from "node:fs";

// Initialize SQLite for user sessions and state
// Using better-sqlite3 for Node runtime compatibility
const db = new Database("dvisual.sqlite");
const MASTER_USER_ID = "user_admin";
const MASTER_USERNAME = "admin";
const MASTER_PASSWORD = "admin123";

// --- SCHEMA MIGRATION ---
// SQLite exec can run multiple statements
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR UNIQUE,
    password_hash VARCHAR,
    is_master BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dashboards (
    id VARCHAR PRIMARY KEY,
    name VARCHAR,
    layout VARCHAR,
    owner_id VARCHAR,
    updated_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dashboard_permissions (
    dashboard_id VARCHAR,
    user_id VARCHAR,
    access_level VARCHAR, -- 'view', 'edit', 'admin'
    PRIMARY KEY (dashboard_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS ip_rules (
    id INTEGER PRIMARY KEY,
    ip_pattern VARCHAR,
    dashboard_id VARCHAR,
    access_level VARCHAR
  );

  CREATE TABLE IF NOT EXISTS dashboard_roles (
    id VARCHAR PRIMARY KEY,
    dashboard_id VARCHAR,
    name VARCHAR,
    permissions VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dashboard_role_members (
    role_id VARCHAR,
    user_id VARCHAR,
    PRIMARY KEY (role_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id VARCHAR PRIMARY KEY,
    name VARCHAR,
    content VARCHAR,
    schema VARCHAR,
    updated_at TIMESTAMP,
    dashboard_id VARCHAR
  );
`);

// Create Master Account if not exists
const ensureMasterAccount = () => {
    try {
        // Check if master exists
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(MASTER_USERNAME) as any;
        
        if (user) {
            // Update existing
            db.prepare("UPDATE users SET id = ?, password_hash = ?, is_master = 1 WHERE username = ?").run(MASTER_USER_ID, MASTER_PASSWORD, MASTER_USERNAME);
            console.log("Master account 'admin' updated/verified.");
        } else {
            // Create new
            db.prepare("INSERT INTO users (id, username, password_hash, is_master) VALUES (?, ?, ?, 1)").run(MASTER_USER_ID, MASTER_USERNAME, MASTER_PASSWORD);
            console.log("Master account 'admin' created.");
        }
    } catch (e) {
        console.error("Error initializing DB:", e);
    }
};

// Initialize immediately since it's synchronous
ensureMasterAccount();

const ensureDatasetDashboardColumn = () => {
    try {
        const cols = db.prepare("PRAGMA table_info(datasets)").all() as any[];
        const hasDashboardId = cols.some((c: any) => c.name === 'dashboard_id');
        if (!hasDashboardId) {
            db.prepare("ALTER TABLE datasets ADD COLUMN dashboard_id VARCHAR").run();
        }
    } catch (e) {
        console.error("Error ensuring dashboard_id column on datasets:", e);
    }
};

ensureDatasetDashboardColumn();

const clearFileIfExists = (path: string) => {
    try {
        if (existsSync(path)) unlinkSync(path);
    } catch (e) {
        console.error(`Error deleting ${path}:`, e);
    }
};

const resetDatabaseKeepOnlyMaster = () => {
    db.exec("BEGIN");
    try {
        db.prepare("DELETE FROM dashboard_role_members").run();
        db.prepare("DELETE FROM dashboard_roles").run();
        db.prepare("DELETE FROM dashboard_permissions").run();
        db.prepare("DELETE FROM ip_rules").run();
        db.prepare("DELETE FROM dashboards").run();
        db.prepare("DELETE FROM datasets").run();
        db.prepare("DELETE FROM users").run();
        db.prepare("INSERT INTO users (id, username, password_hash, is_master) VALUES (?, ?, ?, 1)").run(
            MASTER_USER_ID,
            MASTER_USERNAME,
            MASTER_PASSWORD
        );
        db.exec("COMMIT");
    } catch (e) {
        db.exec("ROLLBACK");
        throw e;
    }

    // Optional legacy files from previous backend versions.
    clearFileIfExists("dvisual.duckdb");
    clearFileIfExists("dvisual.duckdb.wal");
};

const parsePermissions = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
    }
    return String(raw)
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
};

const getAccessLevelFromPermissions = (perms: string[] | null) => {
    if (!perms || perms.length === 0) return null;
    if (perms.includes('manage')) return 'admin';
    if (perms.includes('edit')) return 'edit';
    if (perms.includes('view')) return 'view';
    return null;
};

const getRolePermissionsForUser = (dashboardId: string, userId: string) => {
    const rows = db.prepare(`
        SELECT r.permissions
        FROM dashboard_roles r
        JOIN dashboard_role_members rm ON rm.role_id = r.id
        WHERE r.dashboard_id = ? AND rm.user_id = ?
    `).all(dashboardId, userId) as any[];
    const perms = new Set<string>();
    for (const row of rows) {
        const list = parsePermissions(row.permissions);
        list.forEach(p => perms.add(p));
    }
    return perms;
};

const canManageDashboard = (dashboardId: string, userId: string, isMaster: boolean) => {
    if (isMaster) return true;
    const dash: any = db.prepare("SELECT owner_id FROM dashboards WHERE id = ?").get(dashboardId);
    if (!dash) return false;
    if (dash.owner_id === userId) return true;
    const perm: any = db.prepare("SELECT access_level FROM dashboard_permissions WHERE dashboard_id = ? AND user_id = ?").get(dashboardId, userId);
    if (perm && perm.access_level === 'admin') return true;
    const rolePerms = getRolePermissionsForUser(dashboardId, userId);
    return rolePerms.has('manage');
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy_key" });

const app = new Elysia()
    .use(cors())
    .use(
        jwt({
            name: 'jwt',
            secret: 'super-secret-dvisual-key'
        })
    )
    // --- AUTHENTICATION ---
    .post("/api/login", async ({ body, jwt, set }) => {
        const { username, password } = body;
        console.log(`[LOGIN ATTEMPT] Username: '${username}'`);

        try {
            // SQLite is synchronous
            const user = db.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").get(username, password) as any;
            
            if (user) {
                console.log(`[LOGIN SUCCESS] User authenticated: ${user.username}`);
                const token = await jwt.sign({ 
                    id: user.id, 
                    username: user.username,
                    is_master: Boolean(user.is_master) // Ensure boolean
                });
                return { 
                    token, 
                    user: { 
                        id: user.id, 
                        username: user.username, 
                        is_master: Boolean(user.is_master)
                    } 
                };
            }
            
            // Debug: check if user exists at all
            const debugUser = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
            if (debugUser) {
                console.log(`[LOGIN FAILED] User found but password mismatch for: ${username}`);
            } else {
                console.log(`[LOGIN FAILED] User not found: ${username}`);
            }
            
            set.status = 401;
            return { error: 'Invalid credentials' };
        } catch (e) {
            console.error("[LOGIN ERROR]", e);
            set.status = 500;
            return { error: 'Internal Server Error' };
        }
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String()
        })
    })

    // --- USERS MANAGEMENT (Master Only) ---
    .get("/api/users", async ({ headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }
        return db.prepare("SELECT id, username, is_master, created_at FROM users").all();
    })
    .post("/api/users", async ({ body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }
        
        const { username, password, is_master } = body;
        const id = crypto.randomUUID();
        try {
            db.prepare("INSERT INTO users (id, username, password_hash, is_master) VALUES (?, ?, ?, ?)").run(id, username, password, is_master ? 1 : 0);
            return { success: true, id };
        } catch(e: any) {
            return { error: e.message };
        }
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String(),
            is_master: t.Boolean()
        })
    })

    // --- ADMIN MANAGEMENT (Master Only) ---
    .get("/api/admin/roles", async ({ headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }

        const roles = db.prepare(`
            SELECT r.id, r.dashboard_id, d.name as dashboard_name, r.name, r.permissions, r.created_at
            FROM dashboard_roles r
            LEFT JOIN dashboards d ON d.id = r.dashboard_id
            ORDER BY r.created_at DESC
        `).all() as any[];

        return roles.map((role) => {
            const members = db.prepare(`
                SELECT u.id, u.username
                FROM dashboard_role_members rm
                JOIN users u ON u.id = rm.user_id
                WHERE rm.role_id = ?
            `).all(role.id) as any[];

            return {
                id: role.id,
                dashboard_id: role.dashboard_id,
                dashboard_name: role.dashboard_name || '(Sin tablero)',
                name: role.name,
                permissions: parsePermissions(role.permissions),
                members,
                created_at: role.created_at,
            };
        });
    })
    .post("/api/admin/roles", async ({ body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }

        const { dashboard_id, name, permissions } = body as any;
        const dashboard = db.prepare("SELECT id FROM dashboards WHERE id = ?").get(dashboard_id);
        if (!dashboard) { set.status = 404; return { error: "Dashboard not found" }; }

        const id = `role_${crypto.randomUUID()}`;
        db.prepare("INSERT INTO dashboard_roles (id, dashboard_id, name, permissions) VALUES (?, ?, ?, ?)").run(
            id,
            dashboard_id,
            name,
            JSON.stringify(Array.isArray(permissions) ? permissions : [])
        );
        return { success: true, id };
    }, {
        body: t.Object({
            dashboard_id: t.String(),
            name: t.String(),
            permissions: t.Array(t.String())
        })
    })
    .get("/api/admin/ip-rules", async ({ headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }

        return db.prepare(`
            SELECT ip.id, ip.ip_pattern, ip.dashboard_id, ip.access_level, d.name as dashboard_name
            FROM ip_rules ip
            LEFT JOIN dashboards d ON d.id = ip.dashboard_id
            ORDER BY ip.id DESC
        `).all();
    })
    .post("/api/admin/ip-rules", async ({ body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }

        const { dashboard_id, ip_pattern, access_level } = body as any;
        const dashboard = db.prepare("SELECT id FROM dashboards WHERE id = ?").get(dashboard_id);
        if (!dashboard) { set.status = 404; return { error: "Dashboard not found" }; }

        db.prepare("INSERT INTO ip_rules (ip_pattern, dashboard_id, access_level) VALUES (?, ?, ?)").run(
            ip_pattern,
            dashboard_id,
            access_level
        );
        return { success: true };
    }, {
        body: t.Object({
            dashboard_id: t.String(),
            ip_pattern: t.String(),
            access_level: t.String()
        })
    })
    .post("/api/admin/reset-database", async ({ body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }

        if ((body as any).confirm !== "LIMPIAR_DB") {
            set.status = 400;
            return { error: "Confirmacion invalida. Usa LIMPIAR_DB." };
        }

        try {
            resetDatabaseKeepOnlyMaster();
            return {
                success: true,
                message: "Base de datos reiniciada. Solo permanece el usuario master admin.",
                master: {
                    username: MASTER_USERNAME,
                    password: MASTER_PASSWORD,
                }
            };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message || "No se pudo reiniciar la base de datos." };
        }
    }, {
        body: t.Object({
            confirm: t.String()
        })
    })
    .delete("/api/admin/ip-rules/:ruleId", async ({ params, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth || !auth.is_master) { set.status = 403; return { error: "Forbidden" }; }
        db.prepare("DELETE FROM ip_rules WHERE id = ?").run(params.ruleId);
        return { success: true };
    })

    // --- DASHBOARDS ---
    .get("/api/dashboards", async ({ headers, jwt, request }) => {
        // Filter by permissions or IP
        const token = headers['authorization']?.split(' ')[1];
        let userId = null;
        let isMaster = false;
        
        // Get Client IP
        const clientIp = headers['x-forwarded-for'] || '127.0.0.1';
        
        if (token) {
            const payload = await jwt.verify(token);
            if (payload) {
                userId = payload.id;
                isMaster = payload.is_master;
            }
        }

        if (isMaster) {
             return db.prepare("SELECT *, 'admin' as access_level FROM dashboards ORDER BY updated_at DESC").all();
        }

        if (userId) {
            // Own dashboards + Shared dashboards (User or IP)
            const baseRows = db.prepare(`
                SELECT DISTINCT d.*, 
                       COALESCE(
                           CASE WHEN d.owner_id = ? THEN 'owner' END,
                           p.access_level,
                           ip.access_level,
                           'view'
                       ) as access_level
                FROM dashboards d
                LEFT JOIN dashboard_permissions p ON d.id = p.dashboard_id AND p.user_id = ?
                LEFT JOIN ip_rules ip ON d.id = ip.dashboard_id AND ? LIKE REPLACE(ip.ip_pattern, '*', '%')
                WHERE 
                   d.owner_id = ? 
                   OR p.user_id = ? 
                   OR ip.id IS NOT NULL
                ORDER BY d.updated_at DESC
            `).all(userId, userId, clientIp, userId, userId) as any[];

            const roleRows = db.prepare(`
                SELECT r.dashboard_id, r.permissions
                FROM dashboard_roles r
                JOIN dashboard_role_members rm ON rm.role_id = r.id
                WHERE rm.user_id = ?
            `).all(userId) as any[];

            const rolePermsByDash = new Map<string, Set<string>>();
            for (const row of roleRows) {
                const perms = parsePermissions(row.permissions);
                const existing = rolePermsByDash.get(row.dashboard_id) || new Set<string>();
                perms.forEach(p => existing.add(p));
                rolePermsByDash.set(row.dashboard_id, existing);
            }

            const baseMap = new Map<string, any>();
            baseRows.forEach(row => baseMap.set(row.id, row));

            const roleDashIds = Array.from(rolePermsByDash.keys()).filter(id => !baseMap.has(id));
            let roleDashboards: any[] = [];
            if (roleDashIds.length > 0) {
                const placeholders = roleDashIds.map(() => '?').join(', ');
                roleDashboards = db.prepare(`SELECT * FROM dashboards WHERE id IN (${placeholders})`).all(...roleDashIds) as any[];
            }

            const all = [...baseRows, ...roleDashboards];

            const rank: Record<string, number> = { view: 1, edit: 2, admin: 3, owner: 4 };
            for (const d of all) {
                let access = d.access_level || 'view';
                if (d.owner_id === userId) access = 'owner';
                const rolePerms = rolePermsByDash.get(d.id);
                const roleAccess = getAccessLevelFromPermissions(rolePerms ? Array.from(rolePerms) : null);
                if (roleAccess && rank[roleAccess] > (rank[access] || 0)) {
                    access = roleAccess;
                }
                d.access_level = access;
            }

            all.sort((a, b) => {
                const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return bTime - aTime;
            });

            return all;
        }

        return [];
    })
    .post("/api/dashboards", async ({ body, headers, jwt, set }) => {
        const token = headers['authorization']?.split(' ')[1];
        const payload = await jwt.verify(token);
        if (!payload) { set.status = 401; return { error: "Unauthorized" }; }

        const { id, name, layout } = body;
        // Check if exists and if user has edit rights
        const existing: any = db.prepare("SELECT owner_id FROM dashboards WHERE id = ?").get(id);
        
        if (existing) {
            // Check permission
            if (!payload.is_master && existing.owner_id !== payload.id) {
                 const perm: any = db.prepare("SELECT access_level FROM dashboard_permissions WHERE dashboard_id = ? AND user_id = ?").get(id, payload.id);
                 const rolePerms = getRolePermissionsForUser(id, payload.id);
                 const canEditByRole = rolePerms.has('edit') || rolePerms.has('manage');
                 if ((!perm || perm.access_level === 'view') && !canEditByRole) {
                     set.status = 403; return { error: "Read only access" };
                 }
            }
        }

        try {
            // If new, set owner
            const ownerId = existing ? existing.owner_id : payload.id;
            db.prepare("INSERT OR REPLACE INTO dashboards (id, name, layout, owner_id, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)").run(id, name, JSON.stringify(layout), ownerId);
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    }, {
        body: t.Object({
            id: t.String(),
            name: t.String(),
            layout: t.Any()
        })
    })

    // --- PERMISSIONS ---
    .get("/api/dashboards/:id/permissions", async ({ params, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        
        // Only owner or master can see permissions
        const dash: any = db.prepare("SELECT owner_id FROM dashboards WHERE id = ?").get(params.id);
        if (!dash) { set.status = 404; return { error: "Dashboard not found" }; }
        
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }

        const perms = db.prepare(`
            SELECT p.*, u.username 
            FROM dashboard_permissions p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.dashboard_id = ?
        `).all(params.id);
        
        return perms;
    })
    .post("/api/dashboards/:id/permissions", async ({ params, body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        
        const dash: any = db.prepare("SELECT owner_id FROM dashboards WHERE id = ?").get(params.id);
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }

        const { target, type, access_level } = body;

        try {
            if (type === 'user') {
                const user: any = db.prepare("SELECT id FROM users WHERE username = ?").get(target);
                if (!user) { set.status = 404; return { error: "User not found" }; }
                db.prepare("INSERT OR REPLACE INTO dashboard_permissions (dashboard_id, user_id, access_level) VALUES (?, ?, ?)").run(params.id, user.id, access_level);
            } else if (type === 'ip') {
                db.prepare("INSERT INTO ip_rules (ip_pattern, dashboard_id, access_level) VALUES (?, ?, ?)").run(target, params.id, access_level);
            }
            return { success: true };
        } catch(e: any) { return { error: e.message }; }
    }, {
        body: t.Object({
            target: t.String(),
            type: t.Union([t.Literal('user'), t.Literal('ip')]),
            access_level: t.String()
        })
    })

    // --- DASHBOARD ROLES ---
    .get("/api/dashboards/:id/roles", async ({ params, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }

        const roles = db.prepare("SELECT * FROM dashboard_roles WHERE dashboard_id = ? ORDER BY created_at DESC").all(params.id) as any[];
        const result = roles.map(role => {
            const members = db.prepare(`
                SELECT u.id, u.username
                FROM dashboard_role_members rm
                JOIN users u ON rm.user_id = u.id
                WHERE rm.role_id = ?
            `).all(role.id) as any[];
            return {
                id: role.id,
                name: role.name,
                permissions: parsePermissions(role.permissions),
                members
            };
        });

        return result;
    })
    .post("/api/dashboards/:id/roles", async ({ params, body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }

        const { name, permissions } = body as any;
        const id = `role_${crypto.randomUUID()}`;
        db.prepare("INSERT INTO dashboard_roles (id, dashboard_id, name, permissions) VALUES (?, ?, ?, ?)").run(
            id,
            params.id,
            name,
            JSON.stringify(permissions || [])
        );
        return { success: true, id };
    }, {
        body: t.Object({
            name: t.String(),
            permissions: t.Any()
        })
    })
    .put("/api/dashboards/:id/roles/:roleId", async ({ params, body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }

        const { name, permissions } = body as any;
        const role: any = db.prepare("SELECT * FROM dashboard_roles WHERE id = ? AND dashboard_id = ?").get(params.roleId, params.id);
        if (!role) { set.status = 404; return { error: "Role not found" }; }
        db.prepare("UPDATE dashboard_roles SET name = ?, permissions = ? WHERE id = ?").run(
            name,
            JSON.stringify(permissions || []),
            params.roleId
        );
        return { success: true };
    }, {
        body: t.Object({
            name: t.String(),
            permissions: t.Any()
        })
    })
    .delete("/api/dashboards/:id/roles/:roleId", async ({ params, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }
        db.prepare("DELETE FROM dashboard_role_members WHERE role_id = ?").run(params.roleId);
        db.prepare("DELETE FROM dashboard_roles WHERE id = ? AND dashboard_id = ?").run(params.roleId, params.id);
        return { success: true };
    })
    .post("/api/dashboards/:id/roles/:roleId/members", async ({ params, body, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }
        const { username } = body as any;
        const user: any = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
        if (!user) { set.status = 404; return { error: "User not found" }; }
        const role: any = db.prepare("SELECT id FROM dashboard_roles WHERE id = ? AND dashboard_id = ?").get(params.roleId, params.id);
        if (!role) { set.status = 404; return { error: "Role not found" }; }
        db.prepare("INSERT OR IGNORE INTO dashboard_role_members (role_id, user_id) VALUES (?, ?)").run(params.roleId, user.id);
        return { success: true };
    }, {
        body: t.Object({
            username: t.String()
        })
    })
    .delete("/api/dashboards/:id/roles/:roleId/members/:userId", async ({ params, headers, jwt, set }) => {
        const auth = await jwt.verify(headers['authorization']?.split(' ')[1]);
        if (!auth) { set.status = 401; return { error: "Unauthorized" }; }
        if (!canManageDashboard(params.id, auth.id, auth.is_master)) {
            set.status = 403; return { error: "Forbidden" };
        }
        db.prepare("DELETE FROM dashboard_role_members WHERE role_id = ? AND user_id = ?").run(params.roleId, params.userId);
        return { success: true };
    })

    // Datasets API
    .get("/api/datasets", async ({ query }) => {
        try {
            const dashboardId = (query as any)?.dashboardId as string | undefined;
            const sql = dashboardId
                ? "SELECT id, name, schema, updated_at FROM datasets WHERE dashboard_id = ? ORDER BY updated_at DESC"
                : "SELECT id, name, schema, updated_at FROM datasets ORDER BY updated_at DESC";
            const params = dashboardId ? [dashboardId] as any[] : [];
            const result = db.prepare(sql).all(...params);
            return result.map((r: any) => ({
                ...r,
                schema: JSON.parse(r.schema)
            }));
        } catch (e: any) {
            return { error: e.message };
        }
    }, {
        query: t.Object({
            dashboardId: t.Optional(t.String())
        })
    })
    .get("/api/datasets/:id/content", async ({ params, set }) => {
        try {
            const result: any = db.prepare("SELECT content FROM datasets WHERE id = ?").all(params.id);
            if (result.length === 0) {
                set.status = 404;
                return { error: "Dataset not found" };
            }
            return { content: result[0].content };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })
    .post("/api/datasets", async ({ body, set }) => {
        const { id, name, content, schema, dashboardId } = body;
        try {
            db.prepare("INSERT OR REPLACE INTO datasets (id, name, content, schema, updated_at, dashboard_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)").run(id, name, content, JSON.stringify(schema), dashboardId || null);
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    }, {
        body: t.Object({
            id: t.String(),
            name: t.String(),
            content: t.String(),
            schema: t.Any(),
            dashboardId: t.Optional(t.String())
        })
    })
    .delete("/api/datasets/:id", async ({ params, set }) => {
        try {
            const id = params.id;
            const sepIndex = id.indexOf('__');
            let altId: string | null = null;
            if (sepIndex !== -1) {
                altId = id.substring(sepIndex + 2);
            }
            if (altId) {
                db.prepare("DELETE FROM datasets WHERE id = ? OR id = ?").run(id, altId);
            } else {
                db.prepare("DELETE FROM datasets WHERE id = ?").run(id);
            }
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })
    .post("/api/ask", async ({ body, jwt, headers, set }) => {
        // Protect route loosely
        const authHeader = headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            set.status = 401;
            return { error: 'Unauthorized' };
        }

        const { prompt, schema, sampleData, extraContext } = body;
        try {
            const systemPrompt = `Eres un asistente de datos experto para DVisual (un clon de PowerBI). Trabajas con DuckDB/SQLite.

ESQUEMA DE LAS TABLAS DEL USUARIO:
${JSON.stringify(schema, null, 1)}

DATOS DE EJEMPLO (primeras 3 filas de cada tabla):
${sampleData || '(sin datos de ejemplo)'}

${extraContext ? `CONTEXTO ADICIONAL:\n${extraContext}` : ''}

REGLAS ESTRICTAS:
1. Responde SIEMPRE en espanol, de forma breve y directa (maximo 2-3 oraciones de explicacion).
2. Si necesitas ejecutar SQL, pon la consulta DENTRO de [SQL]...[/SQL]. NO uses triple backtick.
3. MIRA los datos de ejemplo para entender el formato real de cada columna. Si una columna numerica tiene formato como '$32,370.00' o '1,234', usa REPLACE para limpiar antes de CAST. Ejemplo: CAST(REPLACE(REPLACE(Sales, '$', ''), ',', '') AS DOUBLE)
4. Si el usuario pide un grafico, genera un JSON compatible con ApexCharts dentro de [CHART]...[/CHART].
   - Usa un formato con "title", "xAxis" y "series" cuando aplique.
   - Para barras y lineas: series con type "bar" o "line".
   - Para pastel: series type "pie" y data con {name, value}.
   - Para dispersion: type "scatter".
5. NO generes tablas markdown ni ejemplos ficticios. El sistema ejecutara tu SQL automaticamente y mostrara los resultados reales.
6. NO expliques paso a paso. Solo di brevemente que vas a hacer y pon el [SQL] o [CHART].
7. Si una consulta falla, recibiras el error y deberas generar una consulta corregida.
8. NO uses clausulas LIMIT en tus consultas SQL. El usuario quiere visualizar TODOS los datos disponibles sin restricciones.`;

            const completionStream = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                model: "openai/gpt-oss-120b",
                temperature: 0.3,
                max_completion_tokens: 4096,
                top_p: 1,
                stream: true,
                reasoning_effort: "medium",
                stop: null
            });

            let fullResponse = "";
            for await (const chunk of completionStream) {
                fullResponse += chunk.choices[0]?.delta?.content || '';
            }

            return { response: fullResponse };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    }, {
        body: t.Object({
            prompt: t.String(),
            schema: t.Any(),
            sampleData: t.Optional(t.String()),
            extraContext: t.Optional(t.String())
        })
    })
    .listen(Number(process.env.PORT || 3000));

console.log(
    `Backend running at ${app.server?.hostname}:${app.server?.port}`
);

