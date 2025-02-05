/*
 * @author   SSE World <http://sseworld.github.io/>
 * @license  MIT
 */

"use strict";

const replace = String.prototype.replace;
const percentTwenties = /%20/g;

export enum Format {
  RFC1738 = "RFC1738",
  RFC3986 = "RFC3986",
}

interface Formatters {
  RFC1738: (value: string) => string;
  RFC3986: (value: string) => string;
}

const formatters: Formatters = {
  RFC1738: (value: string) => {
    return replace.call(value, percentTwenties, "+");
  },
  RFC3986: (value: string) => {
    return String(value);
  },
};

export default {
  default: Format.RFC3986,
  formatters,
  RFC1738: Format.RFC1738,
  RFC3986: Format.RFC3986,
};
