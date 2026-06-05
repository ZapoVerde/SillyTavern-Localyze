/**
 * @file data/default-user/extensions/vistalyze/ui/import/listeners.js
 * @stamp {"utc":"2026-05-06T22:30:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Global Library (Import) modal.
 *
 * @updates
 * - Deadlock Fix: Awaits the popupPromise to resolve the behavior selection 
 *   if the dialog is dismissed via native controls.
 * - Snippet Integration: Updated to consume the new result object from 
 *   scanChat ({ locations, snippet }).
 * - Satisfying Feedback: Added visual success states for bulk imports.
 *
 * @api-declaration
 * bindImportEvents(handlers) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO / Controller
 *     state_ownership: []
 *     external_io: [importController.js, templates.js, callPopup, JQuery DOM]
 */

import { callPopup } from '../../../../../../script.js';
import { t, translate } from '../../../../../i18n.js';
import { state } from '../../state.js';
import { 
    fetchCharacterChats, 
    scanChat, 
    performImport 
} from '../../logic/importController.js';
import { 
    getChatFolderHTML, 
    getExpandedLocationsHTML, 
    getCollisionModalHTML 
} from './templates.js';

/**
 * Binds all listeners for the Global Library UI.
 * @param {object} handlers { renderCharacters, renderChats, closeLibrary }
 */
export function bindImportEvents(handlers) {
    const { renderCharacters, renderChats, closeLibrary } = handlers;
    const $overlay = $('#lz-import-overlay');

    // ─── Navigation ──────────────────────────────────────────────────────

    // Select character -> Show their chats
    $overlay.on('click', '.lz-import-char-card', async function() {
        const avatar = $(this).data('avatar');
        const name = $(this).data('name');
        
        $('#lz-import-body').html(`<div style="text-align:center; padding:50px; opacity:0.6;"><i class="fa-solid fa-spinner fa-spin"></i> ${translate('vistalyze.import.scanning')}</div>`);
        
        try {
            const chatFilesRaw = await fetchCharacterChats(avatar);
            
            // FIX: Convert everything to a string immediately
            const chatFiles = chatFilesRaw.map(f => typeof f === 'string' ? f : f.file_name);

            const chatSummaries = [];
            const scans = chatFiles.map(filename => scanChat(avatar, filename, name));
            const results = await Promise.all(scans);

            results.forEach((res, idx) => {
                if (res.locations?.length > 0) {
                    chatSummaries.push({
                        filename: chatFiles[idx], // This is now guaranteed to be a string
                        count: res.locations.length,
                        snippet: res.snippet || '' 
                    });
                }
            });
            
            renderChats(name, avatar, chatSummaries);
        } catch (err) {
            console.error('[Vistalyze] Scan failed details:', err);
            $('#lz-import-body').html(`<p style="text-align:center; padding:20px; color:var(--SmartThemeErrorColor);">${translate('vistalyze.import.scan_failed')}</p>`);
        }
    });

    // Back to character grid
    $overlay.on('click', '#lz-import-back', () => renderCharacters());

    // Close button
    $overlay.on('click', '#lz-import-close', () => closeLibrary());

    // ─── Folder Interactions ─────────────────────────────────────────────

    // Toggle accordion
    $overlay.on('click', '.lz-folder-header', async function(e) {
        if ($(e.target).closest('.lz-import-all-btn').length) return;

        const $folder = $(this).closest('.lz-import-folder');
        const $content = $folder.find('.lz-folder-content');
        const $chevron = $folder.find('.lz-folder-toggle');
        const filename = $folder.data('filename');
        const avatar = $('#lz-import-current-avatar').val();
        const charName = $('#lz-import-current-name').val();

        if ($content.hasClass('lz-hidden')) {
            $content.html(`<div style="padding:10px; opacity:0.5;"><i class="fa-solid fa-spinner fa-spin"></i></div>`).removeClass('lz-hidden');
            $chevron.css('transform', 'rotate(180deg)');
            
            const { locations } = await scanChat(avatar, filename, charName);
            $content.html(getExpandedLocationsHTML(locations, state.allFileIndex));
        } else {
            $content.addClass('lz-hidden');
            $chevron.css('transform', 'rotate(0deg)');
        }
    });

    // ─── Tooltip Preview ─────────────────────────────────────────────────

    $overlay.on('mouseenter', '.lz-import-all-btn', async function() {
        const $folder = $(this).closest('.lz-import-folder');
        const filename = $folder.data('filename');
        const avatar = $('#lz-import-current-avatar').val();
        const charName = $('#lz-import-current-name').val();
        
        const { locations } = await scanChat(avatar, filename, charName);
        const names = locations.map(l => l.name).slice(0, 5);
        let tip = names.join(', ');
        if (locations.length > 5) {
            const remaining = locations.length - 5;
            tip += ` ${translate('vistalyze.import.and')} ${remaining} ${translate('vistalyze.import.more')}`;
        }
        
        $(this).attr('title', `${translate('vistalyze.import.imports_list')} ${tip}`);
    });

    // ─── Collision & Import Execution ────────────────────────────────────

    /**
     * Resolves key collisions before committing the import.
     */
    async function resolveAndImport(importList) {
        const conflicts = importList.filter(loc => !!state.locations[loc.key]);
        
        let behavior = 'overwrite';
        if (conflicts.length > 0) {
            const popupPromise = callPopup(getCollisionModalHTML(importList.length, conflicts.length), 'text');
            
            behavior = await new Promise((resolve) => {
                let resolved = false;
                const cleanup = (val) => {
                    resolved = true;
                    $('#dialog_overlay .menu_button:last').click(); // Native ST close
                    resolve(val);
                };

                $('#lz-collision-skip').on('click', () => cleanup('skip'));
                $('#lz-collision-overwrite').on('click', () => cleanup('overwrite'));
                $('#lz-collision-rename').on('click', () => cleanup('rename'));

                // Safety: Resolve to null (cancel) if dismissed via native controls
                popupPromise.then(() => { if (!resolved) resolve(null); });
            });
        }

        if (!behavior) return;

        const count = await performImport(importList, behavior);
        if (window.toastr) window.toastr.success(translate('vistalyze.import.success_count').replace('{{count}}', count), 'Vistalyze');
    }

    // Bulk Import All
    $overlay.on('click', '.lz-import-all-btn', async function(e) {
        e.stopPropagation();
        const $folder = $(this).closest('.lz-import-folder');
        const filename = $folder.data('filename');
        const avatar = $('#lz-import-current-avatar').val();
        const charName = $('#lz-import-current-name').val();
        const $btn = $(this);

        const originalHtml = $btn.html();
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

        const { locations } = await scanChat(avatar, filename, charName);
        await resolveAndImport(locations);

        $btn.html('<i class="fa-solid fa-check"></i>').addClass('success');
        setTimeout(() => $btn.prop('disabled', false).html(originalHtml).removeClass('success'), 2000);
    });

    // Import Single Location
    $overlay.on('click', '.lz-import-single-btn', async function(e) {
        e.stopPropagation();
        const $item = $(this).closest('.lz-import-item');
        const key = $item.data('key');
        const $folder = $(this).closest('.lz-import-folder');
        const filename = $folder.data('filename');

        const cache = state._importCache.locationLibrary[filename] || {};
        const chatLocations = cache.locations || [];
        const loc = chatLocations.find(l => l.key === key);
        
        if (loc) {
            await resolveAndImport([loc]);
        }
    });
}