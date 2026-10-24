import { handle } from "./engine";
import type { ToWorker } from "./protocol";

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const out = handle(e.data);
  if (out) (self as unknown as Worker).postMessage(out.msg, out.transfer);
};
