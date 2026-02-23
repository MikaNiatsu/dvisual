import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export const readThemeMode = (): ThemeMode => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('dvisual_theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
};

export const useThemeMode = (): ThemeMode => {
    const [theme, setTheme] = useState<ThemeMode>(readThemeMode);

    useEffect(() => {
        const onThemeChange = (event: Event) => {
            const detail = (event as CustomEvent<ThemeMode>).detail;
            if (detail === 'light' || detail === 'dark') {
                setTheme(detail);
                return;
            }
            setTheme(readThemeMode());
        };

        const onStorage = () => setTheme(readThemeMode());

        window.addEventListener('dvisual-theme-change', onThemeChange as EventListener);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener('dvisual-theme-change', onThemeChange as EventListener);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return theme;
};
