/**
 * Mock-only refresh-token state for MSW, which cannot issue an HttpOnly cookie.
 * Production clients must never receive this store.
 */
export interface MockRefreshTokenStore {
  clear(): void;
  get(): null | string;
  set(token: string): void;
}

export class MemoryRefreshTokenStore implements MockRefreshTokenStore {
  private token: null | string;

  constructor(token: null | string = null) {
    this.token = token;
  }

  clear(): void {
    this.token = null;
  }

  get(): null | string {
    return this.token;
  }

  set(token: string): void {
    this.token = token;
  }
}
