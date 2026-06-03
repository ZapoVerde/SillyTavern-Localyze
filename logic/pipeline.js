/**
 * @file data/default-user/extensions/vistalyze/logic/pipeline.js
 * @stamp {"utc":"2026-05-08T07:15:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the "Falling Water" detection pipeline.
 * 
 * @updates
 * - Persistence Fix: Removed clearBg() and state-nulling from cancellation paths.
 *   If a new location discovery is cancelled or fails, the system now remains 
 *   at the current location instead of falling back to a blank background.
 *
 * @api-declaration
 * runPipeline(messageId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [LLM Calls, Chat Writes, Image Generation, Background UI]
 */

import { callPopup } from '../../../../../script.js';
import { t, translate } from '../../../../i18n.js';
import { getContext } from '../../../../extensions.js';
import { error } from '../utils/logger.js';
import { state, updateState, upsertLocation, addToFileIndex } from '../state.js';
import { getSettings } from '../settings/data.js';
import { buildHistoryText, buildDescriberContext, buildSpatialContext, escapeHtml, slugify } from '../utils/history.js';
import { detectBoolean, detectClassifier, detectDescriber } from '../detector.js';
import { generate } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { openAddModal } from '../ui/addModal.js';
import { 
    lockedWriteSceneRecord, 
    lockedPatchSceneImage, 
    lockedWriteLocationDef 
} from '../io/dnaWriter.js';

/**
 * Main entry point for the per-turn detection logic.
 * Triggered by AI message arrival.
 * @param {number} messageId 
 */
export async function runPipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    
    if (!message || message.is_user) return;

    const s = getSettings();
    if (!(s.autoDetectEnabled ?? true)) return;

    const locationKeys = Object.keys(state.locations);

    // Step 1: Boolean Gate
    if (state.currentLocation !== null) {
        const historyText = buildHistoryText(context.chat, messageId, s.booleanHistory ?? 0);
        const changed = await detectBoolean(
            message.mes, 
            state.currentLocation, 
            historyText,
            s.booleanPrompt, 
            s.booleanProfileId
        );
        if (!changed) return;
    }

    // Step 2: Classifier
    if (locationKeys.length > 0) {
        // Build a highly-structured Search Index for the LLM
        const formatEntry = ([key, loc]) =>
            `${loc.name} — ${loc.description ?? 'Unknown'} (ID: [${key}])`;

        const descriptiveList = Object.entries(state.locations)
            .map(formatEntry)
            .join('\n');

        const filteredList = Object.entries(state.locations)
            .filter(([key]) => key !== state.currentLocation)
            .map(formatEntry)
            .join('\n');

        const currentLocationName = state.currentLocation
            ? (state.locations[state.currentLocation]?.name ?? state.currentLocation)
            : 'Unknown';

        const historyText = buildHistoryText(context.chat, messageId, s.classifierHistory ?? 0);
        const { spatial_transitions, spatial_discovery_count } = buildSpatialContext(
            state.currentLocation,
            state.transitionsMap,
            state.newFromMap
        );
        const matchedKey = await detectClassifier(
            message.mes,
            locationKeys,
            historyText,
            s.classifierPrompt
                .replace('{{current_location}}', currentLocationName)
                .replace('{{key_list}}', descriptiveList)
                .replace('{{filtered_list}}', filteredList)
                .replace('{{spatial_transitions}}', spatial_transitions)
                .replace('{{spatial_discovery_count}}', spatial_discovery_count),
            s.classifierProfileId
        );
        
        if (matchedKey !== null) {
            await handleKnownLocation(messageId, matchedKey);
            return;
        }
    }

    // Step 3: Describer
    await handleUnknownLocation(messageId, context);
}

/**
 * Handles transition to a location already in the library.
 */
async function handleKnownLocation(messageId, key) {
    const filename = `vistalyze_${state.sessionId}_${key}.png`;
    const def = state.locations[key];

    if (state.allFileIndex.has(filename)) {
        // Apply background and update scene state via setter
        setBg(filename);
        await lockedWriteSceneRecord(messageId, { location: key, image: filename, bg_declined: false });
        updateState(key, filename);
        document.dispatchEvent(new CustomEvent('vistalyze:location-changed', { detail: { messageId } }));
    } else {
        // Transition recorded but image is missing: clear and generate
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: key, image: null, bg_declined: false });
        updateState(key, null);
        document.dispatchEvent(new CustomEvent('vistalyze:location-changed', { detail: { messageId } }));

        const capturedId = messageId;
        generate(key, def, state.sessionId)
            .then(async newFile => {
                addToFileIndex(newFile);
                await lockedPatchSceneImage(capturedId, newFile);
                // Only apply if a later pipeline hasn't already moved to a different location
                if (state.currentLocation === key) {
                    updateState(key, newFile);
                    setBg(newFile);
                }
            })
            .catch(err => {
                error('Pipeline', 'Known location generate failed:', err);
                if (window.toastr) window.toastr.error(t`Generation failed: ${err.message}`, 'Vistalyze');
            });
    }
}

/**
 * Handles extraction and approval of a brand new location.
 */
async function handleUnknownLocation(messageId, context) {
    const s = getSettings();
    const contextText = buildDescriberContext(context.chat, messageId, s.describerHistory ?? 0);

    const rawDef = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId);

    if (rawDef === null) {
        // Fallback: Remain in the current location if AI fails to identify the new one
        return;
    }

    // Construct the definition using standardized keys
    const def = {
        ...rawDef,
        key: slugify(rawDef.name)
    };

    // Don't prompt if the user is in the character editor (not viewing chat)
    const charEditorOpen = document.getElementById('rm_ch_create_block')?.offsetParent !== null;
    if (charEditorOpen) {
        return;
    }

    // Gate 1: Location Discovery Approval
    let confirmed = s.autoAcceptLocation;
    if (!confirmed) {
        confirmed = await callPopup(
            `<h3>${translate('New location detected:')} ${escapeHtml(def.name)}</h3>
            <p><em>${escapeHtml(def.description)}</em></p>
            <p style="font-size:0.9em; opacity:0.8;">${escapeHtml(def.imagePrompt)}</p>`,
            'confirm'
        );
    }

    if (!confirmed) {
        // Fallback: Remain in the current location if user rejects the discovery
        return;
    }

    // Gate 2: Description Review Approval
    let approved = null;
    if (s.autoAcceptDescription) {
        approved = { ...def };
        if (window.toastr) window.toastr.success(t`Auto-accepted new location: ${approved.name}`, 'Vistalyze');
    } else {
        approved = await openAddModal(def);
    }

    if (approved === null) {
        // Fallback: Remain in the current location if user cancels the review modal
        return;
    }

    const defMsgId = messageId > 0 ? messageId - 1 : messageId;
    await lockedWriteLocationDef(defMsgId, approved, state.sessionId);
    
    // Protected Update: Persist the new definition to live memory
    upsertLocation(approved);
    
    if (approved.customBg) {
        // Path A: User selected an existing background from the ST gallery
        await lockedWriteSceneRecord(messageId, { location: approved.key, image: approved.customBg, bg_declined: false });
        updateState(approved.key, approved.customBg);
        setBg(approved.customBg);
        document.dispatchEvent(new CustomEvent('vistalyze:location-changed', { detail: { messageId } }));
    } else {
        // Path B: AI Generation (Standard Two-Write Pattern)
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: approved.key, image: null, bg_declined: false });
        
        // Protected Update: Set scene intent
        updateState(approved.key, null);
        document.dispatchEvent(new CustomEvent('vistalyze:location-changed', { detail: { messageId } }));

        const capturedId = messageId;
        const capturedKey = approved.key;
        generate(capturedKey, approved, state.sessionId)
            .then(async newFile => {
                addToFileIndex(newFile);
                await lockedPatchSceneImage(capturedId, newFile);
                // Only apply if a later pipeline hasn't already moved to a different location
                if (state.currentLocation === capturedKey) {
                    updateState(capturedKey, newFile);
                    setBg(newFile);
                }
            })
            .catch(err => {
                error('Pipeline', 'Generate failed after approve:', err);
                if (window.toastr) window.toastr.error(t`Generation failed: ${err.message}`, 'Vistalyze');
            });
    }
}