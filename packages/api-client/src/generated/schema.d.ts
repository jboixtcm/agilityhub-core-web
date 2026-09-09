export interface paths {
    "/.well-known/jwks.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get public JWT verification keys
         * @description ANON, global. RSA public keys only; no private key material.
         */
        get: operations["wellKnownJwks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/.well-known/openid-configuration": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover the global OpenID provider
         * @description ANON. R-01-11; implemented in E1-T05.
         */
        get: operations["discovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/{id}/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Synchronize an existing Learn password hash
         * @description R-01-12. Authenticated learn client with accounts:write scope, or AGILITYHUB_ADMIN (S17). Idempotent; never returns the hash.
         */
        put: operations["accountPassword"];
        post?: never;
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
        /**
         * Create a one-use code for switching apps
         * @description Account token with club context. R-01-13: code lasts 60 seconds and is bound to targetClientId.
         */
        post: operations["handoff"];
        delete?: never;
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
        /**
         * Request a login or password-reset magic link
         * @description ANON. R-01-04: neutral 202 whether the account/membership exists or not; no email enumeration. Shares the configured authentication IP quota with /oauth2/token.
         */
        post: operations["magicLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/branding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["branding"];
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
    "/manifest.webmanifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["manifest"];
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
        /**
         * Get the current account and active club context
         * @description Any valid account token. R-01-15: only the current host/JWT membership, role profiles and enabled features. Includes global account bootstrap; impersonation is completed in E1-T04.
         */
        get: operations["me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update account language or display name
         * @description Any valid account token. R-01-14.
         */
        patch: operations["update"];
        trace?: never;
    };
    "/me/onboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get required first-access profile and privacy steps
         * @description Any valid account token. S01 §14, T-01-26. Implemented in E1-T06.
         */
        get: operations["onboarding"];
        /**
         * Complete first-access privacy consent and optional profile fields
         * @description Any valid account token. S01 §14, T-01-26: consentAccepted must be true for the current consentVersion. Profile data may be deferred; imageConsent is optional. Implemented in E1-T06.
         */
        put: operations["completeOnboarding"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/onboarding/postpone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Postpone the current consent prompt
         * @description Any valid account token. S01 §6, §14: decrements postponeRemaining, bounded by legal.maxPostpones. At zero returns the unchanged state without an error. Implemented in E1-T06.
         */
        post: operations["postponeOnboarding"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
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
        /**
         * Set or change the current account password
         * @description Account token, never impersonated. R-01-05: current is required only when a password already exists.
         */
        put: operations["password"];
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
        get: operations["myCensusProfile"];
        /**
         * Select an available club profile
         * @description Account token with club context. R-01-07. Returns a fresh access token.
         */
        put: operations["profile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateMyCensusProfile"];
        trace?: never;
    };
    "/me/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the current account's device sessions
         * @description Any valid account token. R-01-06, R-01-10. Bounded device list, not a desktop paginated list.
         */
        get: operations["sessions"];
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
        /**
         * Revoke one of the current account's sessions
         * @description Any valid account token. R-01-10. The session must belong to this account.
         */
        delete: operations["deleteSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/{id}/impersonation-token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a non-refreshable member impersonation token
         * @description ADMIN of the same club, never an impersonated token. R-01-09. Target lookup and grant issuance are E1-T04.
         */
        post: operations["impersonation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Provision a global account
         * @description R-01-12. Authenticated learn client with accounts:write scope, or AGILITYHUB_ADMIN (S17). Idempotent.
         */
        post: operations["createAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/connect/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * End the OpenID provider session
         * @description RP-initiated logout; validates the ID token hint and registered post-logout URI. R-01-11.
         */
        get: operations["logout"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oauth2/authorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Start authorization code flow with PKCE
         * @description ANON. R-01-11; E1-T05. Public clients require S256 PKCE.
         */
        get: operations["authorize"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oauth2/jwks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get public JWT verification keys
         * @description ANON, global. Compatibility alias for /.well-known/jwks.json.
         */
        get: operations["jwks"];
        put?: never;
        post?: never;
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
        /**
         * Revoke a refresh session or impersonation grant
         * @description Any valid account token. R-01-10. Idempotent; JSON body as specified in S01 §6.
         */
        post: operations["revoke"];
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
        /**
         * Issue tokens using an OAuth2 or AgilityHub grant
         * @description ANON with client authentication. Club context comes from the host, never request data. Password and magic-link grants issue sessions; refresh tokens rotate on every use. Handoff, authorization-code grants and confidential clients are completed by later E1 tasks. client_secret is required for confidential clients; code_verifier for public authorization-code clients.
         */
        post: operations["token"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oauth2/userinfo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get account claims permitted by the token scopes
         * @description Account token with openid scope; profile/email/memberships control the corresponding claims. R-01-11.
         */
        get: operations["userinfo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/email/sendgrid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive signed SendGrid delivery events
         * @description ECDSA signature over the timestamp header and raw request bytes. No bearer token or request tenant is required. Events are matched to the stored notification, club and recipient; sg_event_id is idempotent.
         */
        post: operations["receive"];
        delete?: never;
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
    "/members/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMember"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateMember"];
        trace?: never;
    };
    "/members/{id}/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMemberOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/{id}/payment-method": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateMemberPaymentMethod"];
        trace?: never;
    };
    "/members/{id}/booking-block": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["blockMemberBookings"];
        delete: operations["unblockMemberBookings"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/{id}/access-resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["resendMemberAccess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/{id}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateMemberRoles"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/members/{id}/notification-preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateMemberNotificationPreferences"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateDog"];
        trace?: never;
    };
    "/dogs/{id}/level": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateDogLevel"];
        trace?: never;
    };
    "/dogs/{id}/free-training": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateDogFreeTraining"];
        trace?: never;
    };
    "/dogs/{id}/transfer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["transferDog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/deactivation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["deactivateDog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/reactivation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["reactivateDog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/photo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateDogPhoto"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listDogDocuments"];
        put?: never;
        post: operations["uploadDogDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/documents/{docId}/files/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["removeDogDocumentFile"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dogs/{id}/documents/reminder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["remindDogDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attachments/upload-url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createAttachmentUploadUrl"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/levels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listLevels"];
        put?: never;
        post: operations["createLevel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/levels/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["orderLevels"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/levels/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteLevel"];
        options?: never;
        head?: never;
        patch: operations["updateLevel"];
        trace?: never;
    };
    "/rings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listRings"];
        put?: never;
        post: operations["createRing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rings/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["orderRings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteRing"];
        options?: never;
        head?: never;
        patch: operations["updateRing"];
        trace?: never;
    };
    "/instructors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listInstructors"];
        put?: never;
        post: operations["createInstructor"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/instructors/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteInstructor"];
        options?: never;
        head?: never;
        patch: operations["updateInstructor"];
        trace?: never;
    };
    "/administrators": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listAdministrators"];
        put?: never;
        post: operations["createAdministrator"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/administrators/{membershipId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteAdministrator"];
        options?: never;
        head?: never;
        patch: operations["updateAdministrator"];
        trace?: never;
    };
    "/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listPlans"];
        put?: never;
        post: operations["createPlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updatePlan"];
        trace?: never;
    };
    "/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createPrice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/faq-entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listFaqs"];
        put?: never;
        post: operations["createFaq"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/faq-entries/filter-values": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["faqCategoryValues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/faq-entries/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["orderFaqs"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/faq-entries/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteFaq"];
        options?: never;
        head?: never;
        patch: operations["updateFaq"];
        trace?: never;
    };
    "/country-profile/postal-codes/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["postalCodeTowns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/dogs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["myDogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/dogs/{id}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["uploadMyDogDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/dogs/{id}/instructor-note": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateInstructorNote"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/dogs/{id}/photo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateMyDogPhoto"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/parameters/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["parameter"];
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AccountPasswordRequest: {
            passwordHash: string;
        };
        AccountPatchRequest: {
            /** @enum {string} */
            locale?: "ca" | "es" | "en";
            name?: string;
        };
        AccountSummary: {
            /** Format: email */
            email: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            locale: "ca" | "es" | "en";
            name: string;
            platformRoles: "AGILITYHUB_ADMIN"[];
        };
        ApiError: {
            code: string;
            details: {
                [key: string]: unknown;
            };
            message: string;
            traceId: string;
        };
        BrandingResponse: {
            club?: components["schemas"]["ClubSummary"];
            countryProfile?: components["schemas"]["Country"];
            currency?: string;
            defaultLocale?: string;
            legal?: components["schemas"]["Legal"];
            locales?: string[];
            modules?: string[];
            signup?: components["schemas"]["Signup"];
            status?: string;
            theme?: components["schemas"]["Theme"];
            timeZone?: string;
        };
        ClubSummary: {
            city?: string | null;
            name?: string;
            slug?: string;
        };
        Colors: {
            background?: string;
            border?: string;
            danger?: string;
            info?: string;
            onPrimary?: string;
            primary?: string;
            success?: string;
            surface?: string;
            surfaceAlt?: string;
            text?: string;
            textMuted?: string;
            warning?: string;
        };
        Country: {
            code?: string;
            idDocumentTypes?: string[];
            phonePrefix?: string;
        };
        HandoffRequest: {
            targetClientId: string;
        };
        HandoffResponse: {
            code: string;
            /** Format: uri */
            url: string;
        };
        HealthResponse: {
            /** Format: date-time */
            builtAt?: string;
            status?: string;
            version?: string;
        };
        Icon: {
            purpose?: string;
            sizes?: string;
            src?: string;
            type?: string;
        };
        Impersonation: {
            actorName: string;
        };
        ImpersonationRequest: {
            reason?: string;
        };
        ImpersonationTokenResponse: {
            /** Format: date-time */
            expiresAt: string;
            token: string;
        };
        JwkSet: {
            keys: components["schemas"]["PublicJwk"][];
        };
        Legal: {
            privacyPolicyUrl?: string;
        };
        MagicLinkRequest: {
            client_id: string;
            /** Format: email */
            email: string;
            /** @enum {string} */
            purpose: "LOGIN" | "RESET";
            /** Format: uri */
            redirect_uri?: string;
        };
        Manifest: {
            background_color?: string;
            display?: string;
            icons?: components["schemas"]["Icon"][];
            name?: string;
            short_name?: string;
            start_url?: string;
            theme_color?: string;
        };
        /** @description R-01-15 app bootstrap. Membership is absent without club context; features are branding.modules. */
        Me: {
            account: components["schemas"]["MeAccount"];
            features: string[];
            impersonation?: components["schemas"]["Impersonation"];
            membership?: components["schemas"]["MembershipSummary"];
        };
        MeAccount: {
            /** Format: email */
            email: string;
            /** Format: date-time */
            emailVerifiedAt?: string;
            hasPassword: boolean;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            locale: "ca" | "es" | "en";
            name: string;
            onboardingPending: boolean;
            platformRoles: "AGILITYHUB_ADMIN"[];
        };
        MembershipSummary: {
            activeProfile?: components["schemas"]["Profile"];
            /** Format: uuid */
            clubId: string;
            defaultProfile?: components["schemas"]["Profile"];
            /**
             * @description Member.gender; absent when there is no member
             * @enum {string}
             */
            gender?: "MALE" | "FEMALE" | "OTHER";
            /** Format: uuid */
            instructorId?: string;
            /** Format: uuid */
            memberId?: string;
            profiles: components["schemas"]["Profile"][];
            rememberProfile: boolean;
            roles: components["schemas"]["Profile"][];
        };
        OnboardingField: {
            key: string;
            required: boolean;
            value: string | null;
        };
        OnboardingFields: {
            /** @enum {string} */
            locale?: "ca" | "es" | "en";
            name?: string;
            /** @description Requested only when configured by the club */
            phone?: string;
        };
        OnboardingRequest: {
            consentAccepted: boolean;
            consentVersion: string;
            fields?: components["schemas"]["OnboardingFields"];
            imageConsent?: boolean;
        };
        /** @description Pending onboarding, remaining postponements and current consent; S01 §14 */
        OnboardingState: {
            /** @description Keys and required flags from signup.onboardingFields */
            fields: components["schemas"]["OnboardingField"][];
            pending: boolean;
            /** Format: int32 */
            postponeRemaining: number;
            requiredConsent: components["schemas"]["RequiredConsent"];
        };
        OpenIdConfiguration: {
            authorization_endpoint?: string;
            code_challenge_methods_supported?: string[];
            end_session_endpoint?: string;
            grant_types_supported?: string[];
            id_token_signing_alg_values_supported?: string[];
            issuer?: string;
            jwks_uri?: string;
            response_types_supported?: string[];
            revocation_endpoint?: string;
            scopes_supported?: string[];
            subject_types_supported?: string[];
            token_endpoint?: string;
            token_endpoint_auth_methods_supported?: string[];
            userinfo_endpoint?: string;
        };
        PasswordRequest: {
            /** Format: password */
            current?: string;
            /** Format: password */
            new: string;
            /** Format: password */
            repeat: string;
        };
        PlatformAccountRequest: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            locale: "ca" | "es" | "en";
            name: string;
            /** @description Existing Learn bcrypt hash, preserved on import */
            passwordHash?: string;
        };
        /** @enum {string} */
        Profile: "MEMBER" | "INSTRUCTOR" | "ADMIN";
        ProfileRequest: {
            activeProfile: components["schemas"]["Profile"];
            remember: boolean;
        };
        ProfileResponse: {
            access_token: string;
        };
        PublicJwk: {
            alg?: string;
            e: string;
            kid: string;
            /** @enum {string} */
            kty: "RSA";
            n: string;
            use?: string;
        };
        RequiredConsent: {
            /** @enum {string} */
            policy: "PLATFORM" | "CLUB";
            /** Format: uri */
            url: string;
            version: string;
        } | null;
        RevokeRequest: {
            token: string;
        };
        SendGridEvent: {
            clubId?: string;
            email?: string;
            event?: string;
            notificationId?: string;
            sg_event_id?: string;
        };
        /** @description One device/session; id is an opaque revocation handle, never a token or hash */
        Session: {
            activeProfile?: components["schemas"]["Profile"];
            clientId: string;
            /** Format: uuid */
            clubId?: string;
            /** Format: date-time */
            createdAt: string;
            deviceLabel: string;
            /** Format: date-time */
            expiresAt: string;
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            lastUsedAt?: string;
        };
        Signup: {
            enabled?: boolean;
        };
        Theme: {
            colors?: components["schemas"]["Colors"];
            fontFamily?: string;
            logoDarkUrl?: string;
            logoUrl?: string;
            markUrl?: string;
            /** @enum {string} */
            mode?: "auto" | "light" | "dark";
            radius?: string;
            ringPalette?: string[];
        };
        TokenRequest: {
            client_id: string;
            /** Format: password */
            client_secret?: string;
            code?: string;
            code_verifier?: string;
            /** @enum {string} */
            grant_type: "password" | "urn:agilityhub:grant:magic-link" | "urn:agilityhub:grant:handoff" | "authorization_code" | "refresh_token";
            /** Format: password */
            password?: string;
            /** Format: uri */
            redirect_uri?: string;
            refresh_token?: string;
            scope?: string;
            token?: string;
            /** Format: email */
            username?: string;
        };
        TokenResponse: {
            access_token: string;
            /** Format: int64 */
            expires_in: number;
            id_token?: string;
            refresh_token?: string;
            scope: string;
            /** @enum {string} */
            token_type: "Bearer";
        };
        UserInfo: {
            email?: string;
            email_verified?: boolean;
            locale?: string;
            /** @description Included only with the memberships scope */
            memberships?: components["schemas"]["UserInfoMembership"][];
            name?: string;
            sub: string;
        };
        UserInfoMembership: {
            clubId?: string;
            clubName?: string;
            roles?: components["schemas"]["Profile"][];
        };
        DisplayStatus: {
            /** @enum {string} */
            kind: "PENDING" | "ACTIVE" | "INACTIVE_PERIOD" | "LEAVE_SCHEDULED" | "LEFT";
            label: string;
            /** Format: date */
            date?: string;
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
        ExportJobResponse: {
            jobId: string;
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
        ListFilter: {
            field: string;
            /** @enum {string} */
            op: "eq" | "ne" | "in" | "nin" | "lt" | "lte" | "gt" | "gte" | "contains" | "startsWith" | "exists" | "between";
            value: string;
            label?: string;
            valueLabel?: string;
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
        IdDocument: {
            type: string;
            number: string;
        };
        ContactEmail: {
            /** Format: email */
            email: string;
            bounced: boolean;
        };
        Phone: {
            prefix: string;
            number: string;
            label: string;
        };
        Address: {
            street: string;
            postalCode: string;
            city: string;
            province?: string;
            country?: string;
        };
        BookingBlock: {
            active: boolean;
            reason?: string;
            /** Format: date-time */
            since?: string;
            /** Format: uuid */
            byAccountId?: string;
        };
        BookingBlockRequest: {
            reason: string;
        };
        PaymentMethod: {
            /** @enum {string} */
            type: "SEPA_DD" | "CARD" | "MANUAL";
            maskedAccount?: string;
            holderName?: string;
            holderTaxId?: string;
            channel?: string;
        };
        PaymentMethodRequest: {
            /** @enum {string} */
            type: "SEPA_DD" | "CARD" | "MANUAL";
            sepa?: {
                iban?: string;
                holderName?: string;
                holderTaxId?: string;
            };
            card?: {
                stripeSetupIntentId?: string;
            };
            manual?: {
                channel?: string;
            };
        };
        MemberConsents: {
            imageRights: {
                granted: boolean;
                /** Format: date-time */
                at?: string;
                version?: string;
                /** Format: uuid */
                byAccountId?: string;
            };
        };
        MemberPlan: {
            /** Format: uuid */
            id: string;
            name: string;
            summary: string;
        };
        MemberDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            accountId?: string;
            accountMissing?: boolean;
            memberNumber: number;
            idDocument: components["schemas"]["IdDocument"];
            firstName: string;
            lastName1: string;
            lastName2?: string;
            fullName: string;
            /** @enum {string} */
            gender: "MALE" | "FEMALE" | "OTHER";
            /** Format: date */
            birthDate: string;
            contactEmails: components["schemas"]["ContactEmail"][];
            phones: components["schemas"]["Phone"][];
            address: components["schemas"]["Address"];
            paymentMethod?: components["schemas"]["PaymentMethod"];
            plan?: components["schemas"]["MemberPlan"];
            /** Format: date */
            nextInvoiceDate?: string;
            consents: components["schemas"]["MemberConsents"];
            remarks?: string;
            internalNotes?: string;
            /** @enum {string} */
            status: "PENDING" | "ACTIVE" | "LEFT";
            /** Format: date-time */
            joinedAt: string;
            /** Format: date */
            leaveDate?: string;
            bookingBlock: components["schemas"]["BookingBlock"];
            roles: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
            /** Format: uuid */
            familyGroupId?: string;
            version: number;
        };
        MemberPatchRequest: {
            idDocument?: components["schemas"]["IdDocument"];
            firstName?: string;
            lastName1?: string;
            lastName2?: string;
            /** @enum {string} */
            gender?: "MALE" | "FEMALE" | "OTHER";
            /** Format: date */
            birthDate?: string;
            contactEmails?: components["schemas"]["ContactEmail"][];
            phones?: components["schemas"]["Phone"][];
            address?: components["schemas"]["Address"];
            remarks?: string;
            internalNotes?: string;
            consents?: components["schemas"]["MemberConsents"];
            version: number;
        };
        FamilyGroupSummary: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            holderMemberId: string;
            members: {
                /** Format: uuid */
                id: string;
                fullName: string;
                memberNumber: number;
            }[];
        };
        DogOverview: {
            /** Format: uuid */
            id: string;
            name: string;
            breed: string;
            level: components["schemas"]["LevelSummary"];
            freeTrainingAllowed: boolean;
            pack?: string;
            pendingDocuments: string[];
            instructorNote?: string;
        };
        InvoiceSummary: {
            /** Format: uuid */
            id: string;
            label: string;
            amount: number;
            status: string;
        };
        AuditSummary: {
            /** Format: uuid */
            id: string;
            summary: string;
            /** Format: date-time */
            changedAt: string;
        };
        NotificationPreferences: {
            emailByCategory: {
                OPERATIONAL: boolean;
                PERSONAL: boolean;
                CLUB_CHANGES: boolean;
                CLUB_NEWS: boolean;
            };
            smsFixed: boolean;
            reminderMinutesBefore?: number | null;
            reminderOptionsMinutes: (60 | 120 | 240 | 360 | 720 | 1440)[];
            pushClubNews: boolean;
            locale: string;
            availableLocales: string[];
            modules: {
                sms: boolean;
                push: boolean;
            };
        };
        NotificationPreferencesPatch: {
            emailByCategory?: {
                OPERATIONAL?: boolean;
                PERSONAL?: boolean;
                CLUB_CHANGES?: boolean;
                CLUB_NEWS?: boolean;
            };
            reminderMinutesBefore?: number | null;
            pushClubNews?: boolean;
        };
        MemberOverview: {
            member: components["schemas"]["MemberDetail"];
            familyGroup?: components["schemas"]["FamilyGroupSummary"];
            dogs: components["schemas"]["DogOverview"][];
            notificationPreferences: components["schemas"]["NotificationPreferences"];
            recentInvoices: components["schemas"]["InvoiceSummary"][];
            invoicesCount: number;
            recentAudit: components["schemas"]["AuditSummary"][];
            nextInvoice?: {
                /** Format: date */
                date: string;
                amount: number;
            };
        };
        AccessResendResponse: {
            /** Format: email */
            sentTo: string;
        };
        RolesRequest: {
            roles: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
        };
        RolesResponse: {
            roles: ("MEMBER" | "INSTRUCTOR" | "ADMIN")[];
        };
        LevelSummary: {
            /** Format: uuid */
            id: string;
            code: string;
            name: string;
            order: number;
            grantsFreeTraining: boolean;
            active: boolean;
        };
        LevelList: {
            items: components["schemas"]["LevelSummary"][];
            totalItems: number;
        };
        Level: {
            /** Format: uuid */
            id: string;
            code: string;
            name: string;
            nameI18n?: {
                [key: string]: string;
            };
            order: number;
            capacity: number;
            color: string;
            grantsFreeTraining: boolean;
            /** @enum {string} */
            agilityhubLevel?: "EASY" | "MEDIUM" | "HARD";
            active: boolean;
            /** Format: int64 */
            version: number;
            usage?: components["schemas"]["LevelUsage"];
            lastChange?: components["schemas"]["LastChange"];
        };
        LevelCreate: {
            code: string;
            name: {
                [key: string]: string;
            };
            order?: number;
            capacity?: number;
            color?: string;
            grantsFreeTraining?: boolean;
            /** @enum {string} */
            agilityhubLevel?: "EASY" | "MEDIUM" | "HARD";
            active?: boolean;
        };
        LevelPatch: {
            /** Format: int64 */
            version: number;
            code?: string;
            name?: {
                [key: string]: string;
            };
            order?: number;
            capacity?: number;
            color?: string;
            grantsFreeTraining?: boolean;
            /** @enum {string} */
            agilityhubLevel?: "EASY" | "MEDIUM" | "HARD";
            active?: boolean;
        };
        LevelOrder: {
            levelIds: string[];
        };
        LevelUsage: {
            activeDogs: number;
            futureClassSessions: number;
            templateClasses: number;
        };
        CatalogItemsLevel: {
            items: components["schemas"]["Level"][];
            totalItems: number;
        };
        Ring: {
            /** Format: uuid */
            id: string;
            name: string;
            shortName: string;
            color: string;
            allowsFreeTraining: boolean;
            trainingCapacity?: number;
            effectiveTrainingCapacity: number;
            order: number;
            active: boolean;
            /** Format: int64 */
            version: number;
            usage?: components["schemas"]["RingUsage"];
            lastChange?: components["schemas"]["LastChange"];
        };
        RingCreate: {
            name: string;
            shortName: string;
            color?: string;
            allowsFreeTraining?: boolean;
            trainingCapacity?: number;
            order?: number;
            active?: boolean;
        };
        RingPatch: {
            /** Format: int64 */
            version: number;
            name?: string;
            shortName?: string;
            color?: string;
            allowsFreeTraining?: boolean;
            trainingCapacity?: number;
            order?: number;
            active?: boolean;
        };
        RingOrder: {
            ringIds: string[];
        };
        RingUsage: {
            futureClassSessions: number;
            futureTrainingBookings: number;
            ringBlocks: number;
            templateClasses: number;
        };
        CatalogItemsRing: {
            items: components["schemas"]["Ring"][];
            totalItems: number;
        };
        Instructor: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            memberId: string;
            shortName: string;
            color: string;
            active: boolean;
            /** Format: int64 */
            version: number;
            usage?: components["schemas"]["InstructorUsage"];
            lastChange?: components["schemas"]["LastChange"];
        };
        InstructorCreate: {
            memberId: string;
            shortName: string;
            color: string;
        };
        InstructorPatch: {
            /** Format: int64 */
            version: number;
            shortName?: string;
            color?: string;
            active?: boolean;
        };
        InstructorUsage: {
            futureClassSessions: number;
            templateClasses: number;
        };
        CatalogItemsInstructor: {
            items: components["schemas"]["Instructor"][];
            totalItems: number;
        };
        Administrator: {
            /** Format: uuid */
            membershipId: string;
            /** Format: uuid */
            memberId: string;
            shortName: string;
            /** Format: date */
            since: string;
            active: boolean;
            /** Format: int64 */
            version: number;
            lastChange?: components["schemas"]["LastChange"];
        };
        AdministratorCreate: {
            memberId: string;
            shortName: string;
            /** Format: date */
            since: string;
        };
        AdministratorPatch: {
            /** Format: int64 */
            version: number;
            shortName?: string;
            /** Format: date */
            since?: string;
            active?: boolean;
        };
        CatalogItemsAdministrator: {
            items: components["schemas"]["Administrator"][];
            totalItems: number;
        };
        Money: {
            /** Format: int64 */
            amountMinor: number;
            currency: string;
        };
        EntryFee: {
            /** @enum {string} */
            mode: "STANDARD" | "AMOUNT" | "PERCENT" | "NONE";
            amount?: components["schemas"]["Money"];
            percent?: number;
        };
        PackSettings: {
            sessions: number;
            validityMonths: number;
        };
        SingleClassSettings: {
            /** @enum {string} */
            chargeMode: "CHARGE_ON_ATTENDANCE" | "PAY_TO_BOOK";
            /** @enum {string} */
            cancelPolicy: "REFUND" | "CREDIT" | "NONE";
        };
        PlanTexts: {
            description?: string;
            descriptionI18n?: {
                [key: string]: string;
            };
            offerLabel?: string;
            offerLabelI18n?: {
                [key: string]: string;
            };
            priceLabel?: string;
            priceLabelI18n?: {
                [key: string]: string;
            };
        };
        PlanTextsInput: {
            description?: {
                [key: string]: string;
            };
            offerLabel?: {
                [key: string]: string;
            };
            priceLabel?: {
                [key: string]: string;
            };
        };
        Price: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            planId: string;
            /** @enum {string} */
            concept: "MONTHLY_FEE" | "MAINTENANCE_FEE" | "PACK" | "SINGLE_CLASS";
            amount: components["schemas"]["Money"];
            taxPercent: number;
            /** Format: date */
            validFrom: string;
            /** Format: date */
            validTo?: string;
            locked: boolean;
            /** @enum {string} */
            status: "SCHEDULED" | "CURRENT" | "EXPIRED";
            /** Format: int64 */
            version: number;
            lastChange?: components["schemas"]["LastChange"];
        };
        PriceCreate: {
            planId: string;
            /** @enum {string} */
            concept: "MONTHLY_FEE" | "MAINTENANCE_FEE" | "PACK" | "SINGLE_CLASS";
            amount: components["schemas"]["Money"];
            taxPercent: number;
            /** Format: date */
            validFrom: string;
            /** Format: date */
            validTo?: string;
        };
        PriceCreated: {
            price: components["schemas"]["Price"];
            /** Format: uuid */
            closedPriceId?: string;
        };
        Plan: {
            /** Format: uuid */
            id: string;
            code: string;
            name: string;
            nameI18n?: {
                [key: string]: string;
            };
            /** @enum {string} */
            type: "MONTHLY" | "PACK" | "SINGLE_CLASS";
            dogsIncluded: number;
            entryFee: components["schemas"]["EntryFee"];
            pack?: components["schemas"]["PackSettings"];
            singleClass?: components["schemas"]["SingleClassSettings"];
            conditions?: string;
            conditionsI18n?: {
                [key: string]: string;
            };
            texts?: components["schemas"]["PlanTexts"];
            prices?: components["schemas"]["Price"][];
            currentPrices?: components["schemas"]["Price"][];
            order: number;
            showOnSignup: boolean;
            showOnWeb: boolean;
            active: boolean;
            /** Format: int64 */
            version: number;
            lastChange?: components["schemas"]["LastChange"];
        };
        PlanCreate: {
            code: string;
            name: {
                [key: string]: string;
            };
            /** @enum {string} */
            type: "MONTHLY" | "PACK" | "SINGLE_CLASS";
            dogsIncluded?: number;
            entryFee?: components["schemas"]["EntryFee"];
            pack?: components["schemas"]["PackSettings"];
            singleClass?: components["schemas"]["SingleClassSettings"];
            conditions?: {
                [key: string]: string;
            };
            texts?: components["schemas"]["PlanTextsInput"];
            order?: number;
            showOnSignup?: boolean;
            showOnWeb?: boolean;
            active?: boolean;
        };
        PlanPatch: {
            /** Format: int64 */
            version: number;
            code?: string;
            name?: {
                [key: string]: string;
            };
            /** @enum {string} */
            type?: "MONTHLY" | "PACK" | "SINGLE_CLASS";
            dogsIncluded?: number;
            entryFee?: components["schemas"]["EntryFee"];
            pack?: components["schemas"]["PackSettings"];
            singleClass?: components["schemas"]["SingleClassSettings"];
            conditions?: {
                [key: string]: string;
            };
            texts?: components["schemas"]["PlanTextsInput"];
            order?: number;
            showOnSignup?: boolean;
            showOnWeb?: boolean;
            active?: boolean;
        };
        CatalogItemsPlan: {
            items: components["schemas"]["Plan"][];
            totalItems: number;
        };
        FaqEntry: {
            /** Format: uuid */
            id: string;
            category: string;
            categoryI18n?: {
                [key: string]: string;
            };
            question: string;
            questionI18n?: {
                [key: string]: string;
            };
            answer: string;
            answerI18n?: {
                [key: string]: string;
            };
            order: number;
            active: boolean;
            /** Format: int64 */
            version: number;
            lastChange?: components["schemas"]["LastChange"];
        };
        FaqCreate: {
            category: {
                [key: string]: string;
            };
            question: {
                [key: string]: string;
            };
            answer: {
                [key: string]: string;
            };
            order?: number;
            active?: boolean;
        };
        FaqPatch: {
            /** Format: int64 */
            version: number;
            category?: {
                [key: string]: string;
            };
            question?: {
                [key: string]: string;
            };
            answer?: {
                [key: string]: string;
            };
            order?: number;
            active?: boolean;
        };
        FaqOrder: {
            faqEntryIds: string[];
        };
        CatalogItemsFaqEntry: {
            items: components["schemas"]["FaqEntry"][];
            totalItems: number;
        };
        FreeTraining: {
            allowed: boolean;
            /** @enum {string} */
            source: "LEVEL" | "MANUAL";
            override?: boolean | null;
        };
        DogDocumentFile: {
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            uploadedAt: string;
        };
        DogDocument: {
            /** Format: uuid */
            id: string;
            type: string;
            typeLabel: string;
            /** @enum {string} */
            state: "PENDING" | "RECEIVED";
            files: components["schemas"]["DogDocumentFile"][];
            /** Format: date-time */
            lastReminderAt?: string;
        };
        DogLicense: {
            organisation: string;
            number: string;
            grade?: string;
        };
        DogDetail: {
            /** Format: uuid */
            id: string;
            name: string;
            breed: string;
            chip: string;
            /** @enum {string} */
            sex: "MALE" | "FEMALE";
            /** Format: date */
            birthDate: string;
            /** Format: uri */
            photoUrl?: string;
            /** @enum {string} */
            status: "PENDING" | "ACTIVE" | "INACTIVE";
            /** Format: date-time */
            registeredAt: string;
            /** Format: date-time */
            deactivatedAt?: string;
            /** @enum {string} */
            deactivationReason?: "CLUB" | "MEMBER_LEFT" | "SIGNUP_REJECTED";
            owner: {
                /** Format: uuid */
                id: string;
                fullName: string;
                memberNumber: number;
                /** @enum {string} */
                status: "PENDING" | "ACTIVE" | "LEFT";
            };
            level?: components["schemas"]["LevelSummary"];
            /** Format: date-time */
            levelAssignedAt?: string;
            levelHistory: {
                /** Format: uuid */
                levelId: string;
                levelCode: string;
                /** Format: date-time */
                from: string;
                /** Format: date-time */
                to?: string;
                /** Format: uuid */
                byAccountId: string;
            }[];
            freeTraining: components["schemas"]["FreeTraining"];
            documents: components["schemas"]["DogDocument"][];
            licenses: components["schemas"]["DogLicense"][];
            pack?: string;
            instructorNote?: string;
            tasksSummary?: string;
            version: number;
        };
        DogPatchRequest: {
            name?: string;
            breed?: string;
            /** @enum {string} */
            sex?: "MALE" | "FEMALE";
            /** Format: date */
            birthDate?: string;
            chip?: string;
            licenses?: components["schemas"]["DogLicense"][];
            version: number;
        };
        DogLevelRequest: {
            /** Format: uuid */
            levelId: string;
        };
        DogLevelResponse: {
            level: components["schemas"]["LevelSummary"];
            /** Format: date-time */
            levelAssignedAt: string;
            warnings: {
                futureBookingsOutsideLevel: number;
            };
        };
        FreeTrainingRequest: {
            override: boolean | null;
        };
        DogTransferRequest: {
            /** Format: uuid */
            toMemberId: string;
            reason?: string;
        };
        ReasonRequest: {
            reason?: string;
        };
        PhotoRequest: {
            fileKey: string;
        };
        PhotoResponse: {
            /** Format: uri */
            photoUrl: string;
        };
        DogDocumentUploadRequest: {
            type: string;
            name: string;
            fileKey: string;
        };
        DogDocumentReminderRequest: {
            type: string;
        };
        AttachmentUploadRequest: {
            /** @enum {string} */
            purpose: "DOG_DOCUMENT" | "DOG_PHOTO";
            fileName: string;
            mimeType: string;
            sizeBytes: number;
        };
        AttachmentUploadResponse: {
            fileKey: string;
            /** Format: uri */
            uploadUrl: string;
        };
        PostalTown: {
            town: string;
            region: string;
        };
        InstructorNote: {
            text: string;
            /** Format: date-time */
            updatedAt: string;
        };
        InstructorNoteRequest: {
            text: string;
        };
        MemberDogTask: {
            /** Format: uuid */
            id: string;
            text: string;
            /** Format: date-time */
            createdAt: string;
            instructorName: string;
            attachmentsCount: number;
            /** Format: date-time */
            doneAt?: string;
        };
        TasksSummary: {
            open: number;
            completed: number;
            items: components["schemas"]["MemberDogTask"][];
        };
        PackSummary: {
            /** Format: uuid */
            id: string;
            remaining: number;
            total: number;
            /** Format: date */
            expiresOn?: string;
        };
        MeDog: {
            /** Format: uuid */
            id: string;
            name: string;
            breed: string;
            /** @enum {string} */
            sex: "MALE" | "FEMALE";
            ageYears: number;
            /** Format: uri */
            photoUrl?: string;
            level?: components["schemas"]["LevelSummary"];
            instructorNote?: components["schemas"]["InstructorNote"];
            tasks?: components["schemas"]["TasksSummary"];
            documents: components["schemas"]["DogDocument"][];
            freeTrainingAllowed: boolean;
            licenses: components["schemas"]["DogLicense"][];
            pack?: components["schemas"]["PackSummary"];
        };
        MeDogs: {
            dogs: components["schemas"]["MeDog"][];
            canAddDog: boolean;
        };
        ContactEmailInput: {
            /** Format: email */
            email: string;
        };
        MeProfile: {
            idDocumentMasked: string;
            firstName: string;
            lastName1: string;
            lastName2?: string;
            contactEmails: components["schemas"]["ContactEmail"][];
            phones: components["schemas"]["Phone"][];
            address: components["schemas"]["Address"];
            paymentMethod?: components["schemas"]["PaymentMethod"];
            consents?: components["schemas"]["MemberConsents"];
            /** Format: int64 */
            version: number;
        };
        MeProfilePatch: {
            contactEmails: components["schemas"]["ContactEmailInput"][];
            phones: components["schemas"]["Phone"][];
            address: components["schemas"]["Address"];
            /** Format: int64 */
            version: number;
        };
        LastChange: {
            action: string;
            actorName?: string;
            /** Format: date-time */
            at: string;
        };
        Parameter: {
            key: string;
            label: string;
            help: string;
            type: string;
            value: unknown;
            constraints: {
                [key: string]: unknown;
            };
            /** @enum {string} */
            editableBy: "CLUB" | "PLATFORM";
            module?: string;
            scopeRef?: string;
            isOverride: boolean;
            /** Format: int64 */
            version: number;
            lastChange?: components["schemas"]["LastChange"];
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
    };
    responses: {
        /** @description Standard API error */
        ApiError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
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
    wellKnownJwks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public JWK set */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JwkSet"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    discovery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OIDC discovery metadata */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenIdConfiguration"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    accountPassword: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountPasswordRequest"];
            };
        };
        responses: {
            /** @description Password synchronized */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    handoff: {
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
            /** @description Code and destination login URL */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HandoffResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description NO_MEMBERSHIP for the destination role */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    magicLink: {
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
            /** @description Request accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description RATE_LIMITED; Retry-After in seconds */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    branding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
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
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    manifest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/manifest+json": components["schemas"]["Manifest"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description App bootstrap (Me) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountPatchRequest"];
            };
        };
        responses: {
            /** @description Updated app bootstrap (Me) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            /** @description LOCALE_NOT_SUPPORTED */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    onboarding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pending onboarding and current privacy policy */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OnboardingState"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    completeOnboarding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingRequest"];
            };
        };
        responses: {
            /** @description Updated onboarding state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OnboardingState"];
                };
            };
            /** @description VALIDATION_ERROR if consent is not accepted; LOCALE_NOT_SUPPORTED */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description CONSENT_VERSION_OUTDATED */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    postponeOnboarding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Updated onboarding state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OnboardingState"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    password: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordRequest"];
            };
        };
        responses: {
            /** @description Password changed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description PASSWORD_TOO_SHORT, PASSWORD_MISMATCH, PASSWORD_COMPROMISED */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description INVALID_CREDENTIALS for current password */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description FORBIDDEN for impersonated accounts */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    myCensusProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The member's editable census profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeProfile"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    profile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProfileRequest"];
            };
        };
        responses: {
            /** @description New access token */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description PROFILE_NOT_AVAILABLE */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateMyCensusProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MeProfilePatch"];
            };
        };
        responses: {
            /** @description Updated member census profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeProfile"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    sessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sessions without refresh tokens or token hashes */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    deleteSession: {
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
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    impersonation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImpersonationRequest"];
            };
        };
        responses: {
            /** @description Impersonation JWT and UTC expiry */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImpersonationTokenResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description IMPERSONATION_DENIED */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description NOT_FOUND within the current club */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createAccount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlatformAccountRequest"];
            };
        };
        responses: {
            /** @description Public account including its ID for the Learn mapping */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountSummary"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description EMAIL_EXISTS */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    logout: {
        parameters: {
            query: {
                id_token_hint: string;
                post_logout_redirect_uri: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to registered post_logout_redirect_uri */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    authorize: {
        parameters: {
            query: {
                response_type: "code";
                client_id: string;
                redirect_uri: string;
                scope: string;
                state: string;
                code_challenge: string;
                code_challenge_method: "S256";
                login_hint?: string;
                ui_locales?: string;
                prompt?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to apps/id login or registered redirect_uri with code */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid request (VALIDATION_ERROR in the shared error envelope) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    jwks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public JWK set */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JwkSet"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    revoke: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeRequest"];
            };
        };
        responses: {
            /** @description Revoked (also when already revoked) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    token: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["TokenRequest"];
            };
        };
        responses: {
            /** @description TokenResponse; refresh_token and id_token depend on grant and scope */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenResponse"];
                };
            };
            /** @description Invalid grant: MAGIC_LINK_INVALID, HANDOFF_INVALID, REFRESH_EXPIRED, REFRESH_REUSED; malformed form: VALIDATION_ERROR */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description INVALID_CREDENTIALS */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description NO_MEMBERSHIP, MEMBERSHIP_SUSPENDED, ACCOUNT_BLOCKED */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description LOGIN_LOCKED or RATE_LIMITED; Retry-After in seconds */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    userinfo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Scoped OIDC user claims */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserInfo"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    receive: {
        parameters: {
            query?: never;
            header?: {
                "X-Twilio-Email-Event-Webhook-Timestamp"?: string;
                "X-Twilio-Email-Event-Webhook-Signature"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendGridEvent"][];
            };
        };
        responses: {
            /** @description Processed or safely ignored */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description WEBHOOK_SIGNATURE_INVALID */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    /** @description Seconds before retrying */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Implemented */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Client error */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Server error */
            "5XX": {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
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
    getMember: {
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
            /** @description Member record */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMember: {
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
                "application/json": components["schemas"]["MemberPatchRequest"];
            };
        };
        responses: {
            /** @description Updated member */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    getMemberOverview: {
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
            /** @description D10 member overview */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberOverview"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMemberPaymentMethod: {
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
                "application/json": components["schemas"]["PaymentMethodRequest"];
            };
        };
        responses: {
            /** @description Updated payment method */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethod"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    blockMemberBookings: {
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
                "application/json": components["schemas"]["BookingBlockRequest"];
            };
        };
        responses: {
            /** @description Booking block activated */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingBlock"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    unblockMemberBookings: {
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
            /** @description Booking block removed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    resendMemberAccess: {
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
            /** @description Access link sent */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessResendResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMemberRoles: {
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
                "application/json": components["schemas"]["RolesRequest"];
            };
        };
        responses: {
            /** @description Updated membership roles */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RolesResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMemberNotificationPreferences: {
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
                "application/json": components["schemas"]["NotificationPreferencesPatch"];
            };
        };
        responses: {
            /** @description Updated notification preferences */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationPreferences"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    getDog: {
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
            /** @description Dog record aggregate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateDog: {
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
                "application/json": components["schemas"]["DogPatchRequest"];
            };
        };
        responses: {
            /** @description Updated dog record */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateDogLevel: {
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
                "application/json": components["schemas"]["DogLevelRequest"];
            };
        };
        responses: {
            /** @description Updated dog level and warnings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogLevelResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateDogFreeTraining: {
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
                "application/json": components["schemas"]["FreeTrainingRequest"];
            };
        };
        responses: {
            /** @description Updated free-training rule */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FreeTraining"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    transferDog: {
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
                "application/json": components["schemas"]["DogTransferRequest"];
            };
        };
        responses: {
            /** @description Transferred dog */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deactivateDog: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ReasonRequest"];
            };
        };
        responses: {
            /** @description Deactivated dog */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    reactivateDog: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ReasonRequest"];
            };
        };
        responses: {
            /** @description Reactivated dog */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDetail"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateDogPhoto: {
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
                "application/json": components["schemas"]["PhotoRequest"];
            };
        };
        responses: {
            /** @description Updated dog photo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhotoResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listDogDocuments: {
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
            /** @description Dog documents */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDocument"][];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    uploadDogDocument: {
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
                "application/json": components["schemas"]["DogDocumentUploadRequest"];
            };
        };
        responses: {
            /** @description Uploaded dog document */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDocument"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    removeDogDocumentFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["ResourceId"];
                docId: string;
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Document file removed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    remindDogDocument: {
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
                "application/json": components["schemas"]["DogDocumentReminderRequest"];
            };
        };
        responses: {
            /** @description Document reminder accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    createAttachmentUploadUrl: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachmentUploadRequest"];
            };
        };
        responses: {
            /** @description Signed upload URL */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttachmentUploadResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listLevels: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ordered level catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsLevel"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createLevel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LevelCreate"];
            };
        };
        responses: {
            /** @description Created level */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Level"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    orderLevels: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LevelOrder"];
            };
        };
        responses: {
            /** @description Ordered levels */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsLevel"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteLevel: {
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
            /** @description Deleted level */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateLevel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LevelPatch"];
            };
        };
        responses: {
            /** @description Updated level */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Level"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listRings: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ordered ring catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsRing"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createRing: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RingCreate"];
            };
        };
        responses: {
            /** @description Created ring */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ring"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    orderRings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RingOrder"];
            };
        };
        responses: {
            /** @description Ordered rings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsRing"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteRing: {
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
            /** @description Deleted ring */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateRing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RingPatch"];
            };
        };
        responses: {
            /** @description Updated ring */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ring"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listInstructors: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Instructor catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsInstructor"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createInstructor: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InstructorCreate"];
            };
        };
        responses: {
            /** @description Created instructor */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Instructor"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteInstructor: {
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
            /** @description Deleted instructor */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateInstructor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InstructorPatch"];
            };
        };
        responses: {
            /** @description Updated instructor */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Instructor"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listAdministrators: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Administrator catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsAdministrator"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createAdministrator: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdministratorCreate"];
            };
        };
        responses: {
            /** @description Created administrator */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Administrator"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteAdministrator: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Deleted administrator */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateAdministrator: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdministratorPatch"];
            };
        };
        responses: {
            /** @description Updated administrator */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Administrator"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listPlans: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Plan catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsPlan"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createPlan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlanCreate"];
            };
        };
        responses: {
            /** @description Created plan */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updatePlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlanPatch"];
            };
        };
        responses: {
            /** @description Updated plan */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createPrice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceCreate"];
            };
        };
        responses: {
            /** @description Created price */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceCreated"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    listFaqs: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description FAQ catalogue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsFaqEntry"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    createFaq: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FaqCreate"];
            };
        };
        responses: {
            /** @description Created FAQ entry */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FaqEntry"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    faqCategoryValues: {
        parameters: {
            query: {
                field: "category";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description FAQ category suggestions */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string[];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    orderFaqs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FaqOrder"];
            };
        };
        responses: {
            /** @description Ordered FAQ entries */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItemsFaqEntry"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    deleteFaq: {
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
            /** @description Deleted FAQ entry */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateFaq: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FaqPatch"];
            };
        };
        responses: {
            /** @description Updated FAQ entry */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FaqEntry"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    postalCodeTowns: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Towns for the postal code */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PostalTown"][];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    myDogs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The member's active dogs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeDogs"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    uploadMyDogDocument: {
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
                "application/json": components["schemas"]["DogDocumentUploadRequest"];
            };
        };
        responses: {
            /** @description Uploaded dog document */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DogDocument"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateInstructorNote: {
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
                "application/json": components["schemas"]["InstructorNoteRequest"];
            };
        };
        responses: {
            /** @description Saved instructor note */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstructorNote"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    updateMyDogPhoto: {
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
                "application/json": components["schemas"]["PhotoRequest"];
            };
        };
        responses: {
            /** @description Updated dog photo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhotoResponse"];
                };
            };
            default: components["responses"]["ApiError"];
        };
    };
    parameter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Resolved parameter */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Parameter"];
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
}

