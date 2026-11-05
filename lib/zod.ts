import { z } from "zod";

// Zod's default probes `new Function("")` to decide whether to compile object parsers; the CSP forbids eval on pages,
// so that probe shows up as a violation. Jitless parsing is plenty fast for our schemas. Import z from here, not "zod".
z.config({ jitless: true });

export { z };
