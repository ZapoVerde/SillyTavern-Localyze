/**
 * @file data/default-user/extensions/vistalyze/defaults.js
 * @stamp {"utc":"2026-04-04T12:05:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings, API constants, and workflow toggles for Vistalyze.
 * 
 * @updates
 * - Added DEFAULT_AUTO_ACCEPT_LOCATION for Gate 1 pipeline bypass.
 * - Added DEFAULT_AUTO_ACCEPT_DESCRIPTION for Gate 2 pipeline bypass.
 *
 * @api-declaration
 * POLLINATIONS_MODELS
 * DEFAULT_IMAGE_MODEL
 * DEFAULT_IMAGE_PROMPT_TEMPLATE
 * DEFAULT_DEV_MODE
 * DEFAULT_AUTO_ACCEPT_LOCATION
 * DEFAULT_AUTO_ACCEPT_DESCRIPTION
 * DEV_IMAGE_WIDTH
 * DEV_IMAGE_HEIGHT
 * DEFAULT_BOOLEAN_HISTORY
 * DEFAULT_CLASSIFIER_HISTORY
 * DEFAULT_DESCRIBER_HISTORY
 * DEFAULT_DISCOVERY_HISTORY
 * DEFAULT_BOOLEAN_PROMPT
 * DEFAULT_CLASSIFIER_PROMPT
 * DEFAULT_DESCRIBER_PROMPT
 * DEFAULT_DISCOVERY_PROMPT
 */

/** Available Pollinations image models. */
export const POLLINATIONS_MODELS =[
    'flux',
    'zimage',
    'klein',
    'gptimage',
    'grok-imagine',
    'seedream',
    'qwen-image',
]

/** Default Pollinations model. */
export const DEFAULT_IMAGE_MODEL = 'flux'

/** Image prompt template. Interpolated by imageCache.js. */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = 
`Concept Art for Video Games, 
{{image_prompt}}, a wide angled background, cinematic lighting, high detail, uncluttered in the centre.

Style: Concept Art for Video Games, in the style of Frank Cho, comic book style.
`

/** Dev mode — generates recognizable but low-cost images. */
export const DEFAULT_DEV_MODE = false

/** Verbose logging — set to true to enable informational log/warn output. Errors always surface. */
export const DEFAULT_VERBOSE_LOGGING = false

/** Parallax — horizontal panning effect on wide background images. Off by default. */
export const DEFAULT_PARALLAX_ENABLED = false

/** Auto-Detect — when false, the pipeline does not run on incoming messages. */
export const DEFAULT_AUTO_DETECT_ENABLED = true

/** Auto-Accept Bypasses — allows the pipeline to skip manual confirmation gates. */
export const DEFAULT_AUTO_ACCEPT_LOCATION = false
export const DEFAULT_AUTO_ACCEPT_DESCRIPTION = false

export const DEV_IMAGE_WIDTH  = 320
export const DEV_IMAGE_HEIGHT = 180

/** Default turn-pair history for LLM calls. */
export const DEFAULT_BOOLEAN_HISTORY = 2
export const DEFAULT_CLASSIFIER_HISTORY = 2
export const DEFAULT_DESCRIBER_HISTORY = 2
export const DEFAULT_DISCOVERY_HISTORY = 2

export const DEFAULT_BOOLEAN_PROMPT =
`[SYSTEM: LOCATION CHANGE DETECTOR]

You are a precise location archivist for a roleplay. Your ONLY job is to detect whether the scene has left the current known location.

Current known location: {{current_location}}

{{history}}

Latest message:
{{message}}

At the END of the latest message, has the scene clearly left the current known location?

Rules:
- Answer with ONLY the single word YES or NO.
- Evaluate the scene state strictly at the end of the latest message, not during earlier parts of it.
- YES = the characters are no longer in the current known location.
  This includes:
  - clearly exiting the location (e.g. stepping outside)
  - being in transit after leaving (e.g. on the road, in a vehicle, traveling)
  - arriving somewhere after previously being in transit
- NO = they are still within the current location or its immediate sub-areas (different room, floor, corner, or nearby extension).
- Movement within a location does NOT count as leaving.
- Intent to leave does NOT count; the exit must be completed.
- Mentions of other locations without physically moving do NOT count.
- If the location is ambiguous or unclear, default to NO.
- Do not explain. Do not add any other text.

Answer:`

export const DEFAULT_CLASSIFIER_PROMPT =
`[SYSTEM: TASK — LOCATION CLASSIFIER]
Identify which location from the list below matches the location at the end of the LATEST MESSAGE.

CURRENT LOCATION: {{current_location_name}}

LOCATIONS:
{{key_list}}

TRANSITION HISTORY FROM CURRENT LOCATION:
{{spatial_transitions}}

NUMBER OF TRANSITIONS TO A COMPLETELY NEW LOCATION ({{spatial_discovery_count}})

PREVIOUS History:
{{history}}

LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
1. If the characters have moved to a NEW location not listed above, reply: NEW
2. If the characters have moved to a location in the list above, reply ONLY with the ID in brackets (e.g., [fob_armory]).
3. If the characters are STILL at {{current_location_name}}, reply: NULL`

export const DEFAULT_DESCRIBER_PROMPT =
`[SYSTEM: TASK — LOCATION ARCHIVIST]
Analyze the roleplay transcript to identify the current physical location.

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the single most specific active location at the end of the transcript.
2. Provide the information using the exact labels below:
   Name: A short, formal label (e.g., "The Silver Swan Tavern").
   Definition: A brief, conceptual definition of what this place is. This helps distinguish the location and narratively for search logic.
    Visuals: 2–3 sentences of concrete visual detail for an image generator. Focus on visible elements such as lighting, materials, layout, and color. Exclude mention of humans, animals, and any other living creatures.

### OUTPUT FORMAT:
Name: [Location Name]
Definition: [Logical Definition]
Visuals: [Image Generation Prompt]`

export const DEFAULT_DISCOVERY_PROMPT =
`[SYSTEM: TASK — TARGETED LOCATION DISCOVERY]
Create a new location definition based on the user's keywords and the current roleplay context.

USER KEYWORDS: {{keywords}}

TRANSCRIPT CONTEXT:
{{context}}

INSTRUCTIONS:
1. Prioritize the USER KEYWORDS as the primary theme for the location.
2. Use the TRANSCRIPT CONTEXT to refine the mood and world-consistency.
3. Provide the information using the exact labels below:
   Name: A short, formal label based on the keywords.
   Definition: A brief, conceptual definition of what this place is.
   Visuals: 2–3 sentences of concrete visual detail for an image generator. Focus on visible elements such as lighting, materials, layout, and color. Exclude mention of humans, animals, and any other living creatures.

### OUTPUT FORMAT:
Name: [Location Name]
Definition: [Logical Definition]
Visuals: [Image Generation Prompt]`