# Tutor Chat Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render model-generated Markdown in lesson and remediation tutor messages, including code examples.

**Architecture:** Add a small shared `MarkdownContent` client component backed by `react-markdown`. Keep learner messages literal and retain raw Markdown in existing storage; style the rendered content within tutor bubbles. Use the same component for streamed and saved assistant messages, with raw HTML parsing disabled.

**Tech Stack:** React 19, `react-markdown`, CSS, npm.

---

## Chunk 1: Shared renderer and chat integration

### Files

- Create: `client/src/components/MarkdownContent.jsx` — safely render a string as CommonMark.
- Modify: `client/src/components/LessonChat.jsx` — render assistant messages through the shared component.
- Modify: `client/src/components/RemediationPanel.jsx` — render assistant messages through the shared component.
- Modify: `client/src/index.css` — scope typography and code block styles to rendered Markdown.
- Modify: `package.json` and `package-lock.json` — add `react-markdown`.

### Task 1: Add the dependency and shared renderer

- [ ] Add `react-markdown` with npm, preserving existing unrelated `package.json` edits.
- [ ] Create `MarkdownContent.jsx` with a wrapper around `ReactMarkdown` and no raw HTML or URL overrides.
- [ ] Add scoped CSS for paragraphs, headings, lists, links, inline code, and fenced code blocks. Keep code blocks bounded with horizontal scrolling.

### Task 2: Use the renderer in tutor bubbles

- [ ] In `LessonChat.jsx`, render assistant `message.content` with `MarkdownContent`; keep user content as a string.
- [ ] In `RemediationPanel.jsx`, apply the same role-based rendering.
- [ ] Keep stream handling, stored content, message IDs, and the `[Continue]` marker behavior unchanged.
- [ ] Review the final diff for accidental edits outside the renderer, styles, dependencies, and two chat views.

### Acceptance checks

- Tutor emphasis, headings, lists, links, inline code, and fenced code render as formatted elements.
- Streamed and reloaded tutor replies use the same component in both `LessonChat` and `RemediationPanel`.
- Learner Markdown characters remain literal.
- Raw HTML remains inert; unsafe link schemes are not active.
- Long code lines scroll inside their block without widening the page.

Automated test files and test commands are omitted for this change under the current session instruction.
