"use strict";

import formats from "./formats";
import type { defaultDecoder, defaultEncoder } from "./types";

const has = Object.prototype.hasOwnProperty;
const isArray = Array.isArray;

const hexTable: string[] = (() => {
  const array: string[] = [];
  for (let i = 0; i < 256; ++i) {
    array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
  }
  return array;
})();

const compactQueue = (queue: { obj: any; prop: string }[]) => {
  while (queue.length > 1) {
    const item = queue.pop();
    const obj = item!.obj[item!.prop];

    if (isArray(obj)) {
      const compacted: any[] = [];
      for (let j = 0; j < obj.length; ++j) {
        if (typeof obj[j] !== "undefined") {
          compacted.push(obj[j]);
        }
      }
      item!.obj[item!.prop] = compacted;
    }
  }
};

const arrayToObject = (
  source: Array<any>,
  options?: { plainObjects?: boolean }
): { [key: string]: any } => {
  const obj: { [key: number]: any } =
    options && options.plainObjects ? Object.create(null) : {};
  for (let i = 0; i < source.length; ++i) {
    if (typeof source[i] !== "undefined") {
      obj[i] = source[i];
    }
  }
  return obj;
};

const merge = (
  target: any,
  source: any,
  options?: { plainObjects?: boolean; allowPrototypes?: boolean }
): any => {
  if (!source) {
    return target;
  }

  if (typeof source !== "object" && typeof source !== "function") {
    if (isArray(target)) {
      target.push(source);
    } else if (target && typeof target === "object") {
      if (
        (options && (options.plainObjects || options.allowPrototypes)) ||
        !has.call(Object.prototype, source)
      ) {
        target[source] = true;
      }
    } else {
      return [target, source];
    }
    return target;
  }

  if (!target || typeof target !== "object") {
    return [target].concat(source);
  }

  let mergeTarget = target;
  if (isArray(target) && !isArray(source)) {
    mergeTarget = arrayToObject(target, options);
  }

  if (isArray(target) && isArray(source)) {
    source.forEach((item, i) => {
      if (has.call(target, i)) {
        const targetItem = target[i];
        if (
          targetItem &&
          typeof targetItem === "object" &&
          item &&
          typeof item === "object"
        ) {
          target[i] = merge(targetItem, item, options);
        } else {
          target.push(item);
        }
      } else {
        target[i] = item;
      }
    });
    return target;
  }

  return Object.keys(source).reduce((acc, key) => {
    const value = source[key];
    if (has.call(acc, key)) {
      acc[key] = merge(acc[key], value, options);
    } else {
      acc[key] = value;
    }
    return acc;
  }, mergeTarget);
};

const assign = (
  target: Record<string, any>,
  source: Record<string, any>
): Record<string, any> => {
  return Object.keys(source).reduce((acc: Record<string, any>, key: string) => {
    acc[key] = source[key];
    return acc;
  }, target);
};

const decode = (
  str: string,
  defaultDecoder: defaultDecoder,
  charset?: string,
  type?: "key" | "value"
): string => {
  const strWithoutPlus = str.replace(/\+/g, " ");

  if (charset === "iso-8859-1") {
    // unescape never throws, no try...catch needed:
    return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
  }

  // utf-8
  try {
    return decodeURIComponent(strWithoutPlus);
  } catch (e) {
    return strWithoutPlus;
  }
};

const limit = 1024;

const encode = (
  str: string | symbol,
  defaultEncoder?: defaultEncoder,
  charset?: string,
  kind?: string,
  format?: string
): string => {
  if (typeof str === "string") {
    if (str.length === 0) {
      return str;
    }
  }

  let string = str;
  if (typeof str === "symbol") {
    string = Symbol.prototype.toString.call(str);
  } else if (typeof str !== "string") {
    string = String(str);
  }

  if (charset === "iso-8859-1") {
    return escape(string as string).replace(/%u[0-9a-f]{4}/gi, ($0) => {
      return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
    });
  }

  let out = "";
  for (let j = 0; j < (string as string).length; j += limit) {
    const segment =
      (string as string).length >= limit
        ? (string as string).slice(j, j + limit)
        : (string as string);
    const arr: string[] = [];

    for (let i = 0; i < segment.length; ++i) {
      let c: any = segment.charCodeAt(i);
      if (
        c === 0x2d || // -
        c === 0x2e || // .
        c === 0x5f || // _
        c === 0x7e || // ~
        (c >= 0x30 && c <= 0x39) || // 0-9
        (c >= 0x41 && c <= 0x5a) || // A-Z
        (c >= 0x61 && c <= 0x7a) || // a-z
        (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
      ) {
        arr[arr.length] = segment.charAt(i);
        continue;
      }

      if (c < 0x80) {
        arr[arr.length] = hexTable[c];
        continue;
      }

      if (c < 0x800) {
        arr[arr.length] =
          hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)];
        continue;
      }

      if (c < 0xd800 || c >= 0xe000) {
        arr[arr.length] =
          hexTable[0xe0 | (c >> 12)] +
          hexTable[0x80 | ((c >> 6) & 0x3f)] +
          hexTable[0x80 | (c & 0x3f)];
        continue;
      }

      i += 1;
      c = 0x10000 + (((c & 0x3ff) << 10) | (segment.charCodeAt(i) & 0x3ff));
      arr[arr.length] =
        hexTable[0xf0 | (c >> 18)] +
        hexTable[0x80 | ((c >> 12) & 0x3f)] +
        hexTable[0x80 | ((c >> 6) & 0x3f)] +
        hexTable[0x80 | (c & 0x3f)];
    }

    out += arr.join("");
  }

  return out;
};

const compact = (value: { [key: string]: any }): { [key: string]: any } => {
  const queue = [{ obj: { o: value }, prop: "o" }];
  const refs: any[] = [];

  for (let i = 0; i < queue.length; ++i) {
    const item = queue[i];
    const obj = item.obj[item.prop];

    const keys = Object.keys(obj);
    for (let j = 0; j < keys.length; ++j) {
      const key = keys[j];
      const val = obj[key];
      if (typeof val === "object" && val !== null && refs.indexOf(val) === -1) {
        queue.push({ obj: obj, prop: key });
        refs.push(val);
      }
    }
  }

  compactQueue(queue);
  return value;
};

const isRegExp = (obj: unknown): obj is RegExp => {
  return Object.prototype.toString.call(obj) === "[object RegExp]";
};

const isBuffer = (obj: unknown): boolean => {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  return !!(
    (obj as { constructor?: { isBuffer?: (obj: unknown) => boolean } })
      .constructor &&
    (obj as { constructor: { isBuffer: (obj: unknown) => boolean } })
      .constructor.isBuffer &&
    (
      obj as { constructor: { isBuffer: (obj: unknown) => boolean } }
    ).constructor.isBuffer(obj)
  );
};

const combine = (a: any[], b: any[]): any[] => {
  return [].concat(a, b);
};

const maybeMap = <T, U>(val: T | T[], fn: (item: T) => U): U[] | U => {
  if (isArray(val)) {
    const mapped: U[] = [];
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]));
    }
    return mapped;
  }
  return fn(val);
};

export default {
  arrayToObject,
  assign,
  combine,
  compact,
  decode,
  encode,
  isBuffer,
  isRegExp,
  maybeMap,
  merge,
};
