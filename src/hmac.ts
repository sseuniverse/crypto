/*
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */

import { Buffer } from "./buffer";
import { Hash, createHash as sseCreateHash } from "./hash";
import { Encoding, BinaryLike, BufferEncoding } from "./types";

export type BinaryToTextEncoding = "base64" | "base64url" | "hex" | "binary";
const zeroBuffer = Buffer.alloc(128).fill(0);

export class Hmac {
  private _opad: Buffer;
  private _ipad: Buffer;
  private _hash: Hash;
  private _createHash: () => Hash;
  private _key: Buffer;

  constructor(createHash: () => Hash, blocksize: number, key: string | Buffer) {
    if (blocksize !== 128 && blocksize !== 64) {
      throw new Error(
        "blocksize must be either 64 or 128, but was: " + blocksize
      );
    }

    this._createHash = createHash;
    this._key = Buffer.isBuffer(key) ? key : Buffer.from(key);

    if (this._key.length > blocksize) {
      this._key = Buffer.from(this._createHash().update(this._key).digest());
    } else if (this._key.length < blocksize) {
      this._key = Buffer.concat([this._key, zeroBuffer], blocksize);
    }

    this._ipad = Buffer.alloc(blocksize);
    this._opad = Buffer.alloc(blocksize);

    for (let i = 0; i < blocksize; i++) {
      this._ipad[i] = this._key[i] ^ 0x36;
      this._opad[i] = this._key[i] ^ 0x5c;
    }

    this._hash = this._createHash().update(this._ipad);
  }

  // Overloaded method signatures for update
  public update(data: Buffer | string): this;
  public update(data: string, inputEncoding: BufferEncoding): this;

  // Implementation of the update method
  public update(data: string | BinaryLike, inputEncoding?: Encoding): this {
    if (typeof data === "string" && inputEncoding) {
      this._hash.update(data, inputEncoding);
    } else {
      this._hash.update(data);
    }
    return this;
  }

  // Overloaded method signatures for digest
  public digest(): Buffer;
  public digest(encoding: BinaryToTextEncoding): string;

  // Implementation of the digest method
  public digest(encoding?: BinaryToTextEncoding): Buffer | string {
    const h = this._hash.digest();
    const finalHash = this._createHash()
      .update(this._opad)
      .update(h)
      .digest(encoding);

    // Return based on whether encoding is provided
    return encoding ? finalHash : Buffer.from(finalHash);
  }
}

export function createHmac(algorithm: string, key: string | Buffer): Hmac {
  const createHash = () => sseCreateHash(algorithm);
  const blocksize = algorithm === "sha512" || algorithm === "sha384" ? 128 : 64;
  return new Hmac(createHash, blocksize, key);
}
