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
    "/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/filter-values": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listMemberFilterValues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["exportMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listDogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/filter-values": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listDogFilterValues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["exportDogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-views": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listSavedViews"];
        put?: never;
        post: operations["createSavedView"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-views/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateSavedView"];
        post?: never;
        delete: operations["deleteSavedView"];
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
        Money: {
            amountMinor: number;
            currency: string;
        };
        ListFilter: {
            field: string;
            /** @enum {string} */
            op: "eq" | "ne" | "in" | "nin" | "lt" | "lte" | "gt" | "gte" | "contains" | "startsWith" | "exists" | "between";
            value: string;
            label?: string;
            valueLabel?: string;
        };
        FilterValue: {
            value: string;
            label: string;
            count: number;
        };
        FilterValuesResponse: {
            field: string;
            values: components["schemas"]["FilterValue"][];
        };
        DisplayStatus: {
            /** @enum {string} */
            kind: "PENDING" | "ACTIVE" | "INACTIVE_PERIOD" | "LEAVE_SCHEDULED" | "LEFT";
            label: string;
            /** Format: date */
            date?: string;
        };
        MemberListItem: {
            id: string;
            memberNumber: number;
            firstName: string;
            lastName: string;
            fullName: string;
            dogs: {
                id: string;
                name: string;
                levelCode: string;
            }[];
            plan: {
                id: string;
                name: string;
                summary: string;
            };
            priceId?: string;
            /** @enum {string} */
            status: "PENDING" | "ACTIVE" | "LEFT";
            displayStatus: components["schemas"]["DisplayStatus"];
            contact: string;
            paymentMethod?: string;
            /** Format: date */
            nextInvoiceDate?: string;
            familyGroup?: string;
            /** Format: date-time */
            joinedAt: string;
            /** Format: date */
            leaveDate?: string;
            bookingBlocked: boolean;
            imageRightsGranted: boolean;
            roles: string[];
            city: string;
            postalCode: string;
            pendingDocuments: number;
            freeTrainingAllowed: boolean;
            /** Format: date */
            birthDate: string;
            /** @enum {string} */
            gender: "FEMALE" | "MALE" | "NON_BINARY" | "UNSPECIFIED";
            idDocument: string;
        };
        MemberListResponse: {
            items: components["schemas"]["MemberListItem"][];
            page: number;
            size: number;
            totalItems: number;
            totalPages: number;
            appliedFilters: components["schemas"]["ListFilter"][];
        };
        DogListItem: {
            id: string;
            name: string;
            breed: string;
            level: {
                id: string;
                code: string;
                name: string;
                order: number;
            };
            owner: {
                id: string;
                fullName: string;
                lastName: string;
            };
            /** @enum {string} */
            status: "PENDING" | "ACTIVE" | "INACTIVE";
            displayStatus: components["schemas"]["DisplayStatus"];
            freeTrainingAllowed: boolean;
            licenses: {
                organisation: string;
                number: string;
                grade?: string;
            }[];
            /** @enum {string} */
            sex: "FEMALE" | "MALE" | "UNSPECIFIED";
            ageYears: number;
            /** Format: date */
            birthDate?: string;
            chip: string;
            pendingDocuments: number;
            /** Format: date */
            levelAssignedAt: string;
            pack?: string;
            /** Format: date-time */
            registeredAt: string;
        };
        DogListResponse: {
            items: components["schemas"]["DogListItem"][];
            page: number;
            size: number;
            totalItems: number;
            totalPages: number;
            appliedFilters: components["schemas"]["ListFilter"][];
        };
        SavedView: {
            id: string;
            ownerAccountId: string;
            listKey: string;
            name: string;
            columns: string[];
            filters: components["schemas"]["ListFilter"][];
            sort: string[];
            shared: boolean;
        };
        SavedViewRequest: {
            listKey: string;
            name: string;
            columns: string[];
            filters: components["schemas"]["ListFilter"][];
            sort: string[];
            shared: boolean;
        };
        ExportJobResponse: {
            jobId: string;
        };
        BrandingResponse: {
            club: {
                slug: string;
                name: string;
                city?: string | null;
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
    parameters: {
        Page: number;
        Size: 20 | 50 | 200 | 1000;
        Sort: string[];
        Search: string;
        Filter: string[];
        Fields: string;
        Columns: string;
        FilterField: string;
        ExportFormat: "xlsx" | "pdf";
        ResourceId: string;
    };
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
    listMembers: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                sort?: components["parameters"]["Sort"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
                fields?: components["parameters"]["Fields"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Universal member list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberListResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listMemberFilterValues: {
        parameters: {
            query: {
                field: components["parameters"]["FilterField"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Member facet values */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FilterValuesResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    exportMembers: {
        parameters: {
            query: {
                format: components["parameters"]["ExportFormat"];
                sort?: components["parameters"]["Sort"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
                columns: components["parameters"]["Columns"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Member export */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Asynchronous export */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportJobResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listDogs: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                sort?: components["parameters"]["Sort"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
                fields?: components["parameters"]["Fields"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Universal dog list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogListResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listDogFilterValues: {
        parameters: {
            query: {
                field: components["parameters"]["FilterField"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dog facet values */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FilterValuesResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    exportDogs: {
        parameters: {
            query: {
                format: components["parameters"]["ExportFormat"];
                sort?: components["parameters"]["Sort"];
                q?: components["parameters"]["Search"];
                filter?: components["parameters"]["Filter"];
                columns: components["parameters"]["Columns"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dog export */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Asynchronous export */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportJobResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listSavedViews: {
        parameters: {
            query: {
                listKey: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Saved views for a list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedView"][];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createSavedView: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedViewRequest"];
            };
        };
        responses: {
            /** @description Saved view created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedView"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateSavedView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedViewRequest"];
            };
        };
        responses: {
            /** @description Saved view updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedView"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteSavedView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Saved view deleted */
            204: {
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

