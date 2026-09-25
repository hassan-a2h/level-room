# LLM Reasoning Effort and Codex Default Design

## Goal

Make the fresh-install learning configuration use the Codex-backed `gpt-5.6-luna` model with `xhigh` reasoning, while allowing all three settings to be configured through `.env` and preserving explicit settings saved through the UI.

## Design

The LLM resolver will recognize `LLM_REASONING_EFFORT` in addition to the existing `LLM_PROVIDER` and `LLM_MODEL` variables. Resolution is field-based, with the first non-empty value winning:

| Field | 1. Saved `llm_settings` row | 2. Environment | 3. Provider-aware fallback |
| --- | --- | --- | --- |
| provider | `provider` | `LLM_PROVIDER` | `openai-codex` |
| model | `model` | `LLM_MODEL` | selected provider's default model; `gpt-5.6-luna` for the default Codex provider |
| reasoning effort | `reasoning_effort` | `LLM_REASONING_EFFORT` | `xhigh` for Codex, `none` for API-key providers |

Persisted rows are expected to be complete, but a missing or empty legacy field falls through to the next source for that field. Existing non-empty saved values remain authoritative. This preserves existing Settings selections without silently rewriting the database.

Environment values are trimmed; empty or whitespace-only values are treated as unset. Provider IDs, model IDs, and reasoning levels remain case-sensitive and are not normalized. The existing provider catalog and resolver validation reject unsupported values and provider/model or provider/reasoning combinations before dispatch.

When no saved row or environment override exists, the defaults are:

- provider: `openai-codex`
- model: `gpt-5.6-luna`
- reasoning effort: `xhigh`

The pinned Pi AI catalog already exposes `gpt-5.6-luna` with `xhigh` for `openai-codex`; no new provider implementation is required. The provider catalog's Codex default model will be updated from `gpt-5.4` to `gpt-5.6-luna` so Settings and resolver fallbacks agree.

## Compatibility and safety

Existing saved provider/model/reasoning selections are not rewritten. The existing schema migration already provides `reasoning_effort` for older rows; those rows retain their stored value, including the legacy `none` sentinel where present. Existing API-key provider behavior remains unchanged because their fallback reasoning remains `none`.

The fresh default is intentionally Codex-backed. If OAuth is missing, expired, or unavailable, the existing `requireLlmConfig()` error is returned; the resolver does not silently fall back to an API-key provider or change learning data. Codex authentication continues to use the app-owned OAuth connection; no API key is introduced or stored.

The resolver remains the boundary for environment parsing and configuration validation. The persistence boundary remains the existing `llm_settings` table, and the existing Settings API/catalog remain the way users can explicitly save a provider, model, and reasoning effort.

## Verification

Add resolver tests covering the new defaults, all three environment values, partial environment combinations, trimmed/empty values, saved-row and legacy-row precedence, provider-aware API-key defaults, invalid values and mismatched combinations, catalog exposure, and missing Codex OAuth. Add an API/catalog regression assertion for the new Codex default model. Update setup documentation with the three exact variables and explain that saved Settings take precedence.
