"use strict";
import Buffer from "../buffer";

export type ByteArray = ArrayLike<number> & number[];

export interface EncoderOptions {
  type?: "rfc4648" | "crockford" | "base32hex";
  alphabet?: string;
  lc?: boolean;
}

export interface DecoderOptions {
  type?: string;
  charmap?: CharacterMap;
}

export interface CharacterMap {
  [charToReplace: string]: number;
  [charToReplace: number]: number;
}

export interface Base32Variant {
  alphabet: string;
  charmap: CharacterMap;
}

/**
 * The Crockford base 32 alphabet and character map.
 * @see {@link http://www.crockford.com/wrmg/base32.html}
 */
export const crockford: Base32Variant = {
  alphabet: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  charmap: {},
};
crockford.charmap = charmap(crockford.alphabet, crockford.charmap);

/**
 * The RFC 4648 base 32 alphabet and character map.
 * @see {@link https://tools.ietf.org/html/rfc4648}
 */
export const rfc4648: Base32Variant = {
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  charmap: {
    0: 14,
    1: 8,
  },
};
rfc4648.charmap = charmap(rfc4648.alphabet, rfc4648.charmap);

/**
 * base32hex
 * @see {@link https://en.wikipedia.org/wiki/Base32#base32hex}
 */
export const base32hex: Base32Variant = {
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
  charmap: {},
};
base32hex.charmap = charmap(base32hex.alphabet, base32hex.charmap);

/**
 * Generate a character map.
 * @param {string} alphabet e.g. "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
 * @param {CharacterMap} mappings map overrides from key to value
 * @method
 */
function charmap(alphabet: string, mappings: CharacterMap = {}): CharacterMap {
  alphabet.split("").forEach((c, i) => {
    if (!(c in mappings)) mappings[c] = i;
  });
  return mappings;
}

export class Encoder {
  private buf: string;
  private shift: number;
  private carry: number;
  private alphabet: string;

  constructor(options?: EncoderOptions) {
    this.buf = "";
    this.shift = 3;
    this.carry = 0;

    if (options) {
      switch (options.type) {
        case "rfc4648":
          this.alphabet = rfc4648.alphabet;
          break;
        case "crockford":
          this.alphabet = crockford.alphabet;
          break;
        case "base32hex":
          this.alphabet = base32hex.alphabet;
          break;
        default:
          throw new Error("invalid type");
      }

      if (options.alphabet) this.alphabet = options.alphabet;
      else if (options.lc) this.alphabet = this.alphabet.toLowerCase();
    } else {
      this.alphabet = rfc4648.alphabet;
    }
  }

  write(buf: ByteArray): this {
    let shift = this.shift;
    let carry = this.carry;
    let symbol: number;
    let byte: number;

    for (let i = 0; i < buf.length; i++) {
      byte = buf[i];

      symbol = carry | (byte >> shift);
      this.buf += this.alphabet[symbol & 0x1f];

      if (shift > 5) {
        shift -= 5;
        symbol = byte >> shift;
        this.buf += this.alphabet[symbol & 0x1f];
      }

      shift = 5 - shift;
      carry = byte << shift;
      shift = 8 - shift;
    }

    this.shift = shift;
    this.carry = carry;
    return this;
  }

  finalize(buf?: ByteArray): string {
    if (buf) {
      this.write(buf);
    }
    if (this.shift !== 3) {
      this.buf += this.alphabet[this.carry & 0x1f];
      this.shift = 3;
      this.carry = 0;
    }
    return this.buf;
  }
}

export class Decoder {
  private buf: ByteArray;
  private shift: number;
  private carry: number;
  private charmap: CharacterMap;

  constructor(options?: DecoderOptions) {
    this.buf = [];
    this.shift = 8;
    this.carry = 0;

    if (options) {
      switch (options.type) {
        case "rfc4648":
          this.charmap = rfc4648.charmap;
          break;
        case "crockford":
          this.charmap = crockford.charmap;
          break;
        case "base32hex":
          this.charmap = base32hex.charmap;
          break;
        default:
          throw new Error("invalid type");
      }

      if (options.charmap) this.charmap = options.charmap;
    } else {
      this.charmap = rfc4648.charmap;
    }
  }

  write(str: string): this {
    const charmap = this.charmap;
    let shift = this.shift;
    let carry = this.carry;

    str
      .toUpperCase()
      .split("")
      .forEach((char) => {
        if (char === "=") return;

        const symbol = charmap[char] & 0xff;

        shift -= 5;
        if (shift > 0) {
          carry |= symbol << shift;
        } else if (shift < 0) {
          this.buf.push(carry | (symbol >> -shift));
          shift += 8;
          carry = (symbol << shift) & 0xff;
        } else {
          this.buf.push(carry | symbol);
          shift = 8;
          carry = 0;
        }
      });

    this.shift = shift;
    this.carry = carry;

    return this;
  }

  finalize(str?: string): ByteArray | Buffer {
    if (str) {
      this.write(str);
    }
    if (this.shift !== 8 && this.carry !== 0) {
      this.buf.push(this.carry);
      this.shift = 8;
      this.carry = 0;
    }
    return this.buf;
  }
}

Decoder.prototype.finalize = function (buf: string): Buffer {
  const bytes = Decoder.prototype.finalize.call(this, buf);
  return new Buffer(bytes);
};

export function encode(buf: ByteArray, options?: EncoderOptions): string {
  return new Encoder(options).finalize(buf);
}

export function decode(
  str: string,
  options?: DecoderOptions
): ByteArray | Buffer {
  return new Decoder(options).finalize(str);
}
