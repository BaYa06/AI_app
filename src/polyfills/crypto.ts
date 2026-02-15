/**
 * Minimal WebCrypto polyfill for React Native.
 * Only implements crypto.subtle.digest('SHA-256', ...) needed by Supabase PKCE.
 * Also provides btoa/atob which Hermes doesn't have.
 */
import { sha256 } from 'js-sha256';
import { encode, decode } from 'base-64';

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = encode;
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = decode;
}

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}

if (!globalThis.crypto.subtle) {
  (globalThis.crypto as any).subtle = {
    async digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
      const algo = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (algo !== 'SHA-256') {
        throw new Error(`crypto.subtle.digest: unsupported algorithm ${algo}`);
      }
      const hash = sha256.arrayBuffer(data);
      return hash;
    },
  };
}
