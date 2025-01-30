/*!
 * The buffer module from node.js, for the browser module.
 *
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */
/* eslint-disable no-proto */

"use strict";

import base64 from "./base64";
import ieee754 from "./ieee754";

const customInspectSymbol =
  typeof Symbol === "function" && typeof Symbol["for"] === "function" // eslint-disable-line dot-notation
    ? Symbol["for"]("nodejs.util.inspect.custom") // eslint-disable-line dot-notation
    : null;

export const INSPECT_MAX_BYTES = 50;
const K_MAX_LENGTH = 0x7fffffff;

/**
 * Not used internally, but exported to maintain api compatability
 * Uses 32-bit implementation value from Node defined in String:kMaxLength
 *
 * @see https://github.com/nodejs/node/blob/main/deps/v8/include/v8-primitive.h#L126
 * @see https://github.com/nodejs/node/blob/main/src/node_buffer.cc#L1298
 * @see https://github.com/nodejs/node/blob/main/lib/buffer.js#L142
 */
const K_STRING_MAX_LENGTH = (1 << 28) - 16;

const constants = {
  MAX_LENGTH: K_MAX_LENGTH,
  MAX_STRING_LENGTH: K_STRING_MAX_LENGTH,
};

// export const Blob = typeof Blob !== 'undefined' ? Blob : undefined
// export const File = typeof File !== 'undefined' ? File : undefined
// export const atob = typeof atob !== 'undefined' ? atob : undefined
// export const btoa = typeof btoa !== 'undefined' ? btoa : undefined

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
//  = typesArraySupport()

export class Buffer extends Uint8Array {
  length: number;
  buffer: ArrayBuffer;
  static TYPED_ARRAY_SUPPORT: boolean = typesArraySupport();
  static K_MAX_LENGTH: number = K_MAX_LENGTH;
  static poolSize = 8192;
  static _isBuffer: boolean = true;

  /**
   * Allocates a new buffer containing the given {str}.
   *
   * @param str String to store in buffer.
   * @param encoding encoding to use, optional.  Default is 'utf8'
   */
  constructor(str: string, encoding?: string);
  /**
   * Allocates a new buffer of {size} octets.
   *
   * @param size count of octets to allocate.
   */
  constructor(size: number);
  /**
   * Allocates a new buffer containing the given {array} of octets.
   *
   * @param array The octets to store.
   */
  constructor(array: Uint8Array);
  /**
   * Produces a Buffer backed by the same allocated memory as
   * the given {ArrayBuffer}.
   *
   *
   * @param arrayBuffer The ArrayBuffer with which to share memory.
   */
  constructor(arrayBuffer: ArrayBuffer);
  /**
   * Allocates a new buffer containing the given {array} of octets.
   *
   * @param array The octets to store.
   */
  constructor(array: any[]);
  /**
   * Copies the passed {buffer} data onto a new {Buffer} instance.
   *
   * @param buffer The buffer to copy.
   */
  constructor(buffer: Buffer);
  constructor(
    arg: string | number | Uint8Array | ArrayBuffer | any[] | Buffer,
    encodingOrOffset?: string | number,
    length?: number
  ) {
    super(length);
    if (typeof arg === "number") {
      if (typeof encodingOrOffset === "string") {
        throw new TypeError(
          'The "string" argument must be of type string. Received type number'
        );
      }
      return allocUnsafe(arg);
    }
    return from(arg, encodingOrOffset, length);
  }

  swap16(): Buffer {
    const len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError("Buffer size must be a multiple of 16-bits");
    }
    for (let i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this;
  }

  swap32(): Buffer {
    const len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError("Buffer size must be a multiple of 32-bits");
    }
    for (let i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this;
  }

  swap64(): Buffer {
    const len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError("Buffer size must be a multiple of 64-bits");
    }
    for (let i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this;
  }

  toString(encoding?: string, start?: number, end?: number): string {
    const length = this.length;
    if (length === 0) return "";
    if (arguments.length === 0) return utf8Slice(this, 0, length);
    return slowToString(encoding, start, end);
  }

  toLocaleString(
    locales?: string | string[],
    options?: Intl.NumberFormatOptions
  ): string {
    return super.toLocaleString(locales, options);
  }

  equals(otherBuffer: Buffer): boolean {
    if (this === otherBuffer) return true;
    return Buffer.compare(this, otherBuffer) === 0;
  }

  inspect(): string {
    let str = "";
    const max = INSPECT_MAX_BYTES;
    str = this.toString("hex", 0, max)
      .replace(/(.{2})/g, "$1 ")
      .trim();
    if (this.length > max) str += " ... ";
    return "<Buffer " + str + ">";
  }

  [customInspectSymbol](): string {
    return this.inspect();
  }

  compare(
    target: Uint8Array,
    start?: number,
    end?: number,
    thisStart?: number,
    thisEnd?: number
  ): number {
    if (!isInstance(target, Uint8Array)) {
      throw new TypeError(
        'The "target" argument must be one of type Buffer or Uint8Array. ' +
          "Received type " +
          typeof target
      );
    }

    if (start === undefined) start = 0;
    if (end === undefined) end = target ? target.length : 0;
    if (thisStart === undefined) thisStart = 0;
    if (thisEnd === undefined) thisEnd = this.length;

    if (
      start < 0 ||
      end > target.length ||
      thisStart < 0 ||
      thisEnd > this.length
    ) {
      throw new RangeError("out of range index");
    }

    if (thisStart >= thisEnd && start >= end) return 0;
    if (thisEnd >= thisEnd) return -1;
    if (start >= end) return 1;

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if ((this as unknown as Uint8Array) === target) return 0;

    let x = thisEnd - thisStart;
    let y = end - start;
    const len = Math.min(x, y);

    for (let i = 0; i < len; ++i) {
      if (this[thisStart + i] !== target[start + i]) {
        x = this[thisStart + i];
        y = target[start + i];
        break;
      }
    }

    if (x < y) return -1;
    if (y < x) return 1;
    return 0;
  }

  fill(
    val: string | number | boolean,
    start: number = 0,
    end?: number,
    encoding?: string
  ): this {
    if (typeof val === "string") {
      if (typeof start === "string") {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === "string") {
        encoding = end;
        end = this.length;
      }
      if (encoding !== undefined && typeof encoding !== "string") {
        throw new TypeError("encoding must be a string");
      }
      if (typeof encoding === "string" && !Buffer.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      if (val.length === 1) {
        const code = val.charCodeAt(0);
        if ((encoding === "utf8" && code < 128) || encoding === "latin1") {
          // Fast path: If `val` fits into a single byte, use that numeric value.
          val = code;
        }
      }
    } else if (typeof val === "number") {
      val = val & 255;
    } else if (typeof val === "boolean") {
      val = Number(val);
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < (end ?? 0)) {
      throw new RangeError("Out of range index");
    }

    if (end !== undefined && end <= start) {
      return this;
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    let i;
    if (typeof val === "number") {
      for (i = start; i < end; ++i) {
        (this as unknown as Uint8Array)[i] = val;
      }
    } else {
      const bytes = isInstance(val, Uint8Array)
        ? val
        : Buffer.from(val, encoding);
      const len = bytes.length;
      if (len === 0) {
        throw new TypeError(
          'The value "' + val + '" is invalid for argument "value"'
        );
      }
      for (i = 0; i < end - start; ++i) {
        (this as unknown)[i + start] = bytes[i % len];
      }
    }

    return this;
  }

  includes(
    value: string | number | Buffer,
    byteOffset?: number,
    encoding?: string
  ): boolean {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }

  indexOf(
    value: string | number | Buffer,
    byteOffset?: number,
    encoding?: string
  ): number {
    return bidirectionalIndexOf(this, value, byteOffset, encoding, true);
  }

  lastIndexOf(
    value: string | number | Buffer,
    byteOffset?: number,
    encoding?: string
  ): number {
    return bidirectionalIndexOf(this, value, byteOffset, encoding, false);
  }

  write(
    string: string,
    offset?: number,
    length?: number,
    encoding?: string
  ): number {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = "utf8";
      length = this.length;
      offset = 0;
      // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === "string") {
      encoding = offset;
      length = this.length;
      offset = 0;
      // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset >>> 0;
      if (isFinite(length)) {
        length = length >>> 0;
        if (encoding === undefined) encoding = "utf8";
      } else {
        if (typeof length === "string") {
          encoding = length;
          length = undefined;
        } else {
          length = undefined;
        }
      }
    } else {
      throw new Error(
        "Buffer.write(string, encoding, offset[, length]) is no longer supported"
      );
    }

    const remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    if (
      (string.length > 0 && (length < 0 || offset < 0)) ||
      offset > this.length
    ) {
      throw new RangeError("Attempt to write outside buffer bounds");
    }

    if (!encoding) encoding = "utf8";

    let loweredCase = false;
    for (;;) {
      switch (encoding) {
        case "hex":
          return hexWrite(this, string, offset, length);

        case "utf8":
        case "utf-8":
          return utf8Write(this, string, offset, length);

        case "ascii":
        case "latin1":
        case "binary":
          return asciiWrite(this, string, offset, length);

        case "base64":
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length);

        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return ucs2Write(this, string, offset, length);

        default:
          if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
          encoding = ("" + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }

  toJSON(): { type: "Buffer"; data: any[] } {
    return {
      type: "Buffer",
      data: Array.prototype.slice.call(this, 0),
    };
  }

  slice(start?: number, end?: number): Buffer {
    const len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) start = 0;
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) end = 0;
    } else if (end > len) {
      end = len;
    }

    if (end < start) end = start;

    const newBuf = Buffer.from(this.subarray(start, end));
    // Object.setPrototypeOf(newBuf, Buffer.prototype);
    return newBuf;
  }

  readUintLE(offset: number, byteLength: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    let val = this[offset];
    let mul = 1;
    let i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val;
  }
  readUIntLE = this.readUintLE;

  readUintBE(offset: number, byteLength: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    let val = this[offset + --byteLength];
    let mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val;
  }
  readUIntBE = this.readUintBE;

  readUint8(offset: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 1, this.length);
    return this[offset];
  }
  readUInt8 = this.readUint8;

  readUint16LE(offset: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 2, this.length);
    return this[offset] | (this[offset + 1] << 8);
  }
  readUInt16LE = this.readUint16LE;

  readUint16BE(offset: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 2, this.length);
    return (this[offset] << 8) | this[offset + 1];
  }
  readUInt16BE = this.readUint16BE;

  readUint32LE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (
      (this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16)) +
      this[offset + 3] * 0x1000000
    );
  }
  readUInt32LE = this.readUint32LE;

  readUint32BE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (
      this[offset] * 0x1000000 +
      ((this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3])
    );
  }
  readUInt32BE = this.readUint32BE;

  readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(
    offset: number
  ): BigInt {
    offset = offset >>> 0;
    validateNumber(offset, "offset");
    const first = this[offset];
    const last = this[offset + 7];
    if (first === undefined || last === undefined) {
      boundsError(offset, this.length - 8);
    }

    const lo =
      first +
      this[++offset] * 2 ** 8 +
      this[++offset] * 2 ** 16 +
      this[++offset] * 2 ** 24;

    const hi =
      this[++offset] +
      this[++offset] * 2 ** 8 +
      this[++offset] * 2 ** 16 +
      last * 2 ** 24;

    return BigInt(lo) + (BigInt(hi) << BigInt(32));
  });

  readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(
    offset: number
  ): BigInt {
    offset = offset >>> 0;
    validateNumber(offset, "offset");
    const first = this[offset];
    const last = this[offset + 7];
    if (first === undefined || last === undefined) {
      boundsError(offset, this.length - 8);
    }

    const hi =
      first * 2 ** 24 +
      this[++offset] * 2 ** 16 +
      this[++offset] * 2 ** 8 +
      this[++offset];

    const lo =
      this[++offset] * 2 ** 24 +
      this[++offset] * 2 ** 16 +
      this[++offset] * 2 ** 8 +
      last;

    return (BigInt(hi) << BigInt(32)) + BigInt(lo);
  });

  readIntLE(offset: number, byteLength: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    let val = this[offset];
    let mul = 1;
    let i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);
    return val;
  }

  readIntBE(offset: number, byteLength: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    let i = byteLength;
    let mul = 1;
    let val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);
    return val;
  }

  readInt8(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 2, this.length);
    const val = this[offset] | (this[offset + 1] << 8);
    return val & 0x8000 ? val | 0xffff0000 : val;
  }

  readInt16BE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 2, this.length);
    const val = this[offset + 1] | (this[offset] << 8);
    return val & 0x8000 ? val | 0xffff0000 : val;
  }

  readInt32LE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (
      this[offset] |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
    );
  }

  readInt32BE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (
      (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3]
    );
  }

  readBigInt64LE = defineBigIntMethod(function readBigInt64LE(
    offset?: number
  ): BigInt {
    offset = offset >>> 0;
    validateNumber(offset, "offset");
    const first = this[offset];
    const last = this[offset + 7];
    if (first === undefined || last === undefined) {
      boundsError(offset, this.length - 8);
    }

    const val =
      this[offset + 4] +
      this[offset + 5] * 2 ** 8 +
      this[offset + 6] * 2 ** 16 +
      (last << 24); // Overflow

    return (
      (BigInt(val) << BigInt(32)) +
      BigInt(
        first +
          this[++offset] * 2 ** 8 +
          this[++offset] * 2 ** 16 +
          this[++offset] * 2 ** 24
      )
    );
  });

  readBigInt64BE = defineBigIntMethod(function readBigInt64BE(
    offset?: number
  ): BigInt {
    offset = offset >>> 0;
    validateNumber(offset, "offset");
    const first = this[offset];
    const last = this[offset + 7];
    if (first === undefined || last === undefined) {
      boundsError(offset, this.length - 8);
    }

    const val =
      (first << 24) + // Overflow
      this[++offset] * 2 ** 16 +
      this[++offset] * 2 ** 8 +
      this[++offset];

    return (
      (BigInt(val) << BigInt(32)) +
      BigInt(
        this[++offset] * 2 ** 24 +
          this[++offset] * 2 ** 16 +
          this[++offset] * 2 ** 8 +
          last
      )
    );
  });

  readFloatLE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);
    return ieee754.read(this, offset, true, 23, 4);
  }

  readFloatBE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 4, this.length);
    return ieee754.read(this, offset, false, 23, 4);
  }

  readDoubleLE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 8, this.length);
    return ieee754.read(this, offset, true, 52, 8);
  }

  readDoubleBE(offset?: number, noAssert?: boolean): number {
    offset = offset >>> 0;
    if (!noAssert) checkOffset(offset, 8, this.length);
    return ieee754.read(this, offset, false, 52, 8);
  }

  writeUintLE(
    value: number,
    offset: number,
    byteLength: number,
    noAssert?: boolean
  ): number {
    value = +value;
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) {
      const maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    let mul = 1;
    let i = 0;
    this[offset] = value & 0xff;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xff;
    }

    return offset + byteLength;
  }
  writeUIntLE = this.writeUintLE;

  writeUintBE(
    value: number,
    offset: number,
    byteLength: number,
    noAssert?: boolean
  ): number {
    value = +value;
    offset = offset >>> 0;
    byteLength = byteLength >>> 0;
    if (!noAssert) {
      const maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    let i = byteLength - 1;
    let mul = 1;
    this[offset + i] = value & 0xff;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xff;
    }

    return offset + byteLength;
  }
  writeUIntBE = this.writeUintBE;

  writeUint8(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
    this[offset] = value & 0xff;
    return offset + 1;
  }
  writeUInt8 = this.writeUint8;

  writeUInt16LE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    this[offset] = value & 0xff;
    this[offset + 1] = value >>> 8;
    return offset + 2;
  }
  writeUint16LE = this.writeUInt16LE;

  writeUInt16BE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    this[offset] = value >>> 8;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }
  writeUint16BE = this.writeUInt16BE;

  writeUInt32LE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    this[offset + 3] = value >>> 24;
    this[offset + 2] = value >>> 16;
    this[offset + 1] = value >>> 8;
    this[offset] = value & 0xff;
    return offset + 4;
  }
  writeUint32LE = this.writeUInt32LE;

  writeUInt32BE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    this[offset] = value >>> 24;
    this[offset + 1] = value >>> 16;
    this[offset + 2] = value >>> 8;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }
  writeUint32BE = this.writeUInt32BE;

  writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(
    value,
    offset = 0
  ) {
    return wrtBigUInt64LE(
      this,
      value,
      offset,
      BigInt(0),
      BigInt("0xffffffffffffffff")
    );
  });

  writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(
    value,
    offset = 0
  ) {
    return wrtBigUInt64BE(
      this,
      value,
      offset,
      BigInt(0),
      BigInt("0xffffffffffffffff")
    );
  });

  writeIntLE(
    value: number,
    offset: number,
    byteLength: number,
    noAssert?: boolean
  ): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) {
      const limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    let i = 0;
    let mul = 1;
    let sub = 0;
    this[offset] = value & 0xff;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = (((value / mul) >> 0) - sub) & 0xff;
    }

    return offset + byteLength;
  }

  writeIntBE(
    value: number,
    offset: number,
    byteLength: number,
    noAssert?: boolean
  ): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) {
      const limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    let i = byteLength - 1;
    let mul = 1;
    let sub = 0;
    this[offset + i] = value & 0xff;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = (((value / mul) >> 0) - sub) & 0xff;
    }

    return offset + byteLength;
  }

  writeInt8(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
    if (value < 0) value = 0xff + value + 1;
    this[offset] = value & 0xff;
    return offset + 1;
  }

  writeInt16LE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    this[offset] = value & 0xff;
    this[offset + 1] = value >>> 8;
    return offset + 2;
  }

  writeInt16BE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    this[offset] = value >>> 8;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeInt32LE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    this[offset] = value & 0xff;
    this[offset + 1] = value >>> 8;
    this[offset + 2] = value >>> 16;
    this[offset + 3] = value >>> 24;
    return offset + 4;
  }

  writeInt32BE(value: number, offset?: number, noAssert?: boolean): number {
    value = +value;
    offset = offset >>> 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (value < 0) value = 0xffffffff + value + 1;
    this[offset] = value >>> 24;
    this[offset + 1] = value >>> 16;
    this[offset + 2] = value >>> 8;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(
    value: bigint,
    offset?: number
  ): number {
    return wrtBigUInt64LE(
      this,
      value,
      offset,
      -BigInt("0x8000000000000000"),
      BigInt("0x7fffffffffffffff")
    );
  });

  writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(
    value: bigint,
    offset?: number
  ): number {
    return wrtBigUInt64BE(
      this,
      value,
      offset,
      -BigInt("0x8000000000000000"),
      BigInt("0x7fffffffffffffff")
    );
  });

  writeFloatLE(value: number, offset?: number, noAssert?: boolean): number {
    return writeFloat(this, value, offset, true, noAssert);
  }

  writeFloatBE(value: number, offset?: number, noAssert?: boolean): number {
    return writeFloat(this, value, offset, false, noAssert);
  }

  writeDoubleLE(value: number, offset?: number, noAssert?: boolean): number {
    return writeDouble(this, value, offset, true, noAssert);
  }

  writeDoubleBE(value: number, offset?: number, noAssert?: boolean): number {
    return writeDouble(this, value, offset, false, noAssert);
  }

  copy(
    target: Buffer,
    targetStart?: number,
    start?: number,
    end?: number
  ): number {
    if (!isInstance(target, Uint8Array))
      throw new TypeError("argument should be a Buffer");
    if (!start) start = 0;
    if (!end && end !== 0) end = this.length;
    if (targetStart >= target.length) targetStart = target.length;
    if (!targetStart) targetStart = 0;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0;
    if (target.length === 0 || this.length === 0) return 0;

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError("targetStart out of bounds");
    }
    if (start < 0 || start >= this.length)
      throw new RangeError("Index out of range");
    if (end < 0) throw new RangeError("sourceEnd out of bounds");

    // Are we oob?
    if (end > this.length) end = this.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    const len = end - start;

    if (
      this === target &&
      typeof Uint8Array.prototype.copyWithin === "function"
    ) {
      // Use built-in when available, missing from IE11
      this.copyWithin(targetStart, start, end);
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, end),
        targetStart
      );
    }

    return len;
  }

  // fill(value: any, offset?: number, end?: number): this {}

  /**
   * Returns true if {encoding} is a valid encoding argument.
   * Valid string encodings in Node 0.12: 'ascii'|'utf8'|'utf16le'|'ucs2'(alias of 'utf16le')|'base64'|'binary'(deprecated)|'hex'
   *
   * @param encoding string to test.
   */
  static isEncoding(encoding: string): boolean {
    switch (String(encoding).toLowerCase()) {
      case "hex":
      case "utf8":
      case "utf-8":
      case "ascii":
      case "latin1":
      case "binary":
      case "base64":
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return true;
      default:
        return false;
    }
  }
  /**
   * Returns true if {obj} is a Buffer
   *
   * @param obj object to test.
   */
  static isBuffer(obj: any): obj is Buffer {
    return obj != null && obj._isBuffer === true && obj !== Buffer.prototype;
  }

  // Define the 'parent' property
  get parent(): ArrayBuffer | undefined {
    if (!Buffer.isBuffer(this)) return undefined;
    return this.buffer;
  }

  // Define the 'offset' property
  get offset(): number | undefined {
    if (!Buffer.isBuffer(this)) return undefined;
    return (this as any).byteOffset;
  }
  /**
   * Allocates a new buffer of {size} octets.
   *
   * @param size count of octets to allocate.
   * @param fill if specified, buffer will be initialized by calling buf.fill(fill).
   *    If parameter is omitted, buffer will be filled with zeros.
   * @param encoding encoding used for call to buf.fill while initializing
   */
  static alloc(
    size: number,
    fill?: string | Buffer | number,
    encoding?: string
  ): Buffer {
    return alloc(size, fill, encoding);
  }
  /**
   * Allocates a new buffer of {size} octets, leaving memory not initialized, so the contents
   * of the newly created Buffer are unknown and may contain sensitive data.
   *
   * @param size count of octets to allocate
   */
  static allocUnsafe(size: number): Buffer {
    return allocUnsafe(size);
  }
  /**
   * Allocates a new non-pooled buffer of {size} octets, leaving memory not initialized, so the contents
   * of the newly created Buffer are unknown and may contain sensitive data.
   *
   * @param size count of octets to allocate
   */
  static allocUnsafeSlow(size: number): Buffer {
    return allocUnsafe(size);
  }
  /**
   * The same as buf1.compare(buf2).
   */
  static compare(buf1: Uint8Array, buf2: Uint8Array): number {
    if (!isInstance(buf1, Uint8Array) || !isInstance(buf1, Uint8Array)) {
      throw new TypeError(
        'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
      );
    }

    if (buf1 === buf2) return 0;

    let x = buf1.length;
    let y = buf2.length;

    for (let i = 0, len = Math.min(x, y); i < len; ++i) {
      if (buf1[i] !== buf2[i]) {
        x = buf1[i];
        y = buf2[i];
        break;
      }
    }

    if (x < y) return -1;
    if (y < x) return 1;
    return 0;
  }
  /**
   * Returns a buffer which is the result of concatenating all the buffers in the list together.
   *
   * If the list has no items, or if the totalLength is 0, then it returns a zero-length buffer.
   * If the list has exactly one item, then the first item of the list is returned.
   * If the list has more than one item, then a new Buffer is created.
   *
   * @param list An array of Buffer objects to concatenate
   * @param length Total length of the buffers when concatenated.
   *   If totalLength is not provided, it is read from the buffers in the list. However, this adds an additional loop to the function, so it is faster to provide the length explicitly.
   */
  static concat(list: Uint8Array[], length?: number): Buffer {
    if (!Array.isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }

    if (list.length === 0) {
      return Buffer.alloc(0);
    }

    let i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    const buffer = Buffer.allocUnsafe(length);
    let pos = 0;
    for (i = 0; i < list.length; ++i) {
      const buf = list[i];
      if (!isInstance(buf, Uint8Array)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (pos + buf.length > buffer.length) {
        buffer.set(buf.subarray(0, buffer.length - pos), pos);
        break;
      }
      buffer.set(buf, pos);
      pos += buf.length;
    }

    return buffer;
  }
  /**
   * Gives the actual byte length of a string. encoding defaults to 'utf8'.
   * This is not the same as String.prototype.length since that returns the number of characters in a string.
   *
   * @param string string to test.
   * @param encoding encoding used to evaluate (defaults to 'utf8')
   */
  static byteLength(
    string: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
    encoding?: string
  ): number {
    if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
      return (string as ArrayBuffer).byteLength;
    }
    if (
      typeof SharedArrayBuffer !== "undefined" &&
      isInstance(string, SharedArrayBuffer)
    ) {
      return (string as SharedArrayBuffer).byteLength;
    }
    if (typeof string !== "string") {
      throw new TypeError(
        'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
          "Received type " +
          typeof string
      );
    }

    const len = string.length;
    const mustMatch = arguments.length > 2 && arguments[2] === true;
    if (!mustMatch && len === 0) return 0;

    // Use a for loop to avoid recursion
    let loweredCase = false;
    for (;;) {
      switch (encoding) {
        case "ascii":
        case "latin1":
        case "binary":
          return len;
        case "utf8":
        case "utf-8":
          return utf8ToBytes(string).length;
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return len * 2;
        case "hex":
          return len >>> 1;
        case "base64":
          return base64ToBytes(string).length;
        default:
          if (loweredCase) {
            return mustMatch ? -1 : utf8ToBytes(string).length; // assume utf8
          }
          encoding = ("" + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  /**
   * Allocates a new Buffer using an {array} of octets.
   *
   * @param array
   */
  static from(array: any[]): Buffer;
  /**
   * When passed a reference to the .buffer property of a TypedArray instance,
   * the newly created Buffer will share the same allocated memory as the TypedArray.
   * The optional {byteOffset} and {length} arguments specify a memory range
   * within the {arrayBuffer} that will be shared by the Buffer.
   *
   * @param arrayBuffer The .buffer property of a TypedArray or a new ArrayBuffer()
   * @param byteOffset
   * @param length
   */
  static from(
    arrayBuffer: ArrayBuffer,
    byteOffset?: number,
    length?: number
  ): Buffer;
  /**
   * Copies the passed {buffer} data onto a new Buffer instance.
   *
   * @param buffer
   */
  static from(buffer: Buffer | Uint8Array): Buffer;
  /**
   * Creates a new Buffer containing the given JavaScript string {str}.
   * If provided, the {encoding} parameter identifies the character encoding.
   * If not provided, {encoding} defaults to 'utf8'.
   *
   * @param str
   */
  static from(str: string, encoding?: string): Buffer;
  static from(value: any, encodingOrOffset?: any, length?: number): Buffer {
    return from(value, encodingOrOffset, length);
  }
}

// Check for typed array support and log an error if not supported
if (
  !Buffer.TYPED_ARRAY_SUPPORT &&
  typeof console !== "undefined" &&
  typeof console.error === "function"
) {
  console.error(
    "This browser lacks typed array (Uint8Array) support which is required by " +
      "`buffer` v5.x. Use `buffer` v4.x if you require old browser support."
  );
}

function allocUnsafe(size: number): Buffer {
  assertSize(size);
  return createBuffer(size < 0 ? 0 : checked(size) | 0);
}

// Function to create a Buffer instance
export function createBuffer(length: number): Buffer {
  if (length > Buffer.K_MAX_LENGTH) {
    throw new RangeError(`The value "${length}" is invalid for option "size"`);
  }
  // Return an augmented `Uint8Array` instance
  const buf = new Uint8Array(length);
  Object.setPrototypeOf(buf, Buffer.prototype);
  return buf as unknown as Buffer;
}

function assertSize(size: number) {
  if (typeof size !== "number") {
    throw new TypeError('"size" argument must be of type number');
  } else if (size < 0) {
    throw new RangeError(
      'The value "' + size + '" is invalid for option "size"'
    );
  }
}

function alloc(
  size: number,
  fill?: string | number | Buffer,
  encoding?: string
): Buffer {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(size);
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpreted as a start offset.
    return typeof encoding === "string"
      ? createBuffer(size).fill(fill as any, 0, length, encoding as string)
      : createBuffer(size).fill(fill as number);
  }
  return createBuffer(size);
}

function typesArraySupport(): boolean {
  // Can typed array instances be augmented?
  try {
    const arr = new Uint8Array(1) as { foo: () => number } & Uint8Array;
    const proto = {
      foo: function () {
        return 42;
      },
    };
    Object.setPrototypeOf(proto, Uint8Array.prototype);
    Object.setPrototypeOf(arr, proto);
    return arr.foo() === 42;
  } catch (e) {
    return false;
  }
}

function fromString(string: string, encoding: string | number) {
  if (typeof encoding !== "string" || encoding === "") {
    encoding = "utf8";
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError("Unknown encoding: " + encoding);
  }

  const length = this.byteLength(string, encoding) | 0;
  let buf = createBuffer(length);
  const actual = buf.write(string, 0, length, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual);
  }

  return buf;
}

function fromArrayLike(array: ArrayLike<number>): Buffer {
  const length = array.length < 0 ? 0 : checked(array.length) | 0;
  const buf = createBuffer(length);
  for (let i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255;
  }
  return buf;
}

function fromArrayView(arrayView: ArrayBufferView): Buffer {
  if (isInstance(arrayView, Uint8Array)) {
    const copy = new Uint8Array(
      arrayView.buffer,
      arrayView.byteOffset,
      arrayView.byteLength
    );
    return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
  }
  return fromArrayLike(arrayView as unknown as ArrayLike<number>);
}

function fromArrayBuffer(array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds');
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds');
  }

  let buf;
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array);
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset);
  } else {
    buf = new Uint8Array(array, byteOffset, length);
  }

  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(buf, Buffer.prototype);

  return buf;
}

function fromObject(obj) {
  if (Buffer.isBuffer(obj)) {
    const len = checked(obj.length) | 0;
    const buf = createBuffer(len);

    if (buf.length === 0) {
      return buf;
    }

    obj.copy(buf, 0, 0, len);
    return buf;
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
      return createBuffer(0);
    }
    return fromArrayLike(obj);
  }

  if (obj.type === "Buffer" && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data);
  }
}

function checked(length: number): number {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError(
      "Attempt to allocate Buffer larger than maximum " +
        "size: 0x" +
        K_MAX_LENGTH.toString(16) +
        " bytes"
    );
  }
  return length | 0;
}

function SlowBuffer(length: number): Buffer {
  if (+length !== length) {
    length = 0;
  }
  return Buffer.alloc(+length);
}

function slowToString(encoding: string, start?: number, end?: number): string {
  let loweredCase = false;

  if (start === undefined || start < 0) start = 0;
  if (start > Buffer.length) return "";
  if (end === undefined || end > Buffer.length) end = Buffer.length;
  if (end <= 0) return "";

  // Force coercion to uint32
  end >>>= 0;
  start >>>= 0;

  if (end <= start) return "";

  while (true) {
    switch (encoding) {
      case "hex":
        return hexSlice(this, start, end);
      case "utf8":
      case "utf-8":
        return utf8Slice(this, start, end);
      case "ascii":
        return asciiSlice(this, start, end);
      case "latin1":
      case "binary":
        return latin1Slice(this, start, end);
      case "base64":
        return base64Slice(this, start, end);
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return utf16leSlice(this, start, end);

      default:
        if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
        encoding = (encoding + "").toLowerCase();
        loweredCase = true;
    }
  }
}

function swap(b: Uint8Array | Buffer, n: number, m: number): void {
  const i = b[n];
  b[n] = b[m];
  b[m] = i;
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf(
  buffer: Buffer | Uint8Array,
  val: string | number | Buffer,
  byteOffset?: number | string,
  encoding?: string,
  dir?: boolean
): number {
  // Empty buffer means no match
  if (buffer.length === 0) return -1;

  // Normalize byteOffset
  if (typeof byteOffset === "string") {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset; // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : buffer.length - 1;
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1;
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1;
  }

  // Normalize val
  if (typeof val === "string") {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1;
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
  } else if (typeof val === "number") {
    val = val & 0xff; // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === "function") {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
  }

  throw new TypeError("val must be string, number or Buffer");
}

function arrayIndexOf(
  arr: Buffer | Uint8Array,
  val: Buffer | number[],
  byteOffset: number,
  encoding?: string,
  dir?: boolean
): number {
  let indexSize = 1;
  let arrLength = arr.length;
  let valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (
      encoding === "ucs2" ||
      encoding === "ucs-2" ||
      encoding === "utf16le" ||
      encoding === "utf-16le"
    ) {
      if (arr.length < 2 || val.length < 2) {
        return -1;
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read(buf, i) {
    if (indexSize === 1) {
      return buf[i];
    } else {
      return buf.readUInt16BE(i * indexSize);
    }
  }

  let i;
  if (dir) {
    let foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      let found = true;
      for (let j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
  }
  return -1;
}

function hexWrite(
  buf: Buffer | Uint8Array,
  string: string,
  offset?: number,
  length?: number
): number {
  offset = Number(offset) || 0;
  const remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  const strLen = string.length;
  if (length > strLen >>> 1) {
    length = strLen >>> 1;
  }

  for (let i = 0; i < length; ++i) {
    const a = string.charCodeAt(i * 2 + 0);
    const b = string.charCodeAt(i * 2 + 1);
    const hi = hexCharValueTable[a & 0x7f];
    const lo = hexCharValueTable[b & 0x7f];

    if ((a | b | hi | lo) & ~0x7f) {
      return i;
    }

    buf[offset + i] = (hi << 4) | lo;
  }

  return length;
}

function utf8Write(
  buf: Buffer | Uint8Array,
  string: string,
  offset?: number,
  length?: number
): number {
  return blitBuffer(
    utf8ToBytes(string, buf.length - offset),
    buf,
    offset,
    length
  );
}

function asciiWrite(
  buf: Buffer | Uint8Array,
  string: string,
  offset?: number,
  length?: number
): number {
  return blitBuffer(asciiToBytes(string), buf, offset, length);
}

function base64Write(
  buf: Buffer | Uint8Array,
  string: string,
  offset?: number,
  length?: number
): number {
  return blitBuffer(base64ToBytes(string), buf, offset, length);
}

function ucs2Write(
  buf: Buffer | Uint8Array,
  string: string,
  offset?: number,
  length?: number
): number {
  return blitBuffer(
    utf16leToBytes(string, buf.length - offset),
    buf,
    offset,
    length
  );
}

function base64Slice(
  buf: Buffer | Uint8Array,
  start?: number,
  end?: number
): string {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf as Uint8Array);
  } else {
    return base64.fromByteArray(buf.slice(start, end) as Uint8Array);
  }
}

function utf8Slice(
  buf: Buffer | Uint8Array,
  start?: number,
  end?: number
): string {
  end = Math.min(buf.length, end);
  const res = [];

  let i = start;
  while (i < end) {
    const firstByte = buf[i];
    let codePoint = null;
    let bytesPerSequence =
      firstByte > 0xef ? 4 : firstByte > 0xdf ? 3 : firstByte > 0xbf ? 2 : 1;

    if (i + bytesPerSequence <= end) {
      let secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break;
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xc0) === 0x80) {
            tempCodePoint = ((firstByte & 0x1f) << 0x6) | (secondByte & 0x3f);
            if (tempCodePoint > 0x7f) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xc0) === 0x80 && (thirdByte & 0xc0) === 0x80) {
            tempCodePoint =
              ((firstByte & 0xf) << 0xc) |
              ((secondByte & 0x3f) << 0x6) |
              (thirdByte & 0x3f);
            if (
              tempCodePoint > 0x7ff &&
              (tempCodePoint < 0xd800 || tempCodePoint > 0xdfff)
            ) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if (
            (secondByte & 0xc0) === 0x80 &&
            (thirdByte & 0xc0) === 0x80 &&
            (fourthByte & 0xc0) === 0x80
          ) {
            tempCodePoint =
              ((firstByte & 0xf) << 0x12) |
              ((secondByte & 0x3f) << 0xc) |
              ((thirdByte & 0x3f) << 0x6) |
              (fourthByte & 0x3f);
            if (tempCodePoint > 0xffff && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xfffd;
      bytesPerSequence = 1;
    } else if (codePoint > 0xffff) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(((codePoint >>> 10) & 0x3ff) | 0xd800);
      codePoint = 0xdc00 | (codePoint & 0x3ff);
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res);
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
const MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray(codePoints: number[]): string {
  const len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints); // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  let res = "";
  let i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, (i += MAX_ARGUMENTS_LENGTH))
    );
  }
  return res;
}

function asciiSlice(
  buf: Buffer | Uint8Array, // The buffer to read from
  start: number, // The start index for reading
  end: number // The end index for reading
): string {
  let ret = "";
  end = Math.min(buf.length, end);

  for (let i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7f);
  }
  return ret;
}

function latin1Slice(
  buf: Buffer | Uint8Array, // The buffer to read from
  start: number, // The start index for reading
  end: number // The end index for reading
): string {
  let ret = "";
  end = Math.min(buf.length, end);

  for (let i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret;
}

function hexSlice(
  buf: Buffer | Uint8Array, // The buffer to read from
  start?: number, // The start index for reading
  end?: number // The end index for reading
): string {
  const len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  let out = "";
  for (let i = start; i < end; ++i) {
    out += hexSliceLookupTable[buf[i]];
  }
  return out;
}

function utf16leSlice(
  buf: Buffer | Uint8Array, // The buffer to read from
  start?: number, // The start index for reading
  end?: number // The end index for reading
): string {
  const bytes = buf.slice(start, end);
  let res = "";
  // If bytes.length is odd, the last 8 bits must be ignored (same as node.js)
  for (let i = 0; i < bytes.length - 1; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res;
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset(offset: number, ext: number, length: number): void {
  if (offset % 1 !== 0 || offset < 0)
    throw new RangeError("offset is not uint");
  if (offset + ext > length)
    throw new RangeError("Trying to access beyond buffer length");
}

function checkInt(
  buf: Buffer,
  value: number,
  offset: number,
  ext: number,
  max: number,
  min: number
): void {
  if (!Buffer.isBuffer(buf))
    throw new TypeError('"buffer" argument must be a Buffer instance');
  if (value > max || value < min)
    throw new RangeError('"value" argument is out of bounds');
  if (offset + ext > buf.length) throw new RangeError("Index out of range");
}

function wrtBigUInt64LE(
  buf: Buffer | Uint8Array,
  value: bigint,
  offset: number,
  min: bigint,
  max: bigint
): number {
  // Returns the new offset after writing
  checkIntBI(value, min, max, buf, offset, 7);

  let lo = Number(value & BigInt(0xffffffff));
  buf[offset++] = lo;
  lo = lo >> 8;
  buf[offset++] = lo;
  lo = lo >> 8;
  buf[offset++] = lo;
  lo = lo >> 8;
  buf[offset++] = lo;
  let hi = Number((value >> BigInt(32)) & BigInt(0xffffffff));
  buf[offset++] = hi;
  hi = hi >> 8;
  buf[offset++] = hi;
  hi = hi >> 8;
  buf[offset++] = hi;
  hi = hi >> 8;
  buf[offset++] = hi;
  return offset;
}

function wrtBigUInt64BE(
  buf: Buffer | Uint8Array,
  value: bigint,
  offset: number,
  min: bigint,
  max: bigint
): number {
  checkIntBI(value, min, max, buf, offset, 7);

  let lo = Number(value & BigInt(0xffffffff));
  buf[offset + 7] = lo;
  lo = lo >> 8;
  buf[offset + 6] = lo;
  lo = lo >> 8;
  buf[offset + 5] = lo;
  lo = lo >> 8;
  buf[offset + 4] = lo;
  let hi = Number((value >> BigInt(32)) & BigInt(0xffffffff));
  buf[offset + 3] = hi;
  hi = hi >> 8;
  buf[offset + 2] = hi;
  hi = hi >> 8;
  buf[offset + 1] = hi;
  hi = hi >> 8;
  buf[offset] = hi;
  return offset + 8;
}

function checkIEEE754(
  buf: Buffer | Uint8Array,
  value: number,
  offset: number,
  ext: number,
  max: number,
  min: number
): void {
  if (offset + ext > buf.length) throw new RangeError("Index out of range");
  if (offset < 0) throw new RangeError("Index out of range");
}

function writeFloat(
  buf: Buffer | Uint8Array,
  value: number,
  offset: number,
  littleEndian: boolean,
  noAssert?: boolean
): number {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(
      buf,
      value,
      offset,
      4,
      3.4028234663852886e38,
      -3.4028234663852886e38
    );
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4;
}

function writeDouble(
  buf: Buffer | Uint8Array,
  value: number,
  offset: number,
  littleEndian: boolean,
  noAssert?: boolean
): number {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(
      buf,
      value,
      offset,
      8,
      1.7976931348623157e308,
      -1.7976931348623157e308
    );
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8;
}

function numberIsNaN(obj: unknown): boolean {
  // For IE11 support
  return obj !== obj; // eslint-disable-line no-self-compare
}

function isInstance(obj: any, type: any): boolean {
  return (
    obj instanceof type ||
    (obj != null &&
      obj.constructor != null &&
      obj.constructor.name != null &&
      obj.constructor.name === type.name) ||
    (type === Uint8Array && Buffer.isBuffer(obj))
  );
}

// Return not function with Error if BigInt not supported
function defineBigIntMethod<T extends (...args: any[]) => any>(
  fn: T
): T | typeof BufferBigIntNotDefined {
  return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
}

function BufferBigIntNotDefined() {
  throw new Error("BigInt not supported");
}

// CUSTOM ERRORS
// =============

// Simplified versions from Node, changed for Buffer-only usage
const errors = {};

type GetMessageFunction = (...args: any[]) => string;

function E(sym: string, getMessage: GetMessageFunction, Base: any): void {
  function NodeError() {
    const err = new Base(getMessage.apply(null, arguments));

    Object.setPrototypeOf(err, NodeError.prototype);

    // Node.js `err.code` properties are own/enumerable properties.
    err.code = sym;
    // Add the error code to the name to include it in the stack trace.
    err.name = `${err.name} [${sym}]`;
    // Remove NodeError from the stack trace.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, NodeError);
    }
    // Access the stack to generate the error message including the error code
    // from the name.
    err.stack; // eslint-disable-line no-unused-expressions
    // Reset the name to the actual name.
    delete err.name;

    return err;
  }

  Object.setPrototypeOf(NodeError.prototype, Base.prototype);
  Object.setPrototypeOf(NodeError, Base);

  NodeError.prototype.toString = function toString() {
    return `${this.name} [${sym}]: ${this.message}`;
  };

  errors[sym] = NodeError;
}

E(
  "ERR_BUFFER_OUT_OF_BOUNDS",
  function (name) {
    if (name) {
      return `${name} is outside of buffer bounds`;
    }

    return "Attempt to access memory outside buffer bounds";
  },
  RangeError
);
E(
  "ERR_INVALID_ARG_TYPE",
  function (name, actual) {
    return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
  },
  TypeError
);
E(
  "ERR_OUT_OF_RANGE",
  function (str, range, input) {
    let msg = `The value of "${str}" is out of range.`;
    let received = input;
    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
      received = addNumericalSeparator(String(input));
    } else if (typeof input === "bigint") {
      received = String(input);
      if (
        input > BigInt(2) ** BigInt(32) ||
        input < -(BigInt(2) ** BigInt(32))
      ) {
        received = addNumericalSeparator(received);
      }
      received += "n";
    }
    msg += ` It must be ${range}. Received ${received}`;
    return msg;
  },
  RangeError
);

class ErrorRegistry {
  private static errors: Record<string, new (...args: any[]) => Error> = {};

  static registerError(
    sym: string,
    getMessage: GetMessageFunction,
    Base: new (...args: any[]) => Error
  ): void {
    class NodeError extends Base {
      constructor(...args: any[]) {
        const message = getMessage.apply(null, args);
        super(message);

        Object.setPrototypeOf(this, NodeError.prototype);

        // Node.js `err.code` properties are own/enumerable properties.
        (this as any).code = sym; // Type assertion to allow code property
        // Add the error code to the name to include it in the stack trace.
        this.name = `${this.name} [${sym}]`;
        // Remove NodeError from the stack trace.
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, NodeError);
        }
        // Access the stack to generate the error message including the error code
        // from the name.
        this.stack; // eslint-disable-line no-unused-expressions
        // Reset the name to the actual name.
        delete this.name;
      }

      toString() {
        return `${this.name} [${sym}]: ${this.message}`;
      }
    }

    this.errors[sym] = NodeError;
  }

  static getError(sym: string): new (...args: any[]) => Error | undefined {
    return this.errors[sym];
  }
}

// Registering Errors
ErrorRegistry.registerError(
  "ERR_BUFFER_OUT_OF_BOUNDS",
  function (name?: string) {
    if (name) {
      return `${name} is outside of buffer bounds`;
    }
    return "Attempt to access memory outside buffer bounds";
  },
  RangeError
);

ErrorRegistry.registerError(
  "ERR_INVALID_ARG_TYPE",
  function (name: string, actual: any) {
    return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
  },
  TypeError
);

ErrorRegistry.registerError(
  "ERR_OUT_OF_RANGE",
  function (str: string, range: string, input: number | bigint) {
    let msg = `The value of "${str}" is out of range.`;
    let received: string;
    if (Number.isInteger(input) && Math.abs(input as number) > 2 ** 32) {
      received = addNumericalSeparator(String(input));
    } else if (typeof input === "bigint") {
      received = String(input);
      if (
        input > BigInt(2) ** BigInt(32) ||
        input < -(BigInt(2) ** BigInt(32))
      ) {
        received = addNumericalSeparator(received);
      }
      received += "n";
    }
    msg += ` It must be ${range}. Received ${received}`;
    return msg;
  },
  RangeError
);

function addNumericalSeparator(val: string): string {
  let res = "";
  let i = val.length;
  const start = val[0] === "-" ? 1 : 0;
  for (; i >= start + 4; i -= 3) {
    res = `_${val.slice(i - 3, i)}${res}`;
  }
  return `${val.slice(0, i)}${res}`;
}

// CHECK FUNCTIONS
// ===============

function checkBounds(buf, offset, byteLength) {
  validateNumber(offset, "offset");
  if (buf[offset] === undefined || buf[offset + byteLength] === undefined) {
    boundsError(offset, buf.length - (byteLength + 1));
  }
}

function checkIntBI(value, min, max, buf, offset, byteLength) {
  if (value > max || value < min) {
    const n = typeof min === "bigint" ? "n" : "";
    let range;
    if (byteLength > 3) {
      if (min === 0 || min === BigInt(0)) {
        range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
      } else {
        range =
          `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
          `${(byteLength + 1) * 8 - 1}${n}`;
      }
    } else {
      range = `>= ${min}${n} and <= ${max}${n}`;
    }
    // throw new errors.ERR_OUT_OF_RANGE("value", range, value);
    throw new (ErrorRegistry.getError("ERR_OUT_OF_RANGE"))(
      "value",
      "0 to 100",
      150
    );
  }
  checkBounds(buf, offset, byteLength);
}

function validateNumber(value, name) {
  if (typeof value !== "number") {
    // throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
    throw new (ErrorRegistry.getError("ERR_INVALID_ARG_TYPE"))(
      name,
      "number",
      value
    );
  }
}

function boundsError(value: number, length: number, type?: string): void {
  if (Math.floor(value) !== value) {
    validateNumber(value, type);
    // throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
    throw new (ErrorRegistry.getError("ERR_OUT_OF_RANGE"))(
      type || "offset",
      "an integer",
      value
    );
  }

  if (length < 0) {
    // throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
    throw new (ErrorRegistry.getError("ERR_BUFFER_OUT_OF_BOUNDS"))();
  }

  // throw new errors.ERR_OUT_OF_RANGE(
  //   type || "offset",
  //   `>= ${type ? 1 : 0} and <= ${length}`,
  //   value
  // );
  throw new (ErrorRegistry.getError("ERR_OUT_OF_RANGE"))(
    type || "offset",
    `>= ${type ? 1 : 0} and <= ${length}`,
    value
  );
}

// HELPER FUNCTIONS
// ================

const INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;

function base64clean(str: string): string {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split("=")[0];
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, "");
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return "";
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + "=";
  }
  return str;
}

function utf8ToBytes(string: string, units: number = Infinity): number[] {
  units = units || Infinity;
  let codePoint;
  const length = string.length;
  let leadSurrogate = null;
  const bytes: number[] = [];

  for (let i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xd7ff && codePoint < 0xe000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xdbff) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;

        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xdc00) {
        if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint =
        (((leadSurrogate - 0xd800) << 10) | (codePoint - 0xdc00)) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break;
      bytes.push((codePoint >> 0x6) | 0xc0, (codePoint & 0x3f) | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break;
      bytes.push(
        (codePoint >> 0xc) | 0xe0,
        ((codePoint >> 0x6) & 0x3f) | 0x80,
        (codePoint & 0x3f) | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break;
      bytes.push(
        (codePoint >> 0x12) | 0xf0,
        ((codePoint >> 0xc) & 0x3f) | 0x80,
        ((codePoint >> 0x6) & 0x3f) | 0x80,
        (codePoint & 0x3f) | 0x80
      );
    } else {
      throw new Error("Invalid code point");
    }
  }

  return bytes;
}

function from(value: any, encodingOrOffset?: any, length?: number): Buffer {
  if (typeof value === "string") {
    return fromString(value, encodingOrOffset);
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayView(value);
  }

  if (value == null) {
    throw new TypeError(
      "The first argument must be one of type string, Buffer, ArrayBuffer, Array, " +
        "or Array-like Object. Received type " +
        typeof value
    );
  }

  if (
    isInstance(value, ArrayBuffer) ||
    (value && isInstance(value.buffer, ArrayBuffer))
  ) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }

  if (
    typeof SharedArrayBuffer !== "undefined" &&
    (isInstance(value, SharedArrayBuffer) ||
      (value && isInstance(value.buffer, SharedArrayBuffer)))
  ) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }

  if (typeof value === "number") {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    );
  }

  const valueOf = value.valueOf && value.valueOf();
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length);
  }

  const b = fromObject(value);
  if (b) return b;

  if (
    typeof Symbol !== "undefined" &&
    Symbol.toPrimitive != null &&
    typeof value[Symbol.toPrimitive] === "function"
  ) {
    return Buffer.from(
      value[Symbol.toPrimitive]("string"),
      encodingOrOffset,
      length
    );
  }

  throw new TypeError(
    "The first argument must be one of type string, Buffer, ArrayBuffer, Array, " +
      "or Array-like Object. Received type " +
      typeof value
  );
}

function asciiToBytes(str) {
  const byteArray = [];
  for (let i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xff);
  }
  return byteArray;
}

function utf16leToBytes(str, units) {
  let c, hi, lo;
  const byteArray = [];
  for (let i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break;

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray;
}

function base64ToBytes(str) {
  return base64.toByteArray(base64clean(str));
}

function blitBuffer(src, dst, offset, length) {
  let i;
  for (i = 0; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}

// Create lookup table for `toString('hex')`
// See: https://github.com/feross/buffer/issues/219
const hexSliceLookupTable = (function () {
  const alphabet = "0123456789abcdef";
  const table = new Array(256);
  for (let i = 0; i < 16; ++i) {
    const i16 = i * 16;
    for (let j = 0; j < 16; ++j) {
      table[i16 + j] = alphabet[i] + alphabet[j];
    }
  }
  return table;
})();

// hex lookup table for Buffer.from(x, 'hex')
/* eslint-disable no-multi-spaces, indent */
const hexCharValueTable = [
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, -1,
  -1, -1, -1, -1, -1, 10, 11, 12, 13, 14, 15, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 10,
  11, 12, 13, 14, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
];

export default Buffer;
