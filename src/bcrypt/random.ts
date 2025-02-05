/*
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */

/**
 * @private
 *
 * Generates cryptographically secure random bytes.
 *
 * @param length Bytes length
 * @returns Random bytes
 * @throws {Error} If no random implementation is available
 */
const browserRandom = (length: number): number[] => {
  try {
    const crypto =
      typeof window !== "undefined" ? window.crypto : globalThis.crypto;

    const array = new Uint32Array(length);

    crypto.getRandomValues(array);

    return Array.from(array);
  } catch {
    throw Error("WebCryptoAPI is not available");
  }
};

/**
 * @private
 *
 * Generates cryptographically secure random bytes.
 *
 * @param length Bytes length
 * @returns Random bytes
 * @throws {Error} If no random implementation is available
 */
import { randomBytes } from "node:crypto";
export const nodeRandom = (length: number): Buffer => {
  return randomBytes(length);
};

export const random =
  typeof window !== "undefined" || typeof globalThis !== "undefined"
    ? browserRandom
    : nodeRandom;
