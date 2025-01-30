import { BinaryLike } from "crypto";
import { BinaryToTextEncoding } from "./hmac";

// Define options for the Hash class
interface HashOptions {
  // Define any options you want to include
  outputLength?: number;
}

// Define the Hash class
export class Hash {
  private data: BinaryLike[] = [];
  private isDigestCalled: boolean = false;
  private algorithm: string;
  private options?: HashOptions;

  // Private constructor to prevent direct instantiation
  constructor(algorithm: string, options?: HashOptions) {
    this.algorithm = algorithm;
    this.options = options;
  }

  /**
   * Creates a new `Hash` object that contains a deep copy of the internal state
   * of the current `Hash` object.
   */
  copy(options?: HashOptions): this {
    if (this.isDigestCalled) {
      throw new Error(
        "Cannot copy a Hash object after digest() has been called."
      );
    }
    const newHash = new (this.constructor as new (...args: any[]) => this)(
      this.algorithm,
      this.options
    );
    newHash.data = [...this.data]; // Deep copy the data
    return newHash;
  }

  /**
   * Updates the hash content with the given `data`.
   */
  update(data: BinaryLike): Hash;
  update(data: string, inputEncoding: BufferEncoding): Hash;
  update(data: BinaryLike | string, inputEncoding?: BufferEncoding): this {
    if (this.isDigestCalled) {
      throw new Error(
        "Cannot update a Hash object after digest() has been called."
      );
    }
    this.data.push(data);
    return this;
  }

  /**
   * Calculates the digest of all of the data passed to be hashed.
   */
  digest(): Buffer;
  digest(encoding: BinaryToTextEncoding): string;
  digest(encoding?: BinaryToTextEncoding): Buffer | string {
    if (this.isDigestCalled) {
      throw new Error("digest() has already been called.");
    }
    this.isDigestCalled = true;

    // Here you would implement the actual hashing logic
    // For demonstration, we will just return a dummy Buffer or string
    const result = Buffer.from(this.data.join("")); // Dummy implementation
    return encoding ? result.toString(encoding) : result;
  }

  getAlgorithm(): string {
    return this.algorithm;
  }

  getOptions(): HashOptions | undefined {
    return this.options;
  }
}

/**
 * Creates a new `Hash` object based on the specified algorithm and options.
 * @param algorithm The hashing algorithm to use (e.g., 'sha256').
 * @param options Optional settings for the hash.
 */
export function createHash(algorithm: string, options?: HashOptions): Hash {
  return new Hash(algorithm, options);
}
