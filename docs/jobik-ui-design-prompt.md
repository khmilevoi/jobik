# Jobik UI design prompt

Design a premium desktop web application called **Jobik** — a visual editor for typed automation flows. The product lets developers inspect a flow declared in TypeScript, edit its JSON connections and settings, and run one selected Start node through its downstream graph.

Create a dark, near-black interface. The feel is focused, technical, calm, and high-end — an engineering tool for creative automation, not a generic SaaS dashboard. Use deep charcoal and black surfaces, thin graphite borders, restrained slate text, and one vivid teal accent for interactive graph paths, selected states, and Start nodes. Avoid gradients, glassmorphism, excessive shadows, neon overload, or decorative illustrations.

Show a wide desktop Studio layout:

- Top bar: Jobik wordmark, active flow name “publication”, compact actions “Validate”, “Save”, and a subtle dirty-state indicator.
- Left sidebar: a short list of flows and a node inventory. It is visibly collapsible through a narrow icon button.
- Large central canvas: subtle dot grid, field-level connections, and plenty of empty space. Show one teal **Start** node called `start1` with typed outgoing fields `title` and `markdown`; connect it to a neutral `render` node, then to a neutral `publish` node. Connections should feel precise, not ornamental.
- Right sidebar: “Run start1” panel with inputs for title and markdown, a solid teal Run button, and a collapse button. Treat the sidebars as utility panels that can disappear to give the canvas more room.
- Node cards: compact, structured, and readable. Each node has a small title, distinct input/output rows, field handles aligned to rows, and clear status treatment. Start nodes look special but belong to the same visual system.
- Include one successful image output state inside the `render` node: a contained image preview with a small metadata row. Make it feel like a custom renderer slot, not a photo-gallery page.
- Include a small secondary example of a collapsed-panel state, showing the graph almost full width with compact “Flows & nodes” and “Run start1” controls in the top bar.

Typography should be modern sans-serif, compact, and exceptionally legible. Use a strong hierarchy: node titles and active flow are clear; schema fields, status, and metadata are quiet. The design must be implementable with React Flow and responsive down to a narrow laptop screen, while being optimized for desktop work.

Do not show code editors, marketing copy, user avatars, billing, analytics charts, or mobile frames. The visual emphasis is the graph, deliberate editing, and running a selected typed entry point.
