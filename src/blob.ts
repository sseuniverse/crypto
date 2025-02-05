import { BinaryLike } from "./types";

export interface BlobOptions {
  /**
   * One of either `'transparent'` or `'native'`. When set to `'native'`, line endings in string source parts
   * will be converted to the platform native line-ending as specified by `import { EOL } from 'node:os'`.
   */
  endings?: "transparent" | "native";
  /**
   * The Blob content-type. The intent is for `type` to convey
   * the MIME media type of the data, however no validation of the type format
   * is performed.
   */
  type?: string | undefined;
}

/**
 * A [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) encapsulates immutable, raw data that can be safely shared across
 * multiple worker threads.
 * @since v15.7.0, v14.18.0
 */
export class Blob {
  /**
   * The total size of the `Blob` in bytes.
   * @since v15.7.0, v14.18.0
   */
  readonly size: number;
  /**
   * The content-type of the `Blob`.
   * @since v15.7.0, v14.18.0
   */
  readonly type: BlobOptions["type"];
  readonly endings: BlobOptions["endings"];
  private _data: Uint8Array;
  /**
   * Creates a new `Blob` object containing a concatenation of the given sources.
   *
   * {ArrayBuffer}, {TypedArray}, {DataView}, and {Buffer} sources are copied into
   * the 'Blob' and can therefore be safely modified after the 'Blob' is created.
   *
   * String sources are also copied into the `Blob`.
   */
  constructor(
    sources: Array<ArrayBuffer | BinaryLike | Blob>,
    options?: BlobOptions
  ) {
    this.size = 0;
    this.type = options.type || "";
    this._data = new Uint8Array(0);

    const dataArray: Uint8Array[] = [];

    // Process sources
    for (const source of sources) {
      if (source instanceof ArrayBuffer) {
        const uint8Array = new Uint8Array(source);
        dataArray.push(uint8Array);
        this.size += uint8Array.length;
      } else if (ArrayBuffer.isView(source)) {
        const uint8Array = new Uint8Array(
          source.buffer,
          source.byteOffset,
          source.byteLength
        );
        dataArray.push(uint8Array);
        this.size += uint8Array.length;
      } else if (source instanceof Blob) {
        dataArray.push(source._data);
        this.size += source.size;
      } else if (typeof source === "string") {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(source);
        dataArray.push(encoded);
        this.size += encoded.length;
      }
    }

    // Flatten the data array
    this._data = new Uint8Array(this.size);
    let offset = 0;
    for (const arr of dataArray) {
      this._data.set(arr, offset);
      offset += arr.length;
    }
  }
  /**
   * Returns a promise that fulfills with an [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) containing a copy of
   * the `Blob` data.
   * @since v15.7.0, v14.18.0
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this._data.buffer.slice(0);
  }

  /**
   * The `blob.bytes()` method returns the byte of the `Blob` object as a `Promise<Uint8Array>`.
   *
   * ```js
   * const blob = new Blob(['hello']);
   * blob.bytes().then((bytes) => {
   *   console.log(bytes); // Outputs: Uint8Array(5) [ 104, 101, 108, 108, 111 ]
   * });
   * ```
   */
  async bytes(): Promise<Uint8Array> {
    return this._data;
  }
  /**
   * Creates and returns a new `Blob` containing a subset of this `Blob` objects
   * data. The original `Blob` is not altered.
   * @since v15.7.0, v14.18.0
   * @param start The starting index.
   * @param end The ending index.
   * @param type The content-type for the new `Blob`
   */
  slice(start?: number, end?: number, type?: BlobOptions["type"]): Blob {
    const sliceData = this._data.slice(start, end);
    return new Blob([sliceData], { type });
  }
  /**
   * Returns a promise that fulfills with the contents of the `Blob` decoded as a
   * UTF-8 string.
   * @since v15.7.0, v14.18.0
   */
  async text(): Promise<string> {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(this._data);
  }
  /**
   * Returns a new `ReadableStream` that allows the content of the `Blob` to be read.
   * @since v16.7.0
   */
  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(this._data);
        controller.close();
      },
    });
  }
}

export default Blob;
