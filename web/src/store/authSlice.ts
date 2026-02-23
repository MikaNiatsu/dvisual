import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
    isAuthenticated: boolean;
    user: { username: string; is_master: boolean } | null;
    token: string | null;
}

const getInitialAuthState = (): AuthState => {
    if (typeof window === 'undefined') {
        return {
            isAuthenticated: false,
            user: null,
            token: null,
        };
    }
    try {
        const token = localStorage.getItem('token');
        const userRaw = localStorage.getItem('user');
        const user = userRaw ? JSON.parse(userRaw) : null;
        if (token && user) {
            return {
                isAuthenticated: true,
                user,
                token,
            };
        }
    } catch {
    }
    return {
        isAuthenticated: false,
        user: null,
        token: null,
    };
};

const initialState: AuthState = getInitialAuthState();

export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<{ user: { username: string; is_master: boolean }, token: string }>) => {
            state.isAuthenticated = true;
            state.user = action.payload.user;
            state.token = action.payload.token;
        },
        logout: (state) => {
            state.isAuthenticated = false;
            state.user = null;
            state.token = null;
        },
    },
});

export const { loginSuccess, logout } = authSlice.actions;
export default authSlice.reducer;
