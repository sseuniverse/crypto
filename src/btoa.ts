import Buffer from "./buffer";

export function btoa(str: string | Buffer): string {
  let buffer: Buffer;

  if (str instanceof Buffer) {
    buffer = str;
  } else {
    buffer = Buffer.from(str.toString(), "binary");
  }

  return buffer.toString();
}

export default btoa;
