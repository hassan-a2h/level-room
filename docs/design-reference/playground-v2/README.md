# Approved Playground V2 design references

Archived with the full implementation plan so temporary files are not required for the handoff. These files contain fictional prototype data and are visual references; they do not implement or contact the production application.

- `playground-v2.html`: the approved V2 learning playground.
- `full-app/index.html`: the connected app-wide prototype.
- `full-app/README.md`: original module mapping and prototype limitations.
- `full-app/*.png`: recorded desktop, mobile, and theme previews.

From the worktree root, serve the archive with:

```bash
python3 -m http.server 3213 --bind 127.0.0.1 --directory docs/design-reference/playground-v2
```

Open http://localhost:3213/playground-v2.html or http://localhost:3213/full-app/. The copied prototype verification scripts and original temporary launch instructions are historical references, not production acceptance checks.

Implementation plan: `.agents/superpowers/specs/2026-10-03-playground-v2-app-revamp.md`.
