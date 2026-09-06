import { webcrypto } from "node:crypto";

import { indexedDB } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  createRefreshTokenStore,
  refreshTokenDatabase,
  type RefreshTokenStore,
} from "./crypto-store";

const cryptoApi = webcrypto as unknown as Crypto;

function readStoredValue(databaseName: string, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(databaseName);
    openRequest.onerror = () => {
      reject(openRequest.error ?? new Error("Unable to open the test database"));
    };
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onerror = () => {
        reject(request.error ?? new Error("Unable to read the test database"));
      };
      request.onsuccess = () => {
        database.close();
        resolve(request.result);
      };
    };
  });
}

function encryptedStore(databaseName: string): RefreshTokenStore {
  return createRefreshTokenStore({ crypto: cryptoApi, databaseName, indexedDB });
}

describe("T-01-21 encrypted refresh-token storage", () => {
  it("stores ciphertext without token plaintext and reuses a non-extractable device key", async () => {
    const databaseName = `auth-storage-${cryptoApi.randomUUID()}`;
    const refreshToken = "opaque-refresh-token-for-duna";
    const firstStore = encryptedStore(databaseName);

    await firstStore.set(refreshToken);

    const tokenRecord = (await readStoredValue(
      databaseName,
      refreshTokenDatabase.tokenStore,
      refreshTokenDatabase.tokenId,
    )) as { ciphertext: number[]; iv: number[] };
    const keyRecord = (await readStoredValue(
      databaseName,
      refreshTokenDatabase.keyStore,
      refreshTokenDatabase.keyId,
    )) as { key: CryptoKey };

    expect(new TextDecoder().decode(new Uint8Array(tokenRecord.ciphertext))).not.toContain(
      refreshToken,
    );
    expect(JSON.stringify(tokenRecord)).not.toContain(refreshToken);
    expect(tokenRecord.iv).toHaveLength(12);
    expect(keyRecord.key.extractable).toBe(false);
    await expect(cryptoApi.subtle.exportKey("raw", keyRecord.key)).rejects.toMatchObject({
      name: "InvalidAccessException",
    });

    const reopenedStore = encryptedStore(databaseName);
    await expect(reopenedStore.get()).resolves.toBe(refreshToken);
  });

  it("warns and keeps the session in memory when browser storage is unavailable", async () => {
    const warn = vi.fn();
    const store = createRefreshTokenStore({
      crypto: cryptoApi,
      indexedDB: undefined,
      warn,
    });

    await store.set("memory-refresh-token");

    await expect(store.get()).resolves.toBe("memory-refresh-token");
    expect(warn).toHaveBeenCalledOnce();
  });
});
