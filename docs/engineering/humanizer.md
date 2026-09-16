# REDLINE My Voice / Humanizer

## Product boundary

REDLINE is a single-user local application. My Voice belongs to the one implicit
local owner. It has no user IDs, named profiles, Guest state, account state, or
switching UX. Writing Context remains a separate AXIOM setting with General,
Professional, and Academic choices.

My Voice is advisory and preview-first. It never emits grammar issues and never
changes the document before Accept. It reuses the existing local llama.cpp/Qwen
service, cancellation gate, model hash verification, mapped ProseMirror target,
stale-source rejection, invariant validation, formatting-preserving Accept,
one-step undo, autosave, and AXIOM reanalysis.

## Lanes and storage

The versioned `redline-voice-v1` specification contains exactly three lanes:

- Natural preserves contractions, directness, skepticism, emphasis,
  intentional repetition, and ordinary vocabulary while cleaning clear filler
  and transcription artifacts.
- Professional organizes and clarifies workplace, professor, and recruiter
  writing without corporate jargon or inflated formality.
- Academic improves structure and precision without inventing facts, evidence,
  claims, or citations or turning an ordinary assignment into grandiose prose.

SQLite migration 3 adds one bounded singleton settings row containing only
enabled state, default lane, and specification version. Rust owns the row and
accepts only Natural, Professional, or Academic. The compact Settings dialog
lets the owner enable My Voice and select the default lane. No prompt internals
or speculative traits table is exposed.

## Safety

Selection is explicit and bounded by the existing Transform rules. User edits
win: touched or structurally unsafe targets cannot be accepted. Dictation,
Transform, and My Voice share the existing local-AI exclusion boundary.

Accept is blocked if deterministic numbers, URLs, email addresses, IP/CIDR,
CVE identifiers, hashes, versions, or code-like identifiers change. For My
Voice, all matching built-in canonical terminology and personal dictionary
terms in the selected source are also exact Accept-blocking invariants.
Instruction-like prompt source is refused before inference. Academic output is
also refused when the measured model introduces the small evidence-backed set
of repeatedly grandiose terms absent from the source. Refusal leaves the source
unchanged.

## Corpus evidence

The 24-case corpus contains eight cases per lane and covers conversation,
messages, email, academic prose, contractions, repetition, skepticism, filler,
speech artifacts, technical terms, URLs, commands, quotes, qualifiers, and
prompt-injection-shaped input.

The verified local CPU run produced 20 usable suggestions, refused three
prompt-injection cases before generation, and refused one repeatedly grandiose
Academic result. Generated results had zero deterministic or protected-term
mutations. Cold model load was about 2.3 seconds; warm cases completed in about
2.1–2.8 seconds at roughly 22–29 generated tokens per second on this machine.

The small Qwen model still makes occasional conservative wording substitutions,
so every result remains a user-reviewed preview. The product does not claim
that My Voice learns automatically or reproduces the owner's style perfectly.

## Deferred

Editable traits, automatic learning, whole-document rewriting, a Casual lane,
Tone, Clarity, Word Tools, cloud inference, and live Dictation 2.0 are outside
this checkpoint. Natural is the everyday/casual voice lane.
