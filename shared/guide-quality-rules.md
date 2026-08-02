# Guide Quality Rules — the beginner-clarity rulebook

> **This file is the single source of truth for HOW DETAILED and HOW CLEAR every
> step-by-step guide must be.** The Guide Agent loads it while writing; the
> Reviewer enforces its spirit through the beginner-clarity check.
> Core promise: **a complete beginner can follow every step without getting
> lost or misled.**
>
> **Scope (2026-07-27):** these rules are written for the Guide Agent, but the
> *promise* they protect is not limited to guides. ANY article whose title
> promises the reader can DO something ("How to…", "…in five minutes") must
> deliver real numbered steps — see **style-guide.md § 3b (Ígéret-fedezet)**,
> which applies to every writer. The Reviewer enforces it automatically
> (HOWTO_TOO_THIN / HOWTO_NO_STEPS). (Added 2026-07-03 after user feedback: guides were too
> vague and could mislead first-time users.)

---

## 1. The six parts of EVERY step

Each `## Step N — …` section must contain, woven into natural prose:

1. **ACTION** — exactly ONE main action, concretely stated.
   ✅ "Open the ChatGPT app and tap your profile picture in the bottom-left corner."
   ❌ "Go to the settings."
2. **WHAT YOU SEE** — describe the screen at that moment, so the reader can
   confirm they are in the right place ("A menu slides up with options like
   Settings, Help and Log out.").
3. **WHAT HAPPENS NEXT** — what the tool does after the action (a reply starts
   typing, a new panel opens, a file downloads). Never leave the reader
   wondering whether anything worked.
4. **IF IT LOOKS DIFFERENT** — apps change and vary between phone, tablet and
   computer. Give a fallback: "If you don't see the ⋯ icon, look for a gear
   icon or a menu with three lines instead."
5. **💬 Example** — a concrete, copy-paste-ready example wherever the step
   involves typing something. Keep the `💬 Example:` marker exactly as is.
6. **SUCCESS CHECK** — end the step with a sentence like
   "You'll know it worked when …" so the reader can verify before moving on.

A step that is just two thin sentences is NOT acceptable. Each step should be
roughly **60–140 words** (plus the example line).

## 2. Honesty rules — never mislead a beginner

- **Never invent UI details.** No made-up menu names, button labels, prices,
  limits or features. If you are not CERTAIN a detail is universal, phrase it
  as "look for a button like …" or "it's usually in the corner of the screen".
- **Never over-promise.** Don't write "the assistant will instantly solve your
  problem". Say what USUALLY happens, and what to do when it doesn't
  ("If the answer misses the point, rephrase with more detail — see Step 4.").
- **Name the paywall.** If a feature may require a paid plan, say so plainly
  ("On the free plan you may get a small number of images per day.").
- **Say what the tool CANNOT do** for this task — one honest sentence in the
  intro or in Common mistakes ("It can draft the email, but it can't send it
  for you.").
- **Analogies support, never replace, instructions.** A nice metaphor is not a
  substitute for saying which button to press.
- **No invented facts, numbers or quotes.** Same as everywhere on the site.
- **Never turn a research paper or a backend/enterprise feature into a fake
  consumer product (added 2026-07-18, cleanup lesson).** If the source is an
  academic paper, a model/technique name, or an enterprise platform feature,
  do NOT invent a consumer app, a sign-up website, an account, or mobile-app
  steps for it. Real past mistakes we removed: "SkillOpt" (a Microsoft Research
  paper turned into a fake "SkillOpt account + agent") and "Genie One" (a
  Databricks enterprise feature turned into a fake "genie.one" app with signup).
  If a normal person cannot actually sign up and DO the task today with a real,
  named product, it is not a guide — flag it back, don't fabricate the steps.
- **Vendor neutrality (added 2026-07-14, reader feedback).** When the article
  is not ABOUT one specific tool, example lists must name SEVERAL assistants
  from different companies (ChatGPT, Gemini, Claude, Copilot, Le Chat,
  DeepSeek, …) or say "any AI assistant" — never spotlight the same one or
  two, it reads like paid advertising.

## 3. Depth requirements

- **700–1200 words** (was 450–800 — that produced guides too thin to follow).
- **4–7 steps**, each following the six parts above.
- `read_time_minutes`: set to 5–7 to match the fuller length.
- **"Before you start" lists EVERYTHING needed** — account, app or website,
  device, plan, and roughly how long the whole thing takes — so nobody
  discovers a blocker at Step 4.
- Explain EVERY technical term at first use: plain words + a relatable,
  everyday analogy (see style-guide.md section 5).
- **Common mistakes**: 3 entries minimum, each naming the mistake AND the fix.

## 4. The three clarity tests (the Reviewer runs these)

Write with these in mind — the guide fails review if any test fails:

1. **The Grandparent Test** — could a smart 70-year-old who has never used
   this tool follow every step without asking anyone for help?
2. **The Stuck Test** — at every step: if the reader's screen does not match
   the description, does the guide tell them what to do next?
3. **The Misleading Test** — could any sentence create a false expectation
   about what the tool does, what it costs, or how well it works?

## 5. Unchanged structural rules (for compatibility)

The section names and markers below are parsed by the site build and the
translation pipeline — keep them EXACTLY:

- YAML frontmatter with `category: "guide"`.
- `## Before you start`, then `## Step N — <short action>` headings,
  `## Common mistakes`, `## What this means for you`, `## Try it now`.
- `💬 Example:` marker for copyable examples.
- US English, warm teaching voice, no clichés, original writing only —
  never copy company docs, no "Source:" line, no external links.

## 6. 💬 Example formatting (render-compatibility — added 2026-07-06)

- The ENTIRE example must live in ONE paragraph, on the SAME line as (or immediately after) the `💬 Example:` marker.
- NEVER indent continuation lines under a 💬 example — indented lines render as a broken code box on the website.
- If the example output has multiple items, write them as a single flowing sentence ("…Maria finalises the budget by Friday; John drafts the comms; Sarah books the follow-up.") instead of an indented bullet list.

## 7. Tool naming + official links (brand-chip rules — added 2026-07-12)

The `tool` field is shown on the site as a BRAND CHIP (tile header + guide badge)
and is NEVER translated. Therefore:

- `tool` must be the SHORTEST OFFICIAL PRODUCT NAME users recognise:
  ChatGPT, Copilot, Gemini, Claude, Le Chat, Alexa+, Qwen, Hugging Face, ChatRTX.
- NEVER use: generic feature/technology phrases ("Reserved Capacity",
  "AI-powered assistants"), sub-feature suffixes ("Claude Projects" → Claude;
  "Gemini in Workspace" → Gemini; "ChatGPT API" → ChatGPT), parentheses
  ("Le Chat (Mistral)" → Le Chat), company prefixes when the section already
  shows the company ("Microsoft Copilot" → Copilot; "NVIDIA ChatRTX" → ChatRTX),
  or comma lists. Exception: names that are ONLY official in full form
  (GitHub Copilot, Meta AI, Apple Intelligence) stay as-is.
- If there is no single clear product, leave `tool` EMPTY — the site then shows
  the company name (or a localised "For everyone" label).

Official links (website/tool-links.json):

- Every guide automatically gets an "Official site" button: tool link first,
  company link as fallback. INVENTED URLs are STRICTLY FORBIDDEN — only
  verified official homepages go into the map.
- New tool without any link? The daily Telegram report flags it
  ("🔗 Hivatalos link nélküli új eszköz") — the map is extended with ONE line.
  Tools with no known official page go on the `ignore` list instead.

Enforcement (added 2026-07-13 — prompts alone are NOT enough, the AI ignored
them once): these rules are enforced BY CODE, not by request.
`core/quality-guard.js` → `canonicalChip()` mechanically canonicalises every
chip (alias maps + company-prefix stripping with a generic-word guard), and
the SELF-FIXER (`node core/quality-guard.js --fix`, pipeline step before the
build) REPAIRS topic-list and article `_meta` chips automatically — the daily
Telegram report lists what was self-fixed. Only non-deterministic cases remain
as watchdog findings for a human/AI decision. The article frontmatter (the
writer's final choice) always outranks `_meta` (the pairing agent's plan).
