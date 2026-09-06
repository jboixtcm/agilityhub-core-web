const DATABASE_NAME = "agilityhub-auth";
const DATABASE_VERSION = 1;
const KEY_STORE = "device-keys";
const TOKEN_STORE = "refresh-tokens";
const DEVICE_KEY_ID = "refresh-token-key";
const REFRESH_TOKEN_ID = "current";
const WARNING =
  "[auth] WebCrypto or IndexedDB is unavailable; the session will only last in memory.";

interface DeviceKeyRecord {
  id: typeof DEVICE_KEY_ID;
  key: CryptoKey;
}

interface EncryptedTokenRecord {
  ciphertext: number[];
  id: typeof REFRESH_TOKEN_ID;
  iv: number[];
}

export interface RefreshTokenStore {
  clear(): Promise<void>;
  get(): Promise<null | string>;
  set(token: string): Promise<void>;
}

export interface RefreshTokenStoreOptions {
  crypto?: Crypto | undefined;
  databaseName?: string | undefined;
  indexedDB?: IDBFactory | undefined;
  warn?: ((message: string, error?: unknown) => void) | undefined;
}

export class MemoryRefreshTokenStore implements RefreshTokenStore {
  private token: null | string;

  constructor(token: null | string = null) {
    this.token = token;
  }

  clear(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }

  get(): Promise<null | string> {
    return Promise.resolve(this.token);
  }

  set(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }
}

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
    };
  });
}

class IndexedDbRefreshTokenStore implements RefreshTokenStore {
  private readonly cryptoApi: Crypto;
  private readonly database: Promise<IDBDatabase>;
  private key: Promise<CryptoKey> | undefined;

  constructor(factory: IDBFactory, cryptoApi: Crypto, databaseName: string) {
    this.cryptoApi = cryptoApi;
    this.database = new Promise((resolve, reject) => {
      const request = factory.open(databaseName, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(KEY_STORE)) {
          database.createObjectStore(KEY_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(TOKEN_STORE)) {
          database.createObjectStore(TOKEN_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Unable to open the authentication database"));
      };
      request.onblocked = () => {
        reject(new Error("The authentication database upgrade was blocked"));
      };
    });
  }

  async clear(): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(TOKEN_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(TOKEN_STORE).delete(REFRESH_TOKEN_ID);
    await done;
  }

  async get(): Promise<null | string> {
    const database = await this.database;
    const transaction = database.transaction(TOKEN_STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(TOKEN_STORE).get(REFRESH_TOKEN_ID) as IDBRequest<
      EncryptedTokenRecord | undefined
    >;
    const record = await requestResult(request);
    await done;
    if (record === undefined) {
      return null;
    }

    const key = await this.deviceKey();
    const plaintext = await this.cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  }

  async set(token: string): Promise<void> {
    const key = await this.deviceKey();
    const iv = this.cryptoApi.getRandomValues(new Uint8Array(12));
    const ciphertext = await this.cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(token),
    );
    const record: EncryptedTokenRecord = {
      ciphertext: [...new Uint8Array(ciphertext)],
      id: REFRESH_TOKEN_ID,
      iv: [...iv],
    };
    const database = await this.database;
    const transaction = database.transaction(TOKEN_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(TOKEN_STORE).put(record);
    await done;
  }

  private async deviceKey(): Promise<CryptoKey> {
    this.key ??= this.loadOrCreateDeviceKey();
    return this.key;
  }

  private async loadOrCreateDeviceKey(): Promise<CryptoKey> {
    const database = await this.database;
    const readTransaction = database.transaction(KEY_STORE, "readonly");
    const readDone = transactionDone(readTransaction);
    const request = readTransaction.objectStore(KEY_STORE).get(DEVICE_KEY_ID) as IDBRequest<
      DeviceKeyRecord | undefined
    >;
    const stored = await requestResult(request);
    await readDone;
    if (stored !== undefined) {
      return stored.key;
    }

    // Decision A1: the per-device AES-GCM key is non-extractable and persisted by
    // IndexedDB structured clone; only encrypted refresh-token bytes are stored.
    const key = await this.cryptoApi.subtle.generateKey({ length: 256, name: "AES-GCM" }, false, [
      "decrypt",
      "encrypt",
    ]);
    const writeTransaction = database.transaction(KEY_STORE, "readwrite");
    const writeDone = transactionDone(writeTransaction);
    const record: DeviceKeyRecord = { id: DEVICE_KEY_ID, key };
    writeTransaction.objectStore(KEY_STORE).put(record);
    await writeDone;
    return key;
  }
}

class ResilientRefreshTokenStore implements RefreshTokenStore {
  private active: RefreshTokenStore;
  private readonly memory = new MemoryRefreshTokenStore();
  private readonly warn: (message: string, error?: unknown) => void;
  private warned = false;

  constructor(encrypted: RefreshTokenStore, warn: (message: string, error?: unknown) => void) {
    this.active = encrypted;
    this.warn = warn;
  }

  async clear(): Promise<void> {
    await this.run((store) => store.clear());
  }

  async get(): Promise<null | string> {
    return this.run((store) => store.get());
  }

  async set(token: string): Promise<void> {
    await this.run((store) => store.set(token));
  }

  private async run<Result>(
    operation: (store: RefreshTokenStore) => Promise<Result>,
  ): Promise<Result> {
    try {
      return await operation(this.active);
    } catch (error) {
      if (this.active === this.memory) {
        throw error;
      }
      this.active = this.memory;
      if (!this.warned) {
        this.warned = true;
        this.warn(WARNING, error);
      }
      return operation(this.memory);
    }
  }
}

export function createRefreshTokenStore(options: RefreshTokenStoreOptions = {}): RefreshTokenStore {
  const runtime = globalThis as unknown as {
    crypto?: Crypto;
    indexedDB?: IDBFactory;
  };
  const cryptoApi = options.crypto ?? runtime.crypto;
  const databaseFactory = options.indexedDB ?? runtime.indexedDB;
  const warn = options.warn ?? console.warn;

  if (cryptoApi === undefined || databaseFactory === undefined) {
    warn(WARNING);
    return new MemoryRefreshTokenStore();
  }

  return new ResilientRefreshTokenStore(
    new IndexedDbRefreshTokenStore(
      databaseFactory,
      cryptoApi,
      options.databaseName ?? DATABASE_NAME,
    ),
    warn,
  );
}

export const refreshTokenDatabase = {
  keyId: DEVICE_KEY_ID,
  keyStore: KEY_STORE,
  tokenId: REFRESH_TOKEN_ID,
  tokenStore: TOKEN_STORE,
} as const;
