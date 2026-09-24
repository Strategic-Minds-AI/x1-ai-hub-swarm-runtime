declare module "node:crypto" {
  export function createHmac(algorithm: string, key: string | Uint8Array): {
    update(data: string | Uint8Array): any;
    digest(encoding: "hex"): string;
  };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
