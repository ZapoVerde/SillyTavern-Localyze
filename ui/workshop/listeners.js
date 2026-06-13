/**
 * @file data/default-user/extensions/vistalyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-05-06T15:05:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Location Workshop modal.
 *
 * @updates
 * - Standardized Warning: Updated "Select a location" warning to use "Pick from Gallery" context.
 * - Refresh Logic: Ensures renderArchitect is called after customBg changes to update the button label.
 *
 * @api-declaration
 * bindWorkshopEvents(handlers) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [JQuery DOM Events, maintenance.js, commit.js, bgHijacker.js, i18n]
 */

import { t, translate } from '../../../../../i18n.js';
import { state, setWorkshopKey, setProposedBlob, updateDraftField } from '../../state.js';
import { error } from '../../utils/logger.js';
import { pickNativeBackground } from '../bgHijacker.js';
import { openGlobalLibrary } from '../importModal.js';
import {
    regenField,
    discoverySearch,
    previewProposedImage,
    deleteDraftLocation
} from '../../logic/maintenance.js';

/**
 * Binds all listeners for the workshop modal.
 * @param {object} handlers Object containing { switchTab, renderLibrary, renderArchitect }
 */
export function bindWorkshopEvents(handlers) {
    const { switchTab, renderLibrary, renderArchitect } = handlers;
    const $overlay = $('#lz-workshop-overlay');

    // ─── Structural Control ───────────────────────────────────────────────
    
    // Tab switching logic
    $overlay.on('click', '.lz-tab-btn', function() { 
        switchTab($(this).data('tab')); 
    });

    // Close button logic
    $overlay.on('click', '#lz-workshop-close', () => { 
        $overlay.addClass('lz-hidden'); 
    });

    // ─── Global Footer Actions ───────────────────────────────────────────

    /**
     * Global Library Access.
     * Hides the current workshop and enters the cross-chat discovery mode.
     */
    $overlay.on('click', '#lz-workshop-global-lib', () => {
        $overlay.addClass('lz-hidden');
        openGlobalLibrary();
    });

    /**
     * Standardized Background Action Button.
     * Handles both selection and clearing of manual backgrounds.
     */
    $overlay.on('click', '#lz-workshop-alt-bg', async function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) {
            if (window.toastr) window.toastr.warning(translate('Select a location first.', 'vistalyze.workshop.warn_no_location'));
            return;
        }

        const draft = state._draftLocations[key];

        if (draft.customBg) {
            // Path A: Clear existing selection
            updateDraftField(key, 'customBg', null);
            renderArchitect();
            renderLibrary();
        } else {
            // Path B: Open native ST gallery
            const filename = await pickNativeBackground();
            if (filename) {
                updateDraftField(key, 'customBg', filename);
                renderArchitect();
                renderLibrary();
            }
        }
    });

    // ─── Library Tab Listeners ────────────────────────────────────────────

    // Thumbnail click: open full-screen lightbox
    $overlay.on('click', '.lz-lib-thumb', function(e) {
        e.stopPropagation();
        const filename = $(this).data('filename');
        if (!filename) return;

        const url = `backgrounds/${encodeURIComponent(filename)}?v=${Date.now()}`;

        const $backdrop = $('<div>').css({
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.92)',
            zIndex: '99999',
            cursor: 'zoom-out'
        });

        const $img = $('<img>').attr({ src: url, alt: filename }).css({
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '100vw',
            maxHeight: '100vh',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            zIndex: '100000',
            cursor: 'zoom-out'
        });

        const cleanup = () => { $backdrop.remove(); $img.remove(); };
        $backdrop.on('click', cleanup);
        $img.on('click', cleanup);

        $('body').append($backdrop).append($img);
    });

    // Navigate from Library to Architect
    $overlay.on('click', '.lz-lib-edit', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        
        // Protected Update: Activate for editing and clear stale previews
        setWorkshopKey(key);
        setProposedBlob('thumbnail', null);
        setProposedBlob('full', null);
        
        switchTab('architect');
    });

    // Remove location from draft library
    $overlay.on('click', '.lz-lib-delete', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        const name = state._draftLocations[key]?.name || translate('this location', 'vistalyze.workshop.this_location');
        
        if (confirm(t`Remove "${name}" from the library?`)) {
            deleteDraftLocation(key);
            renderLibrary();
            if (state._activeWorkshopKey === key) renderArchitect();
        }
    });

    // Text area click: apply directly and close
    $overlay.on('click', '.lz-lib-text', async function() {
        const key = $(this).closest('.lz-library-item').data('key');
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');

        try {
            await handleFinalizeWorkshop(key);
            $overlay.addClass('lz-hidden');
        } catch (err) {
            error('Workshop', 'Apply failed:', err);
        }
    });

    // Folder icon shortcut: pick an existing ST background for this item
    $overlay.on('click', '.lz-lib-pick-bg', async function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');

        const filename = await pickNativeBackground();
        if (filename) {
            updateDraftField(key, 'customBg', filename);
            renderLibrary();
            if (state._activeWorkshopKey === key) renderArchitect();
        }
    });

    // ─── Architect Tab Listeners ──────────────────────────────────────────
    
    // Live Input Syncing
    $overlay.on('input', '#lz-arch-name, #lz-arch-definition, #lz-arch-visuals', function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) return;

        const fieldMap = {
            'lz-arch-name': 'name',
            'lz-arch-definition': 'description',
            'lz-arch-visuals': 'imagePrompt'
        };

        updateDraftField(key, fieldMap[this.id], $(this).val());

        if (this.id === 'lz-arch-visuals') {
            $('#lz-preview-after').attr('src', '').hide();
        }
    });

    // AI Refinement (The "Sparks")
    $overlay.on('click', '.lz-regen-spark', async function() {
        const field = $(this).data('field');
        const key = state._activeWorkshopKey;
        const $icon = $(this);

        $icon.addClass('fa-spin');
        try {
            const success = await regenField(key, field);
            if (success) renderArchitect();
        } finally {
            $icon.removeClass('fa-spin');
        }
    });

    // Thumbnail Preview
    $overlay.on('click', '#lz-arch-preview-btn', async function() {
        const key = state._activeWorkshopKey;
        const $spinner = $('#lz-preview-spinner');
        
        $spinner.removeClass('lz-hidden');
        try {
            await previewProposedImage(key);
            renderArchitect();
        } catch (err) {
            if (window.toastr) window.toastr.error(t`Preview failed: ${err.message}`);
        } finally {
            $spinner.addClass('lz-hidden');
        }
    });

    // Finalize Draft
    $overlay.on('click', '#lz-arch-finalize', async function() {
        const key = state._activeWorkshopKey;
        if (!key) {
            if (window.toastr) window.toastr.warning(translate('Select a location in the Architect tab first.', 'vistalyze.workshop.warn_no_architect_location'), 'Vistalyze');
            return;
        }
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        const $btn = $(this);

        $btn.prop('disabled', true).text(translate('Generating...', 'vistalyze.workshop.status_generating'));
        try {
            await handleFinalizeWorkshop(key);
            $btn.prop('disabled', false).text(translate('Apply and Finalize', 'vistalyze.workshop.btn_finalize'));
            $overlay.addClass('lz-hidden');
        } catch (err) {
            $btn.prop('disabled', false).text(translate('Apply and Finalize', 'vistalyze.workshop.btn_finalize'));
            error('Workshop', 'Commit failed:', err);
            if (window.toastr) window.toastr.error(t`Generation failed: ${err.message}`, 'Vistalyze');
        }
    });

    // ─── Explorer Tab Listeners ───────────────────────────────────────────
    
    $overlay.on('click', '#lz-explorer-go', async function() {
        const keywords = $('#lz-explorer-keywords').val();
        const $status = $('#lz-explorer-status');
        const $btn = $(this);

        $status.removeClass('lz-hidden');
        $btn.prop('disabled', true);
        
        try {
            const key = await discoverySearch(keywords);
            if (key) {
                setProposedBlob('thumbnail', null);
                setProposedBlob('full', null);
                switchTab('architect');
                $('#lz-explorer-keywords').val('');
            } else {
                if (window.toastr) window.toastr.warning(translate('Could not discover a new location from current context.', 'vistalyze.workshop.warn_no_discovery'));
            }
        } catch (err) {
            error('Workshop', 'Discovery failed:', err);
        } finally {
            $status.addClass('lz-hidden');
            $btn.prop('disabled', false);
        }
    });
}