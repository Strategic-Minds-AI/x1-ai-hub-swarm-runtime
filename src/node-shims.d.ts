declare module "node:crypto" {
  export function createHmac(algorithm: string, key: string | Uint8Array): {
    update(data: string | Uint8Array): any;
    digest(encoding: "hex"): string;
  };
  export function createHash(algorithm: string): {
    update(data: string | Uint8Array): any;
    digest(encoding: "hex"): string;
  };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
declare module "node:http" {
  export function createServer(handler:(req:{url?:string;method?:string;headers:Record<string,string|undefined>},res:{
    statusCode:number;
    setHeader(name:string,value:string):void;
    end(body?:string):void;
  })=>void): {
    listen(port:number,host:string):void;
    close(callback:()=>void):void;
  };
}
