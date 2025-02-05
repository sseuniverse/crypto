/*
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */

"use strict";

/** Highest positive signed 32-bit float value */
const maxInt: number = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
const base: number = 36;
const tMin: number = 1;
const tMax: number = 26;
const skew: number = 38;
const damp: number = 700;
const initialBias: number = 72;
const initialN: number = 128; // 0x80
const delimiter: string = "-"; // '\x2D'

/** Regular expressions */
const regexPunycode: RegExp = /^xn--/;
const regexNonASCII: RegExp = /[^\0-\x7F]/; // Note: U+007F DEL is excluded too.
const regexSeparators: RegExp = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

/** Error messages */
const errors: { [key: string]: string } = {
  overflow: "Overflow: input needs wider integers to process",
  "not-basic": "Illegal input >= 0x80 (not a basic code point)",
  "invalid-input": "Invalid input",
};

/** Convenience shortcuts */
const baseMinusTMin: number = base - tMin;
const floor: (x: number) => number = Math.floor;
const stringFromCharCode: (...codes: number[]) => string = String.fromCharCode;

/*--------------------------------------------------------------------------*/

/**
 * A generic error utility function.
 * @private
 * @param {String} type The error type.
 * @returns {Error} Throws a `RangeError` with the applicable error message.
 */
function error(type: keyof typeof errors): never {
  throw new RangeError(errors[type]);
}

/**
 * A generic `Array#map` utility function.
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} callback The function that gets called for every array item.
 * @returns {Array} A new array of values returned by the callback function.
 */
function map<T, U>(array: T[], callback: (item: T) => U): U[] {
  const result: U[] = [];
  let length: number = array.length;
  while (length--) {
    result[length] = callback(array[length]);
  }
  return result;
}

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email addresses.
 * @private
 * @param {String} domain The domain name or email address.
 * @param {Function} callback The function that gets called for every character.
 * @returns {String} A new string of characters returned by the callback function.
 */
function mapDomain(
  domain: string,
  callback: (label: string) => string
): string {
  const parts: string[] = domain.split("@");
  let result: string = "";
  if (parts.length > 1) {
    result = parts[0] + "@";
    domain = parts[1];
  }
  domain = domain.replace(regexSeparators, "\x2E");
  const labels: string[] = domain.split(".");
  const encoded: string = map(labels, callback).join(".");
  return result + encoded;
}

/**
 * Creates an array containing the numeric code points of each Unicode character in the string.
 * @param {String} string The Unicode input string (UCS-2).
 * @returns {Array} The new array of code points.
 */
function ucs2decode(string: string): number[] {
  const output: number[] = [];
  let counter: number = 0;
  const length: number = string.length;
  while (counter < length) {
    const value: number = string.charCodeAt(counter++);
    if (value >= 0xd800 && value <= 0xdbff && counter < length) {
      const extra: number = string.charCodeAt(counter++);
      if ((extra & 0xfc00) === 0xdc00) {
        // Low surrogate.
        output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
      } else {
        output.push(value);
        counter--;
      }
    } else {
      output.push(value);
    }
  }
  return output;
}

/**
 * Creates a string based on an array of numeric code points.
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */
const ucs2encode = (codePoints: number[]): string =>
  String.fromCodePoint(...codePoints);

/**
 * Converts a basic code point into a digit/integer.
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in representing integers) in the range `0` to `base - 1`, or `base` if the code point does not represent a value.
 */
const basicToDigit = (codePoint: number): number => {
  if (codePoint >= 0x30 && codePoint < 0x3a) {
    return 26 + (codePoint - 0x30);
  }
  if (codePoint >= 0x41 && codePoint < 0x5b) {
    return codePoint - 0x41;
  }
  if (codePoint >= 0x61 && codePoint < 0x7b) {
    return codePoint - 0x61;
  }
  return base;
};

/**
 * Converts a digit/integer into a basic code point.
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for representing integers) is `digit`, which needs to be in the range `0` to `base - 1`.
 */
const digitToBasic = (digit: number, flag: number): number => {
  return digit + 22 + 75 * (digit < 26 ? 1 : 0) - ((flag !== 0 ? 1 : 0) << 5);
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * @param {Number} delta The delta value.
 * @param {Number} numPoints The number of code points.
 * @param {Boolean} firstTime Indicates if it's the first time.
 * @returns {Number} The adapted bias.
 */
const adapt = (
  delta: number,
  numPoints: number,
  firstTime: boolean
): number => {
  let k: number = 0;
  delta = firstTime ? floor(delta / damp) : delta >> 1;
  delta += floor(delta / numPoints);
  for (
    ;
    /* no initialization */ delta > (baseMinusTMin * tMax) >> 1;
    k += base
  ) {
    delta = floor(delta / baseMinusTMin);
  }
  return floor(k + ((baseMinusTMin + 1) * delta) / (delta + skew));
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode symbols.
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */
const decode = (input: string): string => {
  const output: number[] = [];
  const inputLength: number = input.length;
  let i: number = 0;
  let n: number = initialN;
  let bias: number = initialBias;

  let basic: number = input.lastIndexOf(delimiter);
  if (basic < 0) {
    basic = 0;
  }

  for (let j = 0; j < basic; ++j) {
    if (input.charCodeAt(j) >= 0x80) {
      error("not-basic");
    }
    output.push(input.charCodeAt(j));
  }

  for (
    let index = basic > 0 ? basic + 1 : 0;
    index < inputLength /* no final expression */;

  ) {
    const oldi: number = i;
    for (let w = 1, k = base /* no condition */; ; k += base) {
      if (index >= inputLength) {
        error("invalid-input");
      }

      const digit: number = basicToDigit(input.charCodeAt(index++));
      if (digit >= base) {
        error("invalid-input");
      }
      if (digit > floor((maxInt - i) / w)) {
        error("overflow");
      }

      i += digit * w;
      const t: number = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

      if (digit < t) {
        break;
      }

      const baseMinusT: number = base - t;
      if (w > floor(maxInt / baseMinusT)) {
        error("overflow");
      }

      w *= baseMinusT;
    }

    const out: number = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);

    if (floor(i / out) > maxInt - n) {
      error("overflow");
    }

    n += floor(i / out);
    i %= out;

    output.splice(i++, 0, n);
  }

  return String.fromCodePoint(...output);
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a Punycode string of ASCII-only symbols.
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
const encode = (input: string): string => {
  const output: string[] = [];
  const decodedInput: number[] = ucs2decode(input);
  const inputLength: number = decodedInput.length;
  let n: number = initialN;
  let delta: number = 0;
  let bias: number = initialBias;

  for (const currentValue of decodedInput) {
    if (currentValue < 0x80) {
      output.push(stringFromCharCode(currentValue));
    }
  }

  const basicLength: number = output.length;
  let handledCPCount: number = basicLength;

  if (basicLength) {
    output.push(delimiter);
  }

  while (handledCPCount < inputLength) {
    let m: number = maxInt;
    for (const currentValue of decodedInput) {
      if (currentValue >= n && currentValue < m) {
        m = currentValue;
      }
    }

    const handledCPCountPlusOne: number = handledCPCount + 1;
    if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
      error("overflow");
    }

    delta += (m - n) * handledCPCountPlusOne;
    n = m;

    for (const currentValue of decodedInput) {
      if (currentValue < n && ++delta > maxInt) {
        error("overflow");
      }
      if (currentValue === n) {
        let q: number = delta;
        for (let k = base /* no condition */; ; k += base) {
          const t: number =
            k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (q < t) {
            break;
          }
          const qMinusT: number = q - t;
          const baseMinusT: number = base - t;
          output.push(
            stringFromCharCode(digitToBasic(t + (qMinusT % baseMinusT), 0))
          );
          q = floor(qMinusT / baseMinusT);
        }

        output.push(stringFromCharCode(digitToBasic(q, 0)));
        bias = adapt(
          delta,
          handledCPCountPlusOne,
          handledCPCount === basicLength
        );
        delta = 0;
        ++handledCPCount;
      }
    }

    ++delta;
    ++n;
  }
  return output.join("");
};

/**
 * Converts a Punycode string representing a domain name or an email address to Unicode.
 * @param {String} input The Punycoded domain name or email address to convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode string.
 */
const toUnicode = (input: string): string => {
  return mapDomain(input, (string) => {
    return regexPunycode.test(string)
      ? decode(string.slice(4).toLowerCase())
      : string;
  });
};

/**
 * Converts a Unicode string representing a domain name or an email address to Punycode.
 * @param {String} input The domain name or email address to convert, as a Unicode string.
 * @returns {String} The Punycode representation of the given domain name or email address.
 */
const toASCII = (input: string): string => {
  return mapDomain(input, (string) => {
    return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
  });
};

/*--------------------------------------------------------------------------*/

/** Define the public API */
const punycode = {
  version: "2.3.1",
  ucs2: {
    decode: ucs2decode,
    encode: ucs2encode,
  },
  decode: decode,
  encode: encode,
  toASCII: toASCII,
  toUnicode: toUnicode,
};

export default punycode;
