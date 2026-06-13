/**
 * @file data/default-user/extensions/vistalyze/ui/importModal.js
 * @stamp {"utc":"2026-05-06T20:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * High-level coordinator for the Global Library (Import) interface.
 * Manages the modal shell and view transitions.
 *
 * @updates
 * - Implemented view state management (Character Grid vs. Chat List).
 * - Integrated on-demand rendering via import/templates.js.
 * - Integrated event binding via import/listeners.js.
 *
 * @api-declaration
 * openGlobalLibrary() — Primary entry point to display the import interface.
 * closeGlobalLibrary() — Hides the modal and cleans up temporary UI state.
 * renderCharacters()  — Displays the character selection grid.
 * renderChats()       — Displays the filtered chat folder list for a character.
 *
 * @contract
 *   assertions:
 *     purity: UI Orchestrator
 *     state_ownership: []
 *     external_io: [JQuery DOM (write), importController.js, templates.js, listeners.js]
 */

import { translate } from '../../../../i18n.js';
import { getAvailableCharacters } from '../logic/importController.js';
import { getCharacterGridHTML, getChatFolderHTML } from './import/templates.js';
import { bindImportEvents } from './import/listeners.js';

/**
 * Injects the basic modal skeleton into the document if it doesn't exist.
 */
function injectImportModal() {
    if ($('#lz-import-overlay').length) return;

    const html = `
    <div id="lz-import-overlay" class="lz-overlay lz-hidden" style="z-index: 2100;">
        <div class="lz-modal" style="width: 700px; height: 70vh;">
            <div class="lz-workshop-header">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 id="lz-import-title" style="margin:0;">${translate('Global Library', 'vistalyze.import.title')}</h3>
                    <div id="lz-import-controls" style="display:flex; gap:10px;">
                        <button id="lz-import-back" class="menu_button lz-hidden" style="padding:4px 10px;">
                            <i class="fa-solid fa-arrow-left"></i> ${translate('Back', 'vistalyze.import.back')}
                        </button>
                        <i id="lz-import-close" class="fa-solid fa-xmark" style="cursor:pointer; font-size:1.4em; opacity:0.6;"></i>
                    </div>
                </div>
            </div>
            
            <div id="lz-import-body" class="lz-workshop-body" style="padding:15px; overflow-y:auto;">
                <!-- Content injected here by render functions -->
            </div>

            <!-- Hidden inputs to track current context for listeners -->
            <input type="hidden" id="lz-import-current-avatar" />
            <input type="hidden" id="lz-import-current-name" />
        </div>
    </div>`;

    $('body').append(html);

    bindImportEvents({
        renderCharacters,
        renderChats,
        closeLibrary: closeGlobalLibrary
    });
}

/**
 * Transitions the view to the Character Grid.
 */
export function renderCharacters() {
    $('#lz-import-title').text(translate('Global Library', 'vistalyze.import.title'));
    $('#lz-import-back').addClass('lz-hidden');
    
    const characters = getAvailableCharacters();
    $('#lz-import-body').html(getCharacterGridHTML(characters));
    
    // Clear context tracking
    $('#lz-import-current-avatar').val('');
    $('#lz-import-current-name').val('');
}

/**
 * Transitions the view to the Chat Folder list for a specific character.
 * @param {string} charName 
 * @param {string} avatarUrl 
 * @param {object[]} chatSummaries List of { filename, count, snippet }
 */
export function renderChats(charName, avatarUrl, chatSummaries) {
    $('#lz-import-title').text(`${charName} ${translate('chat log inventory', 'vistalyze.import.inventory')}`);
    $('#lz-import-back').removeClass('lz-hidden');
    
    // Track context for listeners
    $('#lz-import-current-avatar').val(avatarUrl);
    $('#lz-import-current-name').val(charName);

    if (chatSummaries.length === 0) {
        $('#lz-import-body').html(`<p style="text-align:center; opacity:0.5; padding:40px;">${translate('No Vistalyze locations found for this character.', 'vistalyze.import.no_locations')}</p>`);
        return;
    }

    const html = chatSummaries
        .map(summary => getChatFolderHTML(summary, summary.count))
        .join('');

    $('#lz-import-body').html(html);
}

/**
 * Opens the Global Library modal and initializes the view.
 */
export function openGlobalLibrary() {
    injectImportModal();
    $('#lz-import-overlay').removeClass('lz-hidden');
    renderCharacters();
}

/**
 * Hides the Global Library modal.
 */
export function closeGlobalLibrary() {
    $('#lz-import-overlay').addClass('lz-hidden');
}