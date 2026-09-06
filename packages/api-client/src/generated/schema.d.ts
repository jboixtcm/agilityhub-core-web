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
                primaryFg: string;
                surface: string;
                surface2: string;
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
            markUrl?: string;
            fonts?: {
                [key: string]: string;
            };
            /** @enum {string} */
            mode: "AUTO" | "LIGHT" | "DARK";
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
            };
            membership: {
                roles: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
                /** Format: uuid */
                memberId?: string;
                defaultProfile?: string;
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
        TokenResponse: {
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
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
                "application/x-www-form-urlencoded": components["schemas"]["PasswordGrantRequest"];
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

