/**
 * Bound RPC calls, including response-body reads, without silently retrying an
 * operation whose remote commit state may be unknown. The AbortSignal asks a
 * compliant fetch implementation to stop; the deadline also covers test
 * transports that do not implement AbortSignal.
 */
export async function boundedRequest<T>(
  code:string,
  timeoutMs:number,
  operation:(signal:AbortSignal)=>Promise<T>,
):Promise<T> {
  if(!/^[A-Z][A-Z0-9_]*$/.test(code)) throw new Error("REQUEST_TIMEOUT_CODE_INVALID");
  if(!Number.isInteger(timeoutMs) || timeoutMs<50 || timeoutMs>60000) {
    throw new Error("REQUEST_TIMEOUT_CONFIG_INVALID");
  }
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>{
      controller.abort();
      reject(new Error(code+"_TIMEOUT"));
    },timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(()=>operation(controller.signal)),
      timeout,
    ]);
  } finally {
    if(timer!==undefined) clearTimeout(timer);
  }
}
