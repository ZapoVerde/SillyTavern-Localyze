/**
 * @file data/default-user/extensions/vistalyze/logic/commit.js
 * @stamp {"utc":"2026-05-06T14:15:00.000Z"}
 * @version 1.4.0
 * @architectural-role IO Executor / Finalizer
 * @description
 * Handles the "Commit Phase" of the Location Workshop. Responsible for 
 * taking the finalized draft state from the UI and persisting it to 
 * the chat history and filesystem.
 *
 * @updates
 * - Integrated sourceSessionId support: Implemented branching to detect and 
 *   verify borrowed assets from foreign sessions before falling back to generation.
 * - Implemented Swipe-Safety: DNA writes are now redirected to the nearest 
 *   User message to prevent data loss during AI message regeneration (swiping).
 * - Existence Check: Updated needsGeneration to check against the global file 
 *   registry (allImages/fileIndex) for both native and borrowed filenames.
 *
 * @api-declaration
 * handleFinalizeWorkshop(targetKey) — Persists a draft and applies it as the active scene.
 * commitDraftLibrary() — Synchronizes changed draft locations to the chat history.
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO Executor
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [DNA Writer, Image Cache, Background UI, saveChatConditional, i18n]
 */

import { saveChatConditional } from '../../../../../script.js';
import { t, translate } from '../../../../i18n.js';
import { getContext } from '../../../../extensions.js';
import { log, warn, error } from '../utils/logger.js';
import { 
    state, 
    updateState, 
    upsertLocation, 
    removeLocation, 
    addToFileIndex, 
    clearWorkshop 
} from '../state.js';
import { generate, uploadBlob } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import {
    lockedWriteLocationDef,
    lockedWriteLocationDelete,
    lockedWriteSceneRecord,
    lockedPatchSceneImage
} from '../io/dnaWriter.js';

/**
 * Returns a message index that is safe from AI swipes.
 * If the provided index is an AI message, it searches backwards for the 
 * nearest User message.
 * @param {number} index 
 * @returns {number}
 */
function getSwipeSafeId(index) {
    const context = getContext();
    const chat = context.chat;
    if (index < 0 || !chat) return 0;
    
    for (let i = index; i >= 0; i--) {
        if (chat[i].is_user) return i;
    }
    return 0;
}

/**
 * Commits the current _draftLocations to the live state and persists them to DNA.
 * Syncs manual edits made in the Architect tab.
 */
async function commitDraftLibrary() {
    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const safeMsgId = getSwipeSafeId(lastMsgId);
    
    for (const [key, draftDef] of Object.entries(state._draftLocations)) {
        const original = state.locations[key];
        const isNew = !original;
        const isModified = original && (
            original.name !== draftDef.name ||
            original.description !== draftDef.description ||
            original.imagePrompt !== draftDef.imagePrompt ||
            original.customBg !== draftDef.customBg ||
            original.sourceSessionId !== draftDef.sourceSessionId
        );

        if (isNew || isModified) {
            log('Commit', `Persisting definition for: ${key}`);
            await lockedWriteLocationDef(safeMsgId, draftDef, state.sessionId);
            
            // Protected Update: Sync local library memory
            upsertLocation(draftDef);
        }
    }

    // Handle deletions
    for (const key of Object.keys(state.locations)) {
        if (!state._draftLocations[key]) {
            log('Commit', `Removing deleted location: ${key}`);
            await lockedWriteLocationDelete(safeMsgId, key);

            // Protected Update: Delete from local library memory
            removeLocation(key);
        }
    }
}

/**
 * The primary "Apply" logic for the Workshop.
 * Persists changes, generates images if needed, and updates the background.
 * Uses the Two-Write Pattern for data safety.
 * 
 * @param {string} targetKey The slug of the location being applied.
 * @param {boolean} forceRegen If true, forces a new image generation.
 */
export async function handleFinalizeWorkshop(targetKey, forceRegen = false) {
    if (!targetKey || !state._draftLocations[targetKey]) {
        throw new Error(`[Vistalyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const safeMsgId = getSwipeSafeId(lastMsgId);

    const draftDef = state._draftLocations[targetKey];
    const original = state.locations[targetKey];

    // --- Branching Asset Resolution ---
    let targetFilename;
    if (draftDef.customBg) {
        targetFilename = draftDef.customBg;
    } else if (draftDef.sourceSessionId) {
        // Construct filename for borrowed asset
        targetFilename = `vistalyze_${draftDef.sourceSessionId}_${targetKey}.png`;
    } else {
        // Standard session-bound filename
        targetFilename = `vistalyze_${state.sessionId}_${targetKey}.png`;
    }

    // Existence check against the full cross-session index so borrowed files are found
    const fileExists = state.allFileIndex.has(targetFilename);

    // Detect if the visual state changed
    const visualsModified = original && (
        original.imagePrompt !== draftDef.imagePrompt || 
        original.customBg !== draftDef.customBg ||
        original.sourceSessionId !== draftDef.sourceSessionId
    );

    const hasPregeneratedBlob = state._proposedFullBlob !== null;

    // Generation needed if:
    // 1. Not a manual custom background
    // 2. AND (Forced OR visuals changed OR file missing)
    // Note: Borrowed files (sourceSessionId) skip generation if they exist.
    let needsGeneration = false;
    if (!draftDef.customBg) {
        if (draftDef.sourceSessionId) {
            if (!fileExists) {
                warn('Commit', `Borrowed asset ${targetFilename} missing. Localizing via generation.`);
                needsGeneration = true;
            }
        } else {
            needsGeneration = hasPregeneratedBlob || forceRegen || visualsModified || !fileExists;
        }
    }

    // 1. Sync the library (Metadata definitions)
    await commitDraftLibrary();

    // 2. WRITE 1: Immediate Narrative Intent (Saved to swipe-safe User message)
    log('Commit', `Write 1: Recording transition to ${targetKey} at msg ${safeMsgId}`);
    await lockedWriteSceneRecord(safeMsgId, {
        location: targetKey,
        image: null, 
        bg_declined: false
    });
    
    // Protected Update: Record intent in runtime state
    updateState(targetKey, null);

    if (needsGeneration) {
        clearBg();

        try {
            // Localization: If we generate, we use the current session ID
            const generationFilename = `vistalyze_${state.sessionId}_${targetKey}.png`;

            // 3. IO: Async Asset Creation/Transfer
            const newFile = hasPregeneratedBlob
                ? await uploadBlob(state._proposedFullBlob, generationFilename)
                : await generate(targetKey, draftDef, state.sessionId);

            // Protected Update: Record server file existence
            addToFileIndex(newFile);

            // 4. WRITE 2: Eventual Consistency
            log('Commit', `Write 2: Patching transition with ${newFile}`);
            await lockedPatchSceneImage(safeMsgId, newFile);
            
            // Protected Update: Record asset completion
            updateState(targetKey, newFile);
            setBg(newFile);

            if (window.toastr) window.toastr.success(t`Location applied: ${draftDef.name}`, 'Vistalyze');
        } catch (err) {
            error('Commit', 'Write 2 failed (Image IO):', err);
            if (window.toastr) window.toastr.error(t`Transition saved, but image failed: ${err.message}`, 'Vistalyze');
        }
    } else {
        // Immediate transition: Asset (custom, borrowed, or native) exists
        await lockedPatchSceneImage(safeMsgId, targetFilename);
        updateState(targetKey, targetFilename);
        setBg(targetFilename);
        if (window.toastr) window.toastr.success(t`Location switched to: ${draftDef.name}`, 'Vistalyze');
    }

    // Protected Update: Wipe temporary workshop memory
    clearWorkshop();
}

/**
 * Retroactive location assignment.
 * Writes a scene record at a specific historical message.
 * Target message is adjusted for swipe-safety if it is an AI message.
 *
 * @param {string} targetKey The slug of the location being applied.
 * @param {number} msgId     The specific message index to tag.
 */
export async function handleFinalizeWorkshopAtMessage(targetKey, msgId) {
    if (!targetKey || !state._draftLocations[targetKey]) {
        throw new Error(`[Vistalyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const draftDef = state._draftLocations[targetKey];
    
    // Target the User message to ensure historical metadata survives swipes
    const safeMsgId = getSwipeSafeId(msgId);
    const isCurrentContext = (msgId === lastMsgId);

    // 1. Sync the library
    await commitDraftLibrary();

    // 2. Write the scene record
    await lockedWriteSceneRecord(safeMsgId, {
        location: targetKey,
        image: null,
        bg_declined: false
    });

    if (isCurrentContext) {
        // Delegate to standard active finalize for consistency
        await handleFinalizeWorkshop(targetKey);
    } else {
        // Historical tag — DNA chain patched, background unchanged
        // We write the image filename immediately as generation is rarely 
        // appropriate for retroactive tagging of missing assets.
        const targetFilename = draftDef.customBg || 
            (draftDef.sourceSessionId ? `vistalyze_${draftDef.sourceSessionId}_${targetKey}.png` : `vistalyze_${state.sessionId}_${targetKey}.png`);
        
        await lockedPatchSceneImage(safeMsgId, targetFilename);
        if (window.toastr) window.toastr.info(t`Tagged as: ${draftDef.name}`, 'Vistalyze');
        clearWorkshop();
    }
}