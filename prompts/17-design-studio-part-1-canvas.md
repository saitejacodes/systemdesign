Read CLAUDE.md. Task: build the Design Studio canvas at /studio and /studio/[designId].
Match the /design Design Studio screen.

1. /studio: list of saved designs (title, case study, updated time), "New design",
   "New from case study template", duplicate, delete, import JSON.
2. Canvas (React Flow): infinite, snap-to-grid, minimap, zoom controls, multi-select,
   copy/paste, undo/redo (Ctrl/Cmd+Z / Shift+Z, history of 100), delete, align tools,
   group/frame boxes with labels (e.g. "Region us-east"), text notes, edges with labels
   and arrow direction, edge types: sync request, async message, replication.
3. Component palette (searchable, draggable), each with a small isometric icon and
   default properties:
   Client (web/mobile; users count), DNS, CDN (hit rate), Load Balancer (L4/L7, algorithm),
   API Gateway (rate limit), Service (name, instances, capacity QPS per instance,
   base latency ms, stateless toggle), Cache (size, hit rate, latency), SQL DB (primary,
   replicas count, capacity QPS, latency), NoSQL DB (nodes, consistency), Shard group
   (shard count), Queue/Topic (partitions), Worker (instances, processing time),
   Object Storage, Search Index, Vector DB, LLM API (latency, tokens/s, rate limit),
   Monitoring, External 3rd-party API, Region/AZ frame.
4. Properties panel: edit the selected node/edge; validation (e.g. capacity > 0).
5. Autosave to IndexedDB (debounced); "Saved" indicator; version history (last 20 snapshots).
6. Export: PNG (whole diagram, Paper/Blueprint theme), SVG, JSON. Import JSON with validation.
7. Side panel "Notes" per design with the 7 framework headings (CLAUDE.md §10)
   prefilled as a markdown template.
8. Keyboard: Delete, Ctrl/Cmd+C/V/D (duplicate), arrows to nudge, Space+drag to pan.

Definition of Done: CLAUDE.md §8; unit tests for graph model serialization and undo/redo.
