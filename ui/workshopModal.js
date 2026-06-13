/**
 * @file data/default-user/extensions/vistalyze/ui/workshopModal.js
 * @stamp {"utc":"2026-05-06T15:20:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * High-level coordinator for the Location Workshop. 
 * Updated to show manual gallery selections as "Proposed" changes.
 *
 * @updates
 * - Visual Separation: Current Background (Left) now strictly reflects the 
 *   persisted state in the live library.
 * - Proposed Changes: The Right box now displays manual gallery selections 
 *   (customBg) or AI-generated previews.
 * - terminology fix: Standardized "Pick from Gallery" labels.
 *
 * @api-declaration
 * renderLibrary()   — updates the Library tab content.
 * renderArchitect() — updates the Architect tab content.
 * switchTab(name)   — toggles visibility and triggers re-renders.
 * injectWorkshop()  — initializes the modal shell and bindings.
 * openWorkshop(tab) — primary entry point to display the modal.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Shell
 *     state_ownership: []
 *     external_io: [JQuery DOM (write), templates.js, listeners.js, i18n]
 */

import { translate } from '../../../../i18n.js';
import { state, setWorkshopKey, syncDrafts } from '../state.js';
import { 
    getBaseWorkshopHTML, 
    getLibraryListHTML, 
    getArchitectGridHTML, 
    getArchitectEmptyHTML 
} from './workshop/templates.js';
import { bindWorkshopEvents } from './workshop/listeners.js';

/**
 * Renders the Library list based on _draftLocations.
 */
export function renderLibrary() {
    const drafts = Object.entries(state._draftLocations);
    const html = getLibraryListHTML(drafts, state.currentLocation, state.allFileIndex, state.sessionId);
    $('.lz-library-list').html(html);
}

/**
 * Renders the Architect tab for the current active workshop key.
 * Resolves the "Current" box from live state and "Proposed" box from draft state.
 */
export async function renderArchitect() {
    // Default to current location if none selected
    if (!state._activeWorkshopKey && state.currentLocation && state._draftLocations[state.currentLocation]) {
        setWorkshopKey(state.currentLocation);
    }

    const key = state._activeWorkshopKey;
    const draft = state._draftLocations[key];
    const live = state.locations[key]; // Access the live, unedited definition
    
    const $container = $('#lz-tab-architect');
    const $altBtn = $('#lz-workshop-alt-bg');

    if (!draft) {
        $container.html(getArchitectEmptyHTML());
        $altBtn.text(translate('Pick from Gallery', 'vistalyze.workshop.btn_hijack')).prop('disabled', true);
        return;
    }

    // Toggle footer button text based on draft customBg state
    const altBtnText = draft.customBg ? translate('Clear manual selection', 'vistalyze.workshop.btn_clear_bg') : translate('Pick from Gallery', 'vistalyze.workshop.btn_hijack');
    $altBtn.text(altBtnText).prop('disabled', false);

    // --- Box 1: Current Background (Left) ---
    // Strictly resolve from the LIVE library state.
    let currentImgUrl = '';
    if (live) {
        const liveSourceId = live.sourceSessionId || state.sessionId;
        const liveFilename = live.customBg || (liveSourceId ? `vistalyze_${liveSourceId}_${key}.png` : null);
        
        if (liveFilename && (!!live.customBg || state.allFileIndex.has(liveFilename))) {
            currentImgUrl = `backgrounds/${encodeURIComponent(liveFilename)}?v=${Date.now()}`;
        }
    }

    // --- Box 2: Proposed Background (Right) ---
    let proposedImgUrl = '';
    let proposedLabel = translate('Proposed', 'vistalyze.workshop.proposed_label');

    if (state._proposedFullBlob) {
        proposedImgUrl = state._proposedFullBlob;
        proposedLabel = translate('Full Resolution', 'vistalyze.workshop.full_res_label');
    } else if (state._proposedImageBlob) {
        proposedImgUrl = state._proposedImageBlob;
        proposedLabel = translate('Thumbnail Preview', 'vistalyze.workshop.btn_preview');
    } else if (draft.customBg && draft.customBg !== live?.customBg) {
        // If a manual background is selected and it differs from the live one, show it as proposed.
        proposedImgUrl = `backgrounds/${encodeURIComponent(draft.customBg)}?v=${Date.now()}`;
        proposedLabel = translate('Selected from Gallery', 'vistalyze.workshop.selected_gallery_label');
    }

    $container.html(getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl, proposedLabel));
}

/**
 * Switches the active tab and triggers the appropriate render logic.
 */
export function switchTab(tabName) {
    $('.lz-tab-btn').removeClass('lz-active');
    $(`.lz-tab-btn[data-tab="${tabName}"]`).addClass('lz-active');
    
    $('.lz-tab-panel').addClass('lz-hidden');
    $(`#lz-tab-${tabName}`).removeClass('lz-hidden');

    // Visibility Pass: Contextual Action revelation
    $('#lz-workshop-global-lib').toggleClass('lz-hidden', tabName !== 'library');
    $('#lz-workshop-alt-bg').toggleClass('lz-hidden', tabName !== 'architect');

    if (tabName === 'library') renderLibrary();
    if (tabName === 'architect') renderArchitect();
}

/**
 * Entry point to inject the workshop and bind its listeners.
 */
export function injectWorkshop() {
    if ($('#lz-workshop-overlay').length) return;
    
    $('body').append(getBaseWorkshopHTML(state.sessionId));
    
    bindWorkshopEvents({
        switchTab,
        renderLibrary,
        renderArchitect
    });
}

/**
 * Primary entry point to display the Workshop modal.
 */
export function openWorkshop(tab = 'library') {
    syncDrafts(); 
    injectWorkshop();
    $('#lz-workshop-overlay').removeClass('lz-hidden');
    switchTab(tab);
}