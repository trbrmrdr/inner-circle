declare module "heic-convert" {
  function convert(options: {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Buffer>;

  namespace convert {
    function all(options: {
      buffer: Buffer;
      format: "JPEG" | "PNG";
      quality?: number;
    }): Promise<Array<{ convert: () => Promise<Buffer> }>>;
  }

  export = convert;
}
