# Tutor Chat Markdown Rendering Design

## Problem

Lesson tutor replies can contain Markdown, including emphasis, lists, inline code, and fenced code examples. `LessonChat` currently inserts each reply as a plain React string, so learners see Markdown markers. The same plain-string rendering exists in the remediation chat.

## Goals

- Render common Markdown in tutor replies, including replies as they stream and after they are loaded from chat history.
- Keep learner messages literal text.
- Display code examples in readable, horizontally scrollable code blocks.
- Keep Markdown rendering safe for model-generated content.

## Design

Use `react-markdown` in a small shared client component for tutor message content. Its CommonMark support covers the formatting currently needed for emphasis, links, lists, inline code, and fenced code blocks. Do not add GitHub-flavored Markdown support unless the product needs features such as tables.

Use this component from tutor bubbles in both `LessonChat` and `RemediationPanel`. Continue rendering learner content as text. Keep storing the original Markdown in the existing messages table; no API or database changes are needed, and saved messages will use the same renderer as streamed messages.

Style the rendered elements within the tutor bubble: compact paragraph and heading spacing, readable lists and links, distinct inline code, and bounded code blocks with horizontal scrolling. Keep styles scoped to the Markdown content so surrounding chat layout and user bubbles remain unchanged.

## Data flow and streaming

The server continues streaming and persisting the model's Markdown string. The client passes the current streamed prefix to the renderer and then renders the completed stored message the same way. Unfinished Markdown constructs, such as code fences, emphasis, and links, may change layout as later chunks arrive; retain streaming rather than buffering the whole response.

## Safety and malformed input

Use the renderer's default behavior: do not enable raw HTML parsing, `dangerouslySetInnerHTML`, or custom URL handling. Markdown containing raw HTML remains inert, and malformed or unfinished Markdown renders as far as the parser can interpret it. Existing stream error handling remains in place.

## Acceptance checks

- Tutor emphasis, headings, lists, links, inline code, and fenced code render as formatted elements.
- Streamed and reloaded tutor replies use the same rendering.
- Learner messages containing Markdown characters remain literal.
- Raw HTML in a tutor reply does not create executable elements.
- Links with unsafe schemes such as `javascript:` are not rendered as active links.
- Long code lines scroll within the code block without widening the chat page.

## Scope

This change is limited to tutor messages in the lesson and remediation chat views. Quiz and artifact feedback are outside this chat-rendering change.
