


# VLZ v1.0 — Project Principles
*Read before writing any code. Applies to every session.*

---

## The Core Philosophy

Vistalyze (VLZ) does one thing: automate atmospheric immersion. It turns narrative text into visual context without the user having to manage files or prompts manually.

The system is built on the **DNA Chain** principle. We do not trust external databases, local storage, or sidecar files for chat-specific data. If a user forks a chat, the location history must fork with it. If a user moves their chat to a new install, the locations must survive. **The chat log is the only source of truth.**

---

## The Three Kinds of Code

VLZ strictly enforces the separation of logic, state, and side effects. Every module declares its role. Mixing these responsibilities is the primary source of bugs.

### Pure Functions
Takes data in, returns derived data out. No external reads. No external writes. It does not know the DOM exists. It does not know about settings. It cannot see the filesystem. Given the same chat log array, a pure function must always produce the identical derived state object.

### Stateful Owners
A strictly bounded set of modules that are allowed to mutate the runtime state singleton. They bridge the gap between reconstructed data and the active session. If a component needs to update the current location or memory cache, it must do so through a stateful owner, never by modifying the state object directly.

### IO Executors
These are the workers. They talk to LLMs, external image APIs, and the host file system. They execute what they are told and return the raw result. **They contain zero narrative or business logic.** An IO executor does not decide *when* to change a background; it only knows *how* to apply the visual transition.

---

## The Data Model: The DNA Chain

**The chat ledger is the database.** All persistent location data lives directly on the messages themselves. There is no external registry. There are only two conceptual record types:

1. **The Definition:** Contains the human-readable name, the permanent key, the visual description, and the image prompt. These are the building blocks of the chat's location library.
   * *Last Write Wins:* Definitions are mutable. If a user edits a location, we simply append a new Definition record to the latest message. The forward-pass reconstruction logic always honors the most recent definition for a given key.
2. **The Transition:** Marks the exact turn where the characters moved to a new location. It links a specific message to a specific Definition key.

**Keys are Permanent Slugs.** Names and descriptions can evolve, but the underlying key is the immutable link tying the chat DNA to the generated file on disk.

---

## The Detection Pipeline

Detection follows a **"Falling Water"** pattern to minimize LLM costs, rate limits, and latency.

1. **The Gate (Boolean):** A fast, cheap YES/NO check. "Has the location changed?" If NO, the pipeline halts immediately.
2. **The Classifier:** If the gate opens, check the existing library. "Does this context match a known location key?" If YES, apply it and halt.
3. **The Describer:** If the location is entirely new, extract the visual essence. This is the most "expensive" analytical step and is strictly reserved for genuine transitions to unknown places.

---

## State and Side Effects: The Two-Write Pattern

Background generation is asynchronous and prone to network failure. We use a **Two-Write Pattern** to ensure the chat record remains accurate even if a file fails to generate:

* **Write 1 (Immediate Intent):** As soon as a transition is confirmed, we write a Transition record marking the new location, but flag the image as pending. The narrative shift is now permanently captured in the DNA.
* **Generation (Async IO):** We trigger the remote image API.
* **Write 2 (Eventual Consistency):** Once the image is safely saved to disk, we patch that exact same Transition record with the localized filename.

**Self-Healing by Design:** If the host application reloads and the reconstruction pass finds a Transition record with a pending image (or a file that is missing from disk), the system automatically queues a silent background regeneration. Missing files are treated as pending work, not fatal errors.

---

## Resource Management

### Respecting the User (The Yield Principle)
We only automate what we own. If the system detects that a background has been set, but lacks our internal system flags, it assumes the user manually picked a background. **The system will immediately yield control and will not overwrite a user's manual choice.**

### Orphan Detection & Identity
Every chat is assigned a unique, permanent session ID on creation. Every generated file is named using this namespace. 

* **Conservative Cleanup:** We never auto-delete files. The system runs fast diffs to detect "orphans" (files tied to session IDs that no longer exist in any chat log) and surfaces them. The user always has the final say on deletion.

---

## Unconditional Reversibility

VLZ's primary mechanical responsibility outside the detection pipeline is maintaining a clean, reversible environment. The user must always be able to disable Vistalyze and find their ST exactly as they left it.

This means:
- Deactivation clears any VLZ-managed background immediately.
- The pipeline does not run while the extension is disabled — no LLM calls, no image generation, no background transitions.
- Injected per-message badges are removed from the DOM on deactivation.
- On re-enable, the boot sequence re-runs to restore managed state from the DNA chain.

The disable toggle is not a pause — it is a clean exit. Re-enabling is a clean re-entry. Entry and exit state transitions must be perfectly symmetrical.

---

## Error Handling Philosophy

The goal is **Graceful Degradation.**
* **LLM Failures:** If an LLM returns malformed JSON or times out, swallow the error and stay at the current location. It is better to have a slightly "stale" background than a broken UI or an interrupted chat flow.
* **Image API Failures:** Revert the background to a neutral, clear state. Log the error for the developer, notify the user gracefully, and allow the Two-Write self-healing mechanism to try again later if requested.
* **Reconstruction Failures:** If a DNA record on a message is malformed, simply skip it. The forward pass will naturally recover as soon as it hits the next valid record.