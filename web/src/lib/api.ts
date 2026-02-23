const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

// Helper to get token
const getToken = () => {
    // In a real app, this might come from localStorage or a store getter passed in
    // For now, we'll assume the caller handles token management or we store it in localStorage on login
    return localStorage.getItem('token');
};

const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
};

async function buildApiError(res: Response, fallback: string) {
    let detail = '';
    try {
        const data = await res.json();
        detail = data?.error || data?.message || '';
    } catch {
        try {
            detail = await res.text();
        } catch {
            detail = '';
        }
    }
    return new Error(`${fallback} (${res.status}${detail ? `: ${detail}` : ''})`);
}

export async function login(username: string, password: string) {
    const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    return res.json();
}

export async function fetchDashboards() {
    const res = await fetch(`${API_URL}/dashboards`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch dashboards");
    return res.json();
}

export async function saveDashboard(id: string, name: string, layout: any) {
    const res = await fetch(`${API_URL}/dashboards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id, name, layout }),
    });
    if (!res.ok) throw new Error("Failed to save dashboard");
    return res.json();
}

export async function fetchDatasets(dashboardId?: string) {
    const url = dashboardId ? `${API_URL}/datasets?dashboardId=${encodeURIComponent(dashboardId)}` : `${API_URL}/datasets`;
    const res = await fetch(url, {
         headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch datasets");
    return res.json();
}

export async function fetchDatasetContent(id: string) {
    const res = await fetch(`${API_URL}/datasets/${id}/content`, {
         headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch dataset content");
    return res.json();
}

export async function saveDataset(id: string, name: string, content: string, schema: any, dashboardId?: string) {
    const res = await fetch(`${API_URL}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id, name, content, schema, dashboardId }),
    });
    if (!res.ok) throw new Error("Failed to save dataset");
    return res.json();
}

export async function deleteDataset(id: string) {
    const res = await fetch(`${API_URL}/datasets/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Failed to delete dataset");
    return res.json();
}

// --- Admin / Permissions ---

export async function fetchUsers() {
    const res = await fetch(`${API_URL}/users`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
}

export async function createUser(username: string, password: string, is_master: boolean) {
    const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ username, password, is_master }),
    });
    if (!res.ok) throw new Error("Failed to create user");
    return res.json();
}

export async function fetchAdminRoles() {
    const res = await fetch(`${API_URL}/admin/roles`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw await buildApiError(res, "Failed to fetch admin roles");
    return res.json();
}

export async function createAdminRole(dashboard_id: string, name: string, permissions: string[]) {
    const res = await fetch(`${API_URL}/admin/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dashboard_id, name, permissions }),
    });
    if (!res.ok) throw await buildApiError(res, "Failed to create admin role");
    return res.json();
}

export async function fetchAdminIpRules() {
    const res = await fetch(`${API_URL}/admin/ip-rules`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw await buildApiError(res, "Failed to fetch ip rules");
    return res.json();
}

export async function createAdminIpRule(dashboard_id: string, ip_pattern: string, access_level: string) {
    const res = await fetch(`${API_URL}/admin/ip-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dashboard_id, ip_pattern, access_level }),
    });
    if (!res.ok) throw await buildApiError(res, "Failed to create ip rule");
    return res.json();
}

export async function deleteAdminIpRule(ruleId: string | number) {
    const res = await fetch(`${API_URL}/admin/ip-rules/${ruleId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
    });
    if (!res.ok) throw await buildApiError(res, "Failed to delete ip rule");
    return res.json();
}

export async function resetAdminDatabase(confirm: string) {
    const res = await fetch(`${API_URL}/admin/reset-database`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ confirm }),
    });
    if (!res.ok) throw await buildApiError(res, "Failed to reset database");
    return res.json();
}

export async function fetchPermissions(dashboardId: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/permissions`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch permissions");
    return res.json();
}

export async function assignPermission(dashboardId: string, target: string, type: 'user' | 'ip', access_level: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ target, type, access_level }),
    });
    if (!res.ok) throw new Error("Failed to assign permission");
    return res.json();
}

export async function fetchDashboardRoles(dashboardId: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles`, {
        headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch roles");
    return res.json();
}

export async function createDashboardRole(dashboardId: string, name: string, permissions: string[]) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name, permissions }),
    });
    if (!res.ok) throw new Error("Failed to create role");
    return res.json();
}

export async function updateDashboardRole(dashboardId: string, roleId: string, name: string, permissions: string[]) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles/${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name, permissions }),
    });
    if (!res.ok) throw new Error("Failed to update role");
    return res.json();
}

export async function deleteDashboardRole(dashboardId: string, roleId: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles/${roleId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Failed to delete role");
    return res.json();
}

export async function addRoleMember(dashboardId: string, roleId: string, username: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles/${roleId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ username }),
    });
    if (!res.ok) throw new Error("Failed to add role member");
    return res.json();
}

export async function removeRoleMember(dashboardId: string, roleId: string, userId: string) {
    const res = await fetch(`${API_URL}/dashboards/${dashboardId}/roles/${roleId}/members/${userId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Failed to remove role member");
    return res.json();
}

export async function askAI(prompt: string, schema: any, sampleData?: string, extraContext?: string) {
    const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ prompt, schema, sampleData, extraContext }),
    });
    if (!res.ok) throw new Error("AI request failed");
    return res.json();
}

