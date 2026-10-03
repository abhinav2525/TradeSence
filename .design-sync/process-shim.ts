// Next.js's client code (next/link, next/navigation) reads process.env.__NEXT_*
// flags that Next's own build inlines. In the Claude Design bundle there is no
// `process`, so every export failed with "process is not defined". An empty env
// makes each flag read as unset (Next's defaults). Imported first by entry.ts so
// it runs before any Next module evaluates.
const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
if (!g.process) g.process = { env: {} };
else if (!g.process.env) g.process.env = {};
export {};
