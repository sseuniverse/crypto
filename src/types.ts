export type BinaryToTextEncoding = "base64" | "base64url" | "hex" | "binary";
export type CharacterEncoding =
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "utf-16le"
  | "latin1";
export type LegacyCharacterEncoding = "ascii" | "binary" | "ucs2" | "ucs-2";
export type Encoding =
  | BinaryToTextEncoding
  | CharacterEncoding
  | LegacyCharacterEncoding;
export type ECDHKeyFormat = "compressed" | "uncompressed" | "hybrid";
export type BinaryLike = string | NodeJS.ArrayBufferView;
export type BufferEncoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "utf-16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex";