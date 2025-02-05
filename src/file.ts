import Blob from "./blob";
import { BinaryLike } from "./types";

export interface FileOptions {
  /**
   * One of either `'transparent'` or `'native'`. When set to `'native'`, line endings in string source parts will be
   * converted to the platform native line-ending as specified by `import { EOL } from 'node:os'`.
   */
  endings?: "native" | "transparent";

  /** The File content-type. */
  type?: string;

  /** The last modified date of the file. `Default`: Date.now(). */
  lastModified?: number;
}

/**
 * A [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) provides information about files.
 * @since v19.2.0, v18.13.0
 */
export class File extends Blob {
  /**
   * The name of the `File`.
   * @since v19.2.0, v18.13.0
   */
  readonly name: string;
  /**
   * The last modified date of the `File`.
   * @since v19.2.0, v18.13.0
   */
  readonly lastModified: FileOptions["lastModified"];

  constructor(
    sources: Array<BinaryLike | Blob>,
    fileName: string,
    options?: FileOptions
  ) {
    super(sources, options);
    this.name = fileName;
    this.lastModified = options?.lastModified || Date.now();
  }
}

export default File