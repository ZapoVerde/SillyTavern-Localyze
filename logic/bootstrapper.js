/**
 * @file data/default-user/extensions/vistalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-05-06T23:45:00.000Z"}
 * @version 1.3.0
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the Vistalyze environment for a specific chat.
 * 
 * @updates
 * - Cleaned up unused imports (pre-existing debt).
 * - Integrated allFileIndex: Now populates the global cross-session asset 
 *   registry during reconciliation.
 * - sourceSessionId Awareness: Regeneration queue now correctly identifies 
 *   borrowed assets and skips unnecessary generation.
 *
 * @api-declaration
 * runBoot() -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [session, reconstruction, imageCache, background, orphanDetector]
 */

import { chat_metadata } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { log, warn, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, setAllFileIndex, addToFileIndex } from '../state.js';
import { initSession } from '../session.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { fastDiff } from '../orphanDetector.js';
import { showOrphanBadge } from '../ui/toolbar.js';
import { getMetaSettings, updateMetaSetting } from '../settings/data.js';

/**
 * Executes the full boot sequence for the current chat context.
 */
export async function runBoot() {
    log('Boot', 'Starting sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // 1. Session & DNA Reconstruction
    initSession();
    
    const reconstructed = reconstruct(context.chat);
    
    // Protected Update: Hydrate live state from reconstructed DNA
    bulkInitState(reconstructed);
    
    log('Boot', `DNA Reconstructed: ${Object.keys(state.locations).length} locations found.`);

    // 2. Filesystem Reconciliation
    // Fetch the list of actual background files present on the server.
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId);

    // Protected Update: Update both the session-scoped and full file indexes
    setFileIndex(fileIndex);
    setAllFileIndex(allImages);

    log('Boot', `File Index: ${state.fileIndex.size} managed files detected.`);

    // 3. 404 Prevention & Self-Healing Queue
    const queue = [];

    // Check every location in the library. If its image is missing, queue it.
    for (const key of Object.keys(state.locations)) {
        const def = state.locations[key];

        if (def.customBg) continue;

        // Borrowed locations: the asset lives under the source session's namespace.
        // Skip boot-time auto-regen — commit.js localizes the file on first apply.
        if (def.sourceSessionId) {
            const sourceFilename = `vistalyze_${def.sourceSessionId}_${key}.png`;
            if (!state.allFileIndex.has(sourceFilename)) {
                warn('Boot', `Borrowed asset missing: ${sourceFilename}. Will localize on next apply.`);
            }
            continue;
        }

        const filename = `vistalyze_${state.sessionId}_${key}.png`;
        if (!state.fileIndex.has(filename)) {
            warn('Boot', `Asset missing from server: ${filename}. Queuing regeneration.`);
            queue.push(key);
        }
    }

    const currentDef = state.currentLocation ? state.locations[state.currentLocation] : null;
    const isCurrentCustom = !!currentDef?.customBg;
    const isCurrentImageMissing = !isCurrentCustom && state.currentImage && !state.fileIndex.has(state.currentImage);

    const meta = getMetaSettings();

    // 4. UI Restoration
    if (meta.enabled ?? true) {
        if (state.currentImage && !isCurrentImageMissing) {
            log('Boot', 'Restoring valid background:', state.currentImage);
            setBg(state.currentImage);
        } else {
            if (isCurrentImageMissing) {
                warn('Boot', `Active background ${state.currentImage} is missing. Clearing UI to prevent 404.`);
            }
            clearBg();
        }
    }

    // 5. Execute Regeneration Queue
    if ((meta.enabled ?? true) && queue.length > 0) {
        log('Boot', `Regenerating ${queue.length} missing assets...`);
        for (const key of queue) {
            const def = state.locations[key];
            if (!def) continue;

            generate(key, def, state.sessionId)
                .then(async filename => {
                    addToFileIndex(filename);
                    if (filename === state.currentImage) {
                        log('Boot', `Active background regenerated: ${filename}. Applying to UI.`);
                        setBg(filename);
                    }
                })
                .catch(err => error('Boot', `Regeneration failed for "${key}":`, err));
        }
    }

    // 6. Fast Orphan Detection (Badge Update)
    const suspects = fastDiff(allImages, meta?.knownSessions ?? []);
    if (suspects.length > 0) {
        const newAuditCache = {
            ...(meta.auditCache ?? {}),
            suspects: suspects
        };
        updateMetaSetting('auditCache', newAuditCache);
        showOrphanBadge(suspects.length);
    }
}