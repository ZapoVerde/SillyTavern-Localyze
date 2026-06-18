/**
 * @file data/default-user/extensions/vistalyze/reconstruction.js
 * @stamp {"utc":"2026-05-03T14:20:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives all Vistalyze runtime state from a single forward pass over the chat
 * log.
 *
 * @updates
 * - Acknowledged customBg in location_def records. The forward pass naturally 
 *   carries this property into the runtime state as part of the record object.
 *
 * @api-declaration
 * reconstruct(chat) → { locations, transitions, currentLocation, currentImage, transitionsMap, newFromMap }
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */
export function reconstruct(chat) {
    const locations = {}
    const transitions = []
    const transitionsMap = {}   // { fromKey: { toKey: count } }
    const newFromMap = {}       // { fromKey: count } — creation events only
    const seenSceneKeys = new Set()

    let previousSceneKey = null

    for (const message of chat) {
        const vistalyzeData = message.extra?.vistalyze
        if (!vistalyzeData) continue

        // Normalize to array to handle both legacy and new patterns
        const records = Array.isArray(vistalyzeData) ? vistalyzeData : [vistalyzeData]

        for (const rec of records) {
            if (!rec || typeof rec !== 'object') continue

            if (rec.type === 'location_def') {
                // Last write for a given key wins (edit support)
                // This carries name, description, imagePrompt, and customBg.
                locations[rec.key] = rec
            } else if (rec.type === 'location_delete') {
                // Tombstone: remove the key so deleted locations don't survive reloads
                delete locations[rec.key]
            } else if (rec.type === 'scene') {
                transitions.push(rec)

                const dest = rec.location
                if (dest && previousSceneKey) {
                    // Track the transition frequency
                    if (!transitionsMap[previousSceneKey]) transitionsMap[previousSceneKey] = {}
                    transitionsMap[previousSceneKey][dest] = (transitionsMap[previousSceneKey][dest] ?? 0) + 1

                    // If this is the first time we've seen this destination, it's a creation event
                    if (!seenSceneKeys.has(dest)) {
                        newFromMap[previousSceneKey] = (newFromMap[previousSceneKey] ?? 0) + 1
                    }
                }

                // Only advance the cursor on a valid (non-null) destination
                if (dest) {
                    seenSceneKeys.add(dest)
                    previousSceneKey = dest
                }
            }
        }
    }

    const last = transitions.at(-1)
    return {
        locations,
        transitions,
        currentLocation: last?.location ?? null,
        currentImage: last?.image ?? null,
        transitionsMap,
        newFromMap,
    }
}