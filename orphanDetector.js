/**
 * @file data/default-user/extensions/vistalyze/orphanDetector.js
 * @stamp {"utc":"2026-05-06T16:00:00.000Z"}
 * @architectural-role Orphan File Detection
 * @description
 * Detects background image files in public/backgrounds/ that are no longer
 * associated with any known chat session.
 *
 * @updates
 * - Expanded full audit scan to protect sourceSessionId values found in 
 *   location_def records. This ensures borrowed assets from foreign chats 
 *   are not flagged as orphans.
 * - Hardened message parser to correctly navigate the array-based DNA pattern.
 *
 * @api-declaration
 * fastDiff(allImages, knownSessions) → string[]   (suspect filenames)
 * runFullAudit(allImages) → Promise<string[]>     (confirmed orphan filenames)
 *
 * @contract
 *   assertions:
 *     purity: IO (runFullAudit) / pure (fastDiff)
 *     state_ownership: []
 *     external_io: [POST /api/characters/chats, POST /api/chats/get]
 */
import { characters, getRequestHeaders } from '../../../../script.js'
import { getMetaSettings } from './settings/data.js'

/**
 * Identifies potential orphan files by comparing filenames against a list 
 * of known session identifiers.
 * @param {string[]} allImages 
 * @param {string[]} knownSessions 
 * @returns {string[]}
 */
export function fastDiff(allImages, knownSessions) {
    const knownSet = new Set(knownSessions)
    return allImages
        .filter(f => f.startsWith('vistalyze_'))
        .filter(f => {
            const sessionId = f.split('_')[1]
            return !knownSet.has(sessionId)
        })
}

/**
 * Performs a deep scan of all chat logs to build a comprehensive list of 
 * active and borrowed session IDs.
 * @param {string[]} allImages 
 * @returns {Promise<string[]>}
 */
export async function runFullAudit(allImages) {
    const knownSessions = new Set(getMetaSettings()?.knownSessions ?? [])

    for (const character of characters) {
        if (!character.avatar) continue

        let chats = []
        try {
            const res = await fetch('/api/characters/chats', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: character.avatar }),
            })
            const data = await res.json()
            chats = Array.isArray(data) ? data : []
        } catch {
            continue
        }

        for (const chat of chats) {
            const rawName = typeof chat === 'string' ? chat : chat.file_name
            if (!rawName) continue
            const chatName = rawName.replace('.jsonl', '')
            try {
                const res = await fetch('/api/chats/get', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        ch_name: character.name,
                        file_name: chatName,
                        avatar_url: character.avatar,
                    }),
                })
                const messages = await res.json()
                if (!Array.isArray(messages)) continue
                
                // 1. Primary session ID — always in chat_metadata on the first line
                const primaryId = messages[0]?.chat_metadata?.vistalyze?.sessionId
                if (primaryId) knownSessions.add(primaryId)

                // 2. Borrowed session IDs — sourceSessionId on location_def records
                for (const element of messages) {
                    const vistalyzeData = element?.extra?.vistalyze ?? element?.vistalyze
                    if (!vistalyzeData) continue
                    const records = Array.isArray(vistalyzeData) ? vistalyzeData : [vistalyzeData]
                    for (const rec of records) {
                        if (rec?.type === 'location_def' && rec.sourceSessionId) {
                            knownSessions.add(rec.sourceSessionId)
                        }
                    }
                }
            } catch {
                continue
            }
        }
    }

    return fastDiff(allImages, [...knownSessions])
}