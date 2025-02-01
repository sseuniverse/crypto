"use strict";

import utils from "./utils";
import { IParseOptions, BooleanOptional, ParsedQs } from "./types";

const has = Object.prototype.hasOwnProperty;
const isArray = Array.isArray;
const isoSentinel = "utf8=%26%2310003%3B";
const charsetSentinel = "utf8=%E2%9C%93";

const defaults: IParseOptions<BooleanOptional> = {
  allowDots: false,
  allowEmptyArrays: false,
  allowPrototypes: false,
  allowSparse: false,
  arrayLimit: 20,
  charset: "utf-8",
  charsetSentinel: false,
  comma: false,
  decodeDotInKeys: false,
  decoder: utils.decode,
  delimiter: "&",
  depth: 5,
  duplicates: "combine",
  ignoreQueryPrefix: false,
  interpretNumericEntities: false,
  parameterLimit: 1000,
  parseArrays: true,
  plainObjects: false,
  strictDepth: false,
  strictNullHandling: false,
  throwOnLimitExceeded: false,
};

const interpretNumericEntities = (str: string): string => {
  return str.replace(/&#(\d+);/g, (_, numberStr: string) => {
    return String.fromCharCode(parseInt(numberStr, 10));
  });
};

const parseArrayValue = (
  val: any,
  options: IParseOptions,
  currentArrayLength: number
): any => {
  if (
    val &&
    typeof val === "string" &&
    options.comma &&
    val.indexOf(",") > -1
  ) {
    return val.split(",");
  }

  if (
    options.throwOnLimitExceeded &&
    currentArrayLength >= options.arrayLimit
  ) {
    throw new RangeError(
      "Array limit exceeded. Only " +
        options.arrayLimit +
        " element" +
        (options.arrayLimit === 1 ? "" : "s") +
        " allowed in an array."
    );
  }
  return val;
};

const parseValues = (
  str: string,
  options: IParseOptions<BooleanOptional>
): Record<string, any> => {
  const obj: Record<string, any> = { __proto__: null };
  let cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, "") : str;
  cleanStr = cleanStr.replace(/%5B/gi, "[").replace(/%5D/gi, "]");

  const limit =
    options.parameterLimit === Infinity ? undefined : options.parameterLimit;
  const parts = cleanStr.split(
    options.delimiter,
    options.throwOnLimitExceeded ? limit + 1 : limit
  );

  if (options.throwOnLimitExceeded && parts.length > limit) {
    throw new RangeError(
      "Parameter limit exceeded. Only " +
        limit +
        " parameter" +
        (limit === 1 ? "" : "s") +
        " allowed."
    );
  }

  let skipIndex = -1;
  let i: number;

  let charset = options.charset || "utf-8";
  if (options.charsetSentinel) {
    for (i = 0; i < parts.length; ++i) {
      if (parts[i].indexOf("utf8=") === 0) {
        if (parts[i] === "utf8=1") {
          charset = "utf-8";
        } else if (parts[i] === "iso=1") {
          charset = "iso-8859-1";
        }
        skipIndex = i;
        i = parts.length;
      }
    }
  }

  for (i = 0; i < parts.length; ++i) {
    if (i === skipIndex) {
      continue;
    }
    const part = parts[i];

    const bracketEqualsPos = part.indexOf("]=");
    const pos =
      bracketEqualsPos === -1 ? part.indexOf("=") : bracketEqualsPos + 1;

    let key: string;
    let val: any;
    if (pos === -1) {
      // @ts-ignore
      key = options.decoder(part, defaults.decoder, charset, "key");
      val = options.strictNullHandling ? null : "";
    } else {
      key = options.decoder(
        part.slice(0, pos),
        // @ts-ignore
        defaults.decoder,
        charset,
        "key"
      );

      val = parseArrayValue(
        part.slice(pos + 1),
        // @ts-ignore
        options,
        Array.isArray(obj[key]) ? obj[key].length : 0
      );
    }

    if (val && options.interpretNumericEntities && charset === "iso-8859-1") {
      val = interpretNumericEntities(String(val));
    }

    if (part.indexOf("[]=") > -1) {
      val = Array.isArray(val) ? [val] : val;
    }

    const existing = Object.prototype.hasOwnProperty.call(obj, key);
    if (existing && options.duplicates === "combine") {
      obj[key] = utils.combine(obj[key], val);
    } else if (!existing || options.duplicates === "last") {
      obj[key] = val;
    }
  }

  return obj;
};

const parseObject = (
  chain: string[],
  val: any,
  options: IParseOptions,
  valuesParsed: boolean
): any => {
  let currentArrayLength = 0;
  if (chain.length > 0 && chain[chain.length - 1] === "[]") {
    const parentKey = chain.slice(0, -1).join("");
    currentArrayLength =
      Array.isArray(val) && val[parentKey] ? val[parentKey].length : 0;
  }

  let leaf = valuesParsed
    ? val
    : parseArrayValue(val, options, currentArrayLength);

  for (let i = chain.length - 1; i >= 0; --i) {
    let obj: any;
    const root = chain[i];

    if (root === "[]" && options.parseArrays) {
      obj =
        options.allowEmptyArrays &&
        (leaf === "" || (options.strictNullHandling && leaf === null))
          ? []
          : utils.combine([], leaf);
    } else {
      obj = options.plainObjects ? { __proto__: null } : {};
      const cleanRoot =
        root.charAt(0) === "[" && root.charAt(root.length - 1) === "]"
          ? root.slice(1, -1)
          : root;
      const decodedRoot = options.decodeDotInKeys
        ? cleanRoot.replace(/%2E/g, ".")
        : cleanRoot;
      const index = parseInt(decodedRoot, 10);
      if (!options.parseArrays && decodedRoot === "") {
        obj = { 0: leaf };
      } else if (
        !isNaN(index) &&
        root !== decodedRoot &&
        String(index) === decodedRoot &&
        index >= 0 &&
        options.parseArrays &&
        index <= options.arrayLimit
      ) {
        obj = [];
        obj[index] = leaf;
      } else if (decodedRoot !== "__proto__") {
        obj[decodedRoot] = leaf;
      }
    }

    leaf = obj;
  }

  return leaf;
};

const parseKeys = (
  givenKey: string,
  val: any,
  options: IParseOptions,
  valuesParsed: boolean
): any => {
  if (!givenKey) {
    return;
  }

  const key = options.allowDots
    ? givenKey.replace(/\.([^.[]+)/g, "[$1]")
    : givenKey;

  const brackets = /(\[[^[\]]*])/;
  const child = /(\[[^[\]]*])/g;

  let segment =
    typeof options.depth === "number" &&
    options.depth > 0 &&
    brackets.exec(key);

  const parent = segment ? key.slice(0, segment.index) : key;

  const keys: string[] = [];
  if (parent) {
    if (!options.plainObjects && has.call(Object.prototype, parent)) {
      if (!options.allowPrototypes) {
        return;
      }
    }

    keys.push(parent);
  }

  let i = 0;
  while (
    typeof options.depth === "number" &&
    options.depth > 0 &&
    (segment = child.exec(key)) !== null &&
    i < options.depth
  ) {
    i += 1;
    if (
      !options.plainObjects &&
      Object.prototype.hasOwnProperty.call(
        Object.prototype,
        segment[1].slice(1, -1)
      )
    ) {
      if (!options.allowPrototypes) {
        return;
      }
    }
    keys.push(segment[1]);
  }

  if (segment) {
    if (options.strictDepth === true) {
      throw new RangeError(
        "Input depth exceeded depth option of " +
          options.depth +
          " and strictDepth is true"
      );
    }
    keys.push("[" + key.slice(segment.index) + "]");
  }

  return parseObject(keys, val, options, valuesParsed);
};

const normalizeParseOptions = (
  opts?: IParseOptions<BooleanOptional>
): IParseOptions<BooleanOptional> => {
  if (!opts) {
    return defaults;
  }

  if (
    typeof opts.allowEmptyArrays !== "undefined" &&
    typeof opts.allowEmptyArrays !== "boolean"
  ) {
    throw new TypeError(
      "`allowEmptyArrays` option can only be `true` or `false`, when provided"
    );
  }

  if (
    typeof opts.decodeDotInKeys !== "undefined" &&
    typeof opts.decodeDotInKeys !== "boolean"
  ) {
    throw new TypeError(
      "`decodeDotInKeys` option can only be `true` or `false`, when provided"
    );
  }

  if (
    opts.decoder !== null &&
    typeof opts.decoder !== "undefined" &&
    typeof opts.decoder !== "function"
  ) {
    throw new TypeError("Decoder has to be a function.");
  }

  if (
    typeof opts.charset !== "undefined" &&
    opts.charset !== "utf-8" &&
    opts.charset !== "iso-8859-1"
  ) {
    throw new TypeError(
      "The charset option must be either utf-8, iso-8859-1, or undefined"
    );
  }

  if (
    typeof opts.throwOnLimitExceeded !== "undefined" &&
    typeof opts.throwOnLimitExceeded !== "boolean"
  ) {
    throw new TypeError("`throwOnLimitExceeded` option must be a boolean");
  }

  const charset =
    typeof opts.charset === "undefined" ? defaults.charset : opts.charset;

  const duplicates =
    typeof opts.duplicates === "undefined"
      ? defaults.duplicates
      : opts.duplicates;

  if (
    duplicates !== "combine" &&
    duplicates !== "first" &&
    duplicates !== "last"
  ) {
    throw new TypeError(
      "The duplicates option must be either combine, first, or last"
    );
  }

  const allowDots =
    opts.allowDots === true || typeof opts.allowDots === "undefined"
      ? true
      : undefined;

  return {
    allowDots,
    allowEmptyArrays:
      typeof opts.allowEmptyArrays === "boolean"
        ? !!opts.allowEmptyArrays
        : defaults.allowEmptyArrays,
    allowPrototypes:
      typeof opts.allowPrototypes === "boolean"
        ? opts.allowPrototypes
        : defaults.allowPrototypes,
    allowSparse:
      typeof opts.allowSparse === "boolean"
        ? opts.allowSparse
        : defaults.allowSparse,
    arrayLimit:
      typeof opts.arrayLimit === "number"
        ? opts.arrayLimit
        : defaults.arrayLimit,
    charset,
    charsetSentinel:
      typeof opts.charsetSentinel === "boolean"
        ? opts.charsetSentinel
        : defaults.charsetSentinel,
    comma: typeof opts.comma === "boolean" ? opts.comma : defaults.comma,
    decodeDotInKeys:
      typeof opts.decodeDotInKeys === "boolean"
        ? opts.decodeDotInKeys
        : defaults.decodeDotInKeys,
    decoder:
      typeof opts.decoder === "function" ? opts.decoder : defaults.decoder,
    delimiter:
      typeof opts.delimiter === "string" || opts.delimiter instanceof RegExp
        ? opts.delimiter
        : defaults.delimiter,
    depth:
      typeof opts.depth === "number" || opts.depth === false
        ? +opts.depth
        : defaults.depth,
    duplicates,
    ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
    interpretNumericEntities:
      typeof opts.interpretNumericEntities === "boolean"
        ? opts.interpretNumericEntities
        : defaults.interpretNumericEntities,
    parameterLimit:
      typeof opts.parameterLimit === "number"
        ? opts.parameterLimit
        : defaults.parameterLimit,
    parseArrays: opts.parseArrays !== false,
    plainObjects:
      typeof opts.plainObjects === "boolean"
        ? opts.plainObjects
        : defaults.plainObjects,
    strictDepth:
      typeof opts.strictDepth === "boolean"
        ? !!opts.strictDepth
        : defaults.strictDepth,
    strictNullHandling:
      typeof opts.strictNullHandling === "boolean"
        ? opts.strictNullHandling
        : defaults.strictNullHandling,
    throwOnLimitExceeded:
      typeof opts.throwOnLimitExceeded === "boolean"
        ? opts.throwOnLimitExceeded
        : false,
  };
};

export default function (
  str: string,
  opts?: IParseOptions<BooleanOptional> & { decoder?: never | undefined }
): ParsedQs;
export default function (
  str: string | Record<string, string>,
  opts?: IParseOptions<BooleanOptional>
): { [key: string]: unknown } {
  const options = normalizeParseOptions(opts);

  if (str === "" || str === null || typeof str === "undefined") {
    return options.plainObjects ? { __proto__: null } : {};
  }

  const tempObj = typeof str === "string" ? parseValues(str, options) : str;
  let obj = options.plainObjects ? { __proto__: null } : {};

  const keys = Object.keys(tempObj);
  for (var i = 0; i < keys.length; ++i) {
    var key = keys[i];
    // @ts-ignore
    var newObj = parseKeys(key, tempObj[key], options, typeof str === "string");
    obj = utils.merge(obj, newObj, options);
  }

  if (options.allowSparse === true) return obj
  return utils.compact(obj)
}
