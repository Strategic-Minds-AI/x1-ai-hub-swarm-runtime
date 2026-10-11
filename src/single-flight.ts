/**
 * Single-flight gate for an existing worker poller. It deliberately does not
 * schedule work or create a second heartbeat/supervisor. On shutdown it stops
 * accepting new ticks and waits for the current tick with a bounded deadline.
 */
export class SingleFlightGate {
  private current:Promise<void>|null=null;
  private stopped=false;

  run(operation:()=>Promise<void>):Promise<void> {
    if(this.stopped) return Promise.resolve();
    if(this.current) return this.current;
    const next=Promise.resolve().then(operation);
    const tracked=next.finally(()=>{
      if(this.current===tracked) this.current=null;
    });
    this.current=tracked;
    return tracked;
  }

  get busy():boolean { return this.current!==null; }
  get stopping():boolean { return this.stopped; }

  async stopAndDrain(timeoutMs:number):Promise<boolean> {
    if(!Number.isInteger(timeoutMs) || timeoutMs<100 || timeoutMs>300000) {
      throw new Error("WORKER_DRAIN_TIMEOUT_INVALID");
    }
    this.stopped=true;
    const pending=this.current;
    if(!pending) return true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const expired=new Promise<boolean>(resolve=>{
      timer=setTimeout(()=>resolve(false),timeoutMs);
    });
    try {
      return await Promise.race([pending.then(()=>true,()=>true),expired]);
    } finally {
      if(timer!==undefined) clearTimeout(timer);
    }
  }
}
