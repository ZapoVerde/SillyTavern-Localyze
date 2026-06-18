/**
 * @file data/default-user/extensions/vistalyze/io/dnaWriter.js
 * @stamp {"utc":"2026-04-02T12:00:00.000Z"}
 * @architectural-role IO Executor / DNA Chain Writer
 * @description
 * Handles all writes to message.extra.vistalyze with integrated concurrency 
 * locking. 
 * 
 * @updates
 * - Implemented the "Array Pattern" for event storage.
 * - Migrated from single-object records to a list of records.
 * - This allows multiple events (e.g. location_def + scene) to coexist on 
 *   a single message without overwriting each other.
 *
 * @api-declaration
 * lockedWriteSceneRecord(messageId, record) -> Promise<void>
 * lockedPatchSceneImage(messageId, filename) -> Promise<void>
 * lockedWriteLocationDef(messageId, def, sessionId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [Mutex Queue]
 *     external_io: [message.extra.vistalyze (write), saveChatConditional()]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { AsyncLock } from '../utils/lock.js';
import { writeLocationDef } from '../library.js';

/** Singleton lock for all chat write operations in this extension. */
const writeLock = new AsyncLock();

/**
 * Ensures message.extra.vistalyze is a valid array, migrating old objects if found.
 * @param {object} message 
 */
function ensureVistalyzeArray(message) {
    message.extra = message.extra ?? {};
    const existing = message.extra.vistalyze;

    if (!existing) {
        message.extra.vistalyze = [];
    } else if (!Array.isArray(existing)) {
        // Migration: Wrap existing object-style record into an array
        message.extra.vistalyze = [existing];
    }
}

/**
 * Writes a scene transition record to a message.
 * @param {number} messageId 
 * @param {object} record { location, image, bg_declined }
 */
export async function lockedWriteSceneRecord(messageId, record) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureVistalyzeArray(message);
            message.extra.vistalyze.push({ 
                type: 'scene', 
                ...record 
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Patches an existing scene record with a generated filename.
 * Used in the Two-Write Pattern once async generation completes.
 * @param {number} messageId 
 * @param {string} filename 
 */
export async function lockedPatchSceneImage(messageId, filename) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureVistalyzeArray(message);
            // Find the most recent 'scene' record in the array and patch it
            const records = message.extra.vistalyze;
            for (let i = records.length - 1; i >= 0; i--) {
                if (records[i].type === 'scene') {
                    records[i].image = filename;
                    await saveChatConditional();
                    break;
                }
            }
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a location definition to the chat history.
 * @param {number} messageId
 * @param {object} def { name, key, description, imagePrompt }
 * @param {string} sessionId
 */
export async function lockedWriteLocationDef(messageId, def, sessionId) {
    await writeLock.acquire();
    try {
        // library.js now handles the array-based write
        await writeLocationDef(messageId, def, sessionId);
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a location deletion tombstone to the chat history.
 * Ensures deleted locations do not resurface on reconstruction.
 * @param {number} messageId
 * @param {string} key The slug of the deleted location.
 */
export async function lockedWriteLocationDelete(messageId, key) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureVistalyzeArray(message);
            message.extra.vistalyze.push({ type: 'location_delete', key });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}