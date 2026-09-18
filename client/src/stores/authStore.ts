import {defineStore} from "pinia";

import {fetchCurrentUser, login as loginApi} from "@/api/authApi";
import {getApiErrorMessage} from "@/api/http";
import {
    clearStoredToken,
    getStoredToken,
    getStoredUser,
    setStoredToken,
    setStoredUser,
    type StoredUser,
} from "@/config/authStorage";

interface AuthState {
    token: string | null;
    user: StoredUser | null;
    loading: boolean;
    error: string | null;
}

export const useAuthStore = defineStore("auth", {
    state: (): AuthState => ({
        token: getStoredToken(),
        user: getStoredUser(),
        loading: false,
        error: null,
    }),

    getters: {
        isAuthenticated(state): boolean {
            return !!state.token;
        },
        isAdmin(state): boolean {
            return state.user?.globalRole === "ADMIN";
        },
    },

    actions: {
        async login(username: string, password: string): Promise<void> {
            this.loading = true;
            this.error = null;
            try {
                const response = await loginApi(username, password);
                this.token = response.accessToken;
                setStoredToken(response.accessToken);
                await this.refreshUser();
            } catch (error) {
                this.error = getApiErrorMessage(error);
                this.logout();
                throw error;
            } finally {
                this.loading = false;
            }
        },

        async refreshUser(): Promise<void> {
            if (!this.token) return;
            try {
                const user = await fetchCurrentUser();
                this.user = user;
                setStoredUser(user);
            } catch {
                // token 无效或过期
                this.logout();
            }
        },

        logout(): void {
            this.token = null;
            this.user = null;
            clearStoredToken();
        },
    },
});
