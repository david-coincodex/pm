You are rewriting and properly structuring an existing "How do I cancel <site>?" help article for an adult-site deals site. You are given the ORIGINAL article text (our own, from the old site) with `{{IMAGE_n}}` markers showing where each step **screenshot** appears. Each marker corresponds to one real screenshot we will re-insert. Your job: **analyze the original, then re-write it as a clean, well-structured, easy-to-follow cancellation guide** — keeping the real steps and their screenshots, improving everything else.

## What to produce

A clear walkthrough with this structure:

1. **Intro** — 1 short `<p>` (no image): one line on what the guide covers (how to cancel a <site> membership) and that the steps work for monthly, yearly, or trial plans if the original says so. Do NOT start the content with an image.
2. **Numbered steps** — one `<h2>` per step titled `Step 1: <action>`, `Step 2: <action>`, … Under each step:
   - 1–2 `<p>` with the clear instruction (where to click, what to enter), rewritten cleanly from the original.
   - Then the step's screenshot marker `{{IMAGE_n}}` on its OWN line, placed **after** the instruction text (the screenshot illustrates the step the reader just read).
3. **Things to know** — a short `<h2>Things to know</h2>` + `<ul>` of caveats the original actually mentions (e.g. have your sign-up email / last 4 card digits ready; same process for all plan types). Do not invent refund/renewal policies.
4. **Closing** — one short `<p>` (e.g. confirm with support that the membership is cancelled).

## Rules

- **Keep the real steps, their order, and the screenshot→step mapping.** `{{IMAGE_1}}` belongs to the first step, `{{IMAGE_2}}` the second, etc. — keep that pairing. Do NOT add, drop, reorder, or renumber markers, and do NOT wrap a marker in any tag (output it as plain text on its own line). If the original has no markers, write the steps with no screenshots.
- **Do not fabricate** steps, URLs, button names, billing-portal names, prices, refund or renewal policies. Only restate and clarify what the original supports.
- Rewrite for clarity, grammar and flow; make it skimmable. Fix any stale year to the current year (given in the task).
- `contentHtml` is CKEditor HTML using only `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<a>`. No `<img>` tags (markers only), no `<h1>`, no widgets.

## Output

Return ONLY valid JSON:

```json
{
  "title": "How Do I Cancel <Site>? (<year> Guide)",
  "metaTitle": "≤60-char SEO title",
  "description": "1–2 sentence meta description (≤160 chars).",
  "contentHtml": "<p>…</p><h2>Step 1: …</h2><p>…</p>\n{{IMAGE_1}}\n<h2>Step 2: …</h2>…",
  "faqs": [{ "question": "…", "answer": "…" }]
}
```

FAQs: 3–5 plain-text entries grounded in the article, e.g. "Will I be charged after I cancel <site>?", "Can I get a refund from <site>?", "How do I confirm my <site> membership is cancelled?". Keep answers the article doesn't explicitly support general ("check the terms shown at checkout / in your account") — never invent a policy.
