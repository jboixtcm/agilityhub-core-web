export interface paths {
    "/branding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getBranding"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateMe"];
        trace?: never;
    };
    "/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updatePassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["revokeSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/magic-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["requestMagicLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/handoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createHandoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oauth2/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["revokeToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oauth2/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["issueToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ApiErrorResponse: {
            code: string;
            message: string;
            details?: unknown;
            traceId?: string;
        };
        BrandingResponse: {
            club: {
                slug: string;
                name: string;
            };
            theme: components["schemas"]["Theme"];
            locales: string[];
            defaultLocale: string;
            timeZone: string;
            currency: string;
            countryProfile: components["schemas"]["CountryProfile"];
            modules: string[];
            signup: {
                enabled: boolean;
            };
            /** @enum {string} */
            status: "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
            legal: {
                /** Format: uri */
                privacyPolicyUrl: string;
            };
        };
        Theme: {
            colors: {
                primary: string;
                onPrimary: string;
                background: string;
                surface: string;
                surfaceAlt: string;
                text: string;
                textMuted: string;
                border: string;
                success: string;
                warning: string;
                danger: string;
                info: string;
            };
            /** Format: uri */
            logoUrl?: string;
            /** Format: uri */
            logoDarkUrl?: string;
            /** Format: uri */
            markUrl?: string;
            fontFamily: string;
            radius: string;
            ringPalette: string[];
            /** @enum {string} */
            mode: "auto" | "light" | "dark";
        };
        CountryProfile: {
            code: string;
            idDocumentTypes: string[];
            phonePrefix: string;
        };
        MeResponse: {
            account: {
                /** Format: uuid */
                id: string;
                name: string;
                /** Format: email */
                email: string;
                locale: string;
                /** @enum {string} */
                gender: "FEMALE" | "MALE" | "NON_BINARY" | "UNSPECIFIED";
                hasPassword: boolean;
                /** Format: date-time */
                emailVerifiedAt?: string;
            };
            membership: {
                roles: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
                /** Format: uuid */
                memberId?: string;
                /** Format: uuid */
                instructorId?: string;
                /** @enum {string} */
                activeProfile?: "MEMBER" | "INSTRUCTOR" | "ADMIN";
                profiles?: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
                /** @enum {string} */
                defaultProfile?: "MEMBER" | "INSTRUCTOR" | "ADMIN";
                rememberProfile?: boolean;
            };
            impersonation?: {
                actorName: string;
            };
            modules: string[];
        };
        PasswordGrantRequest: {
            /** @constant */
            grant_type: "password";
            /** Format: email */
            username: string;
            /** Format: password */
            password: string;
        };
        MagicLinkGrantRequest: {
            /** @constant */
            grant_type: "urn:agilityhub:grant:magic-link";
            token: string;
            client_id: string;
        };
        HandoffGrantRequest: {
            /** @constant */
            grant_type: "urn:agilityhub:grant:handoff";
            code: string;
            client_id: string;
        };
        RefreshGrantRequest: {
            /** @constant */
            grant_type: "refresh_token";
            refresh_token: string;
        };
        TokenGrantRequest: components["schemas"]["PasswordGrantRequest"] | components["schemas"]["MagicLinkGrantRequest"] | components["schemas"]["HandoffGrantRequest"] | components["schemas"]["RefreshGrantRequest"];
        TokenResponse: {
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
        };
        MagicLinkRequest: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            purpose: "LOGIN" | "RESET";
            client_id: string;
            /** Format: uri */
            redirect_uri?: string;
        };
        UpdatePasswordRequest: {
            /** Format: password */
            current?: string;
            /** Format: password */
            new: string;
            /** Format: password */
            repeat: string;
        };
        UpdateProfileRequest: {
            /** @enum {string} */
            activeProfile: "MEMBER" | "INSTRUCTOR" | "ADMIN";
            remember: boolean;
        };
        ProfileTokenResponse: {
            access_token: string;
        };
        UpdateMeRequest: {
            locale?: string;
            name?: string;
        };
        AccountSession: {
            /** Format: uuid */
            id: string;
            deviceLabel: string;
            /** Format: date-time */
            lastUsedAt: string;
            current: boolean;
        };
        SessionListResponse: {
            items: components["schemas"]["AccountSession"][];
        };
        HandoffRequest: {
            targetClientId: string;
        };
        HandoffResponse: {
            code: string;
            /** Format: uri */
            url: string;
        };
        RevokeTokenRequest: {
            token: string;
        };
        HealthResponse: {
            status: string;
            version: string;
            /** Format: date-time */
            builtAt: string;
        };
    };
    responses: {
        /** @description Standard API error */
        ApiError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getBranding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public branding for the request host */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current account and club membership */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMeRequest"];
            };
        };
        responses: {
            /** @description Updated account and club membership */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updatePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePasswordRequest"];
            };
        };
        responses: {
            /** @description Password updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProfileRequest"];
            };
        };
        responses: {
            /** @description Active profile updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileTokenResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Active account sessions */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionListResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    revokeSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    requestMagicLink: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MagicLinkRequest"];
            };
        };
        responses: {
            /** @description Neutral accepted response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    createHandoff: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HandoffRequest"];
            };
        };
        responses: {
            /** @description One-time handoff code */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HandoffResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    revokeToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeTokenRequest"];
            };
        };
        responses: {
            /** @description Token revoked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Service health */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    issueToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["TokenGrantRequest"];
            };
        };
        responses: {
            /** @description OAuth2 token response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
}

