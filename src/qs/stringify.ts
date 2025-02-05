/*
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */

"use strict";

import getSideChannel from "side-channel";
import utils from "./utils";
import formats, { Format } from "./formats";
import {
  BooleanOptional,
  IStringifyOptions as SSEIStringifyOptions,
} from "./types";

// Props
const has = Object.prototype.hasOwnProperty;
const isArray = Array.isArray;
const push = Array.prototype.push;
const toISO = Date.prototype.toISOString;
const defaultFormat = formats["default"];
const sentinel = Symbol("sentinel");

// Types
type ArrayPrefixGenerator = {
  brackets: (prefix: string) => string;
  comma: string;
  indices: (prefix: string, key: string) => string;
  repeat: (prefix: string) => string;
};

const defaults: SSEIStringifyOptions<BooleanOptional> = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: "indices",
  charset: "utf-8",
  charsetSentinel: false,
  commaRoundTrip: false,
  delimiter: "&",
  encode: true,
  encodeDotInKeys: false,
  encoder: utils.encode,
  encodeValuesOnly: false,
  filter: void undefined,
  format: defaultFormat,
  // @ts-ignore
  formatter: formats.formatters[defaultFormat],
  // deprecated
  indices: false,
  serializeDate: function serializeDate(date) {
    return toISO.call(date);
  },
  skipNulls: false,
  strictNullHandling: false,
};

// Codes
const arrayPrefixGenerators: ArrayPrefixGenerator = {
  brackets: function (prefix: string): string {
    return prefix + "[]";
  },
  comma: "comma",
  indices: function (prefix: string, key: string): string {
    return prefix + "[" + key + "]";
  },
  repeat: function (prefix: string): string {
    return prefix;
  },
};

const pushToArray = <T>(arr: T[], valueOrArray: T | T[]): void => {
  // Use the spread operator to push values into the array
  arr.push(...(isArray(valueOrArray) ? valueOrArray : [valueOrArray]));
};

const isNonNullishPrimitive = (v: unknown): boolean => {
  return (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean" ||
    typeof v === "symbol" ||
    typeof v === "bigint"
  );
};

const stringify4 = (
  object: any,
  prefix: string,
  generateArrayPrefix: "indices" | "brackets" | "repeat" | "comma" | undefined,
  commaRoundTrip: boolean | undefined,
  allowEmptyArrays: boolean | undefined,
  strictNullHandling: boolean | undefined,
  skipNulls: boolean | undefined,
  encodeDotInKeys: boolean | undefined,
  encoder:
    | ((
        str: any,
        defaultEncoder: any,
        charset: string,
        type: "key" | "value"
      ) => string)
    | undefined,
  filter:
    | Array<string | number>
    | ((prefix: string, value: any) => any)
    | undefined,
  sort: ((a: string, b: string) => number) | undefined,
  allowDots: boolean | undefined,
  serializeDate: ((d: Date) => string) | undefined,
  format: "RFC1738" | "RFC3986" | undefined,
  formatter: (str: string) => string,
  encodeValuesOnly: boolean | undefined,
  charset: "utf-8" | "iso-8859-1" | undefined,
  sideChannel: any // Assuming sideChannel is of any type
): string[] => {
  let obj = object;

  let tmpSc = sideChannel;
  let step = 0;
  let findFlag = false;

  while ((tmpSc = tmpSc.get(sentinel)) !== void 0 && !findFlag) {
    // Where object last appeared in the ref tree
    const pos = tmpSc.get(object);
    step += 1;
    if (typeof pos !== "undefined") {
      if (pos === step) {
        throw new RangeError("Cyclic object value");
      } else {
        findFlag = true; // Break while
      }
    }
    if (typeof tmpSc.get(sentinel) === "undefined") {
      step = 0;
    }
  }

  if (typeof filter === "function") {
    obj = filter(prefix, obj);
  } else if (obj instanceof Date) {
    obj = serializeDate ? serializeDate(obj) : obj;
  } else if (generateArrayPrefix === "comma" && isArray(obj)) {
    obj = utils.maybeMap(obj, (value: any) => {
      if (value instanceof Date) {
        return serializeDate ? serializeDate(value) : value;
      }
      return value;
    });
  }

  if (obj === null) {
    if (strictNullHandling) {
      return encoder && !encodeValuesOnly
        ? [encoder(prefix, defaults.encoder, charset, "key")]
        : [prefix];
    }
    obj = "";
  }

  if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
    if (encoder) {
      const keyValue = encodeValuesOnly
        ? prefix
        : encoder(prefix, defaults.encoder, charset, "key");
      return [
        `${formatter(keyValue)}=${formatter(
          encoder(obj, defaults.encoder, charset, "value")
        )}`,
      ];
    }
    return [`${formatter(prefix)}=${formatter(String(obj))}`];
  }

  const values: string[] = [];

  if (typeof obj === "undefined") {
    return values;
  }

  let objKeys;
  if (generateArrayPrefix === "comma" && isArray(obj)) {
    // we need to join elements in
    if (encodeValuesOnly && encoder) {
      // obj = utils.maybeMap(obj, encoder);
      obj = utils.maybeMap(obj, (value: any) =>
        encoder(value, defaults.encoder, charset, "value")
      );
    }
    objKeys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
  } else if (isArray(filter)) {
    objKeys = filter;
  } else {
    const keys = Object.keys(obj);
    objKeys = sort ? keys.sort(sort) : keys;
  }

  const encodedPrefix = encodeDotInKeys
    ? String(prefix).replace(/\./g, "%2E")
    : String(prefix);
  const adjustedPrefix =
    commaRoundTrip && isArray(obj) && obj.length === 1
      ? `${encodedPrefix}[]`
      : encodedPrefix;

  if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
    return [`${adjustedPrefix}[]`];
  }

  for (let j = 0; j < objKeys.length; ++j) {
    const key = objKeys[j];
    const value =
      typeof key === "object" && key && typeof key.value !== "undefined"
        ? key.value
        : obj[key];

    if (skipNulls && value === null) {
      continue;
    }

    const encodedKey =
      allowDots && encodeDotInKeys
        ? String(key).replace(/\./g, "%2E")
        : String(key);
    const keyPrefix = isArray(obj)
      ? typeof generateArrayPrefix === "function" &&
        generateArrayPrefix !== null
        ? (generateArrayPrefix as (prefix: string, key: string) => string)(
            adjustedPrefix,
            encodedKey
          )
        : adjustedPrefix
      : `${adjustedPrefix}${
          allowDots ? "." + encodedKey : "[" + encodedKey + "]"
        }`;

    sideChannel.set(object, step);
    const valueSideChannel = getSideChannel();
    valueSideChannel.set(sentinel, sideChannel);
    values.push(
      ...stringify4(
        value,
        keyPrefix,
        generateArrayPrefix,
        commaRoundTrip,
        allowEmptyArrays,
        strictNullHandling,
        skipNulls,
        encodeDotInKeys,
        generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj)
          ? null
          : encoder,
        filter,
        sort,
        allowDots,
        serializeDate,
        format,
        formatter,
        encodeValuesOnly,
        charset,
        valueSideChannel
      )
    );
  }

  return values;
};

const normalizeStringifyOptions = (
  opts?: SSEIStringifyOptions<BooleanOptional>
): SSEIStringifyOptions<BooleanOptional> => {
  if (!opts) return defaults;

  if (
    typeof opts.allowEmptyArrays !== "undefined" &&
    typeof opts.allowEmptyArrays !== "boolean"
  ) {
    throw new TypeError(
      "`allowEmptyArrays` option can only be `true` or `false`, when provided"
    );
  }

  if (
    typeof opts.encodeDotInKeys !== "undefined" &&
    typeof opts.encodeDotInKeys !== "boolean"
  ) {
    throw new TypeError(
      "`encodeDotInKeys` option can only be `true` or `false`, when provided"
    );
  }

  if (
    opts.encoder !== null &&
    typeof opts.encoder !== "undefined" &&
    typeof opts.encoder !== "function"
  ) {
    throw new TypeError("Encoder has to be a function.");
  }

  const charset = opts.charset || defaults.charset;
  if (
    typeof opts.charset !== "undefined" &&
    opts.charset !== "utf-8" &&
    opts.charset !== "iso-8859-1"
  ) {
    throw new TypeError(
      "The charset option must be either utf-8, iso-8859-1, or undefined"
    );
  }

  let format = formats["default"];
  if (typeof opts.format !== "undefined") {
    if (!(opts.format in formats.formatters)) {
      throw new TypeError("Unknown format option provided.");
    }
    format = opts.format as Format;
  }
  const formatter = formats.formatters[format];

  let filter = defaults.filter;
  if (typeof opts.filter === "function" || isArray(opts.filter)) {
    filter = opts.filter;
  }

  let arrayFormat: "indices" | "brackets" | "repeat" | "comma";
  if (opts.arrayFormat in arrayPrefixGenerators) {
    arrayFormat = opts.arrayFormat;
  } else if ("indices" in opts) {
    arrayFormat = opts.indices ? "indices" : "repeat";
  } else {
    arrayFormat = defaults.arrayFormat;
  }

  if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
    throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
  }

  const allowDots =
    typeof opts.allowDots === "undefined"
      ? opts.encodeDotInKeys === true
        ? true
        : defaults.allowDots
      : !!opts.allowDots;

  return {
    addQueryPrefix:
      typeof opts.addQueryPrefix === "boolean"
        ? opts.addQueryPrefix
        : defaults.addQueryPrefix,
    allowDots: allowDots,
    allowEmptyArrays:
      typeof opts.allowEmptyArrays === "boolean"
        ? !!opts.allowEmptyArrays
        : defaults.allowEmptyArrays,
    arrayFormat: arrayFormat,
    charset: charset,
    charsetSentinel:
      typeof opts.charsetSentinel === "boolean"
        ? opts.charsetSentinel
        : defaults.charsetSentinel,
    commaRoundTrip: !!opts.commaRoundTrip,
    delimiter:
      typeof opts.delimiter === "undefined"
        ? defaults.delimiter
        : opts.delimiter,
    encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
    encodeDotInKeys:
      typeof opts.encodeDotInKeys === "boolean"
        ? opts.encodeDotInKeys
        : defaults.encodeDotInKeys,
    encoder:
      typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
    encodeValuesOnly:
      typeof opts.encodeValuesOnly === "boolean"
        ? opts.encodeValuesOnly
        : defaults.encodeValuesOnly,
    filter: filter,
    format: format,
    // @ts-ignore
    formatter: formatter,
    serializeDate:
      typeof opts.serializeDate === "function"
        ? opts.serializeDate
        : defaults.serializeDate,
    skipNulls:
      typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
    sort: typeof opts.sort === "function" ? opts.sort : null,
    strictNullHandling:
      typeof opts.strictNullHandling === "boolean"
        ? opts.strictNullHandling
        : defaults.strictNullHandling,
  };
};

export default function (
  obj: any,
  option?: SSEIStringifyOptions<BooleanOptional>
): string {
  const options = normalizeStringifyOptions(option);
  let objKeys;
  let filter;
  let keys: string[] = [];

  if (typeof options.filter === "function") {
    filter = options.filter;
    obj = filter("", obj);
  } else if (isArray(options.filter)) {
    filter = options.filter;
    objKeys = filter;
  }

  if (typeof obj !== "object" || obj === null) {
    return "";
  }

  const generateArrayPrefix = options.arrayFormat as "indices" | "brackets" | "repeat" | "comma";
  const commaRoundTrip =
    generateArrayPrefix === "comma" && options.commaRoundTrip;

  if (!objKeys) {
    objKeys = Object.keys(obj);
  }

  if (options.sort) {
    objKeys.sort(options.sort);
  }

  const sideChannel = getSideChannel();
  for (let i = 0; i < objKeys.length; ++i) {
    const key = objKeys[i];
    const value = obj[key];

    if (options.skipNulls && value === null) continue;
    pushToArray(
      key,
      stringify4(
        value,
        key,
        generateArrayPrefix,
        commaRoundTrip,
        options.allowEmptyArrays,
        options.strictNullHandling,
        options.skipNulls,
        options.encodeDotInKeys,
        options.encode ? options.encoder : null,
        options.filter,
        options.sort,
        options.allowDots,
        options.serializeDate,
        options.format,
        // @ts-ignore
        options.formatter,
        options.encodeValuesOnly,
        options.charset,
        sideChannel
      )
    );
  }

  const joined = keys.join(options.delimiter);
  let prefix = options.addQueryPrefix === true ? "?" : "";

  if (options.charsetSentinel) {
    if (options.charset === "iso-8859-1") {
      // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
      prefix += "utf8=%26%2310003%3B&";
    } else {
      // encodeURIComponent('✓')
      prefix += "utf8=%E2%9C%93&";
    }
  }

  return joined.length > 0 ? prefix + joined : "";
}
