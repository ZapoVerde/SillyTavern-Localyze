/**
 * @file data/default-user/extensions/vistalyze/ui/addModal.js
 * @stamp {"utc":"2026-05-06T12:00:00.000Z"}
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing and approving a new location definition.
 * Updated to implement the standardized split-footer layout.
 *
 * @updates
 * - Standardized "Select existing" button on the far left of the popup footer.
 * - Grouped "Cancel" and "Yes" buttons on the far right using a flex container.
 * - Applied lz-primary-action (Red) class to the "Yes" confirmation button.
 * - Simplified button text and removed icons for a cleaner "flat" appearance.
 *
 * @api-declaration
 * openAddModal(def) → Promise<{ name, key, description, imagePrompt, customBg } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, pickNativeBackground, i18n]
 */
import { callPopup } from '../../../../../script.js'
import { t, translate } from '../../../../i18n.js'
import { fetchPreviewBlob } from '../imageCache.js'
import { pickNativeBackground } from './bgHijacker.js'
import { escapeHtml, slugify } from '../utils/history.js'
import { error } from '../utils/logger.js'

/**
 * Opens the "Add Location" modal.
 * @param {object} def Initial definition from the AI detector.
 */
export async function openAddModal(def) {
    // 1. Cleanup stale state
    $('#lz-add-use-existing').remove();

    let earlyResult = null;

    const popupPromise = callPopup(
        `<h3 data-i18n="vistalyze.add_modal.title">Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_name">Location Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_key">Key (Unique ID)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" readonly style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_definition">Definition (Logical Identity)</label>
        <input type="text" id="lz-add-definition" class="text_pole" value="${escapeHtml(def.description ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_visuals">Visuals (Image Prompt)</label>
        <textarea id="lz-add-visuals" class="text_pole" rows="3" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(def.imagePrompt ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn" data-i18n="vistalyze.add_modal.btn_preview">Generate Preview</button>
            <span id="lz-preview-status" style="font-size:0.82em;opacity:0.65;margin-left:8px;"></span>
        </div>
        <div id="lz-preview-container" style="display:none;margin-top:8px;">
            <img id="lz-preview-img" src="" alt="Preview" style="width:100%;border-radius:4px; aspect-ratio: 16/9; object-fit: cover;" />
        </div>`,
        'confirm',
    )

    // 2. Structural Layout Adjustment (Split Footer)
    const $controls = $('#dialogue_popup_controls');
    const $okBtn     = $('#dialogue_popup_ok');
    const $cancelBtn = $('#dialogue_popup_cancel');

    // Create the left-aligned action
    const $useExistingBtn = $(`<div id="lz-add-use-existing" class="menu_button" style="white-space:nowrap;">
        <i class="fa-solid fa-images"></i> ${translate('vistalyze.add_modal.btn_use_existing')}
    </div>`);

    // Create the right-aligned group
    const $rightGroup = $('<div class="lz-footer-right"></div>');

    // Apply layout rules
    $controls.css({
        'display': 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'width': '100%',
        'padding': '10px 20px 20px'
    });

    // Color code the primary action
    $okBtn.addClass('lz-primary-action').text(translate('Yes'));
    $cancelBtn.text(translate('Cancel'));

    // Detach native buttons before emptying so jQuery preserves their event handlers.
    // .empty() calls cleanData() on removed children — detaching first prevents that.
    $okBtn.detach();
    $cancelBtn.detach();

    // Reconstruct the footer DOM
    $controls.empty().append($useExistingBtn).append($rightGroup);
    $rightGroup.append($cancelBtn).append($okBtn);

    // 3. Event Binding
    $('#lz-add-name').on('input', function () {
        $('#lz-add-key').val(slugify(this.value))
    })

    $useExistingBtn.on('click', async function () {
        const filename = await pickNativeBackground();
        if (!filename) return;

        const name = $('#lz-add-name').val().trim();
        const key  = $('#lz-add-key').val().trim();

        if (!name || !key) {
            if (window.toastr) window.toastr.warning(t`Fill in Name first, then select a background.`, 'Vistalyze');
            return;
        }

        earlyResult = {
            name,
            key,
            description: $('#lz-add-definition').val().trim(),
            imagePrompt: '',
            customBg: filename,
        };

        $cancelBtn.trigger('click');
    });

    $('#lz-add-preview-btn').on('click', async function () {
        const visuals = $('#lz-add-visuals').val().trim()
        if (!visuals) {
            if (window.toastr) window.toastr.warning(t`Enter visuals description first.`, 'Vistalyze');
            return;
        }

        const btn = $(this)
        const status = $('#lz-preview-status')
        btn.prop('disabled', true).text(translate('vistalyze.add_modal.status_fetching'))
        status.text('')

        try {
            const objectUrl = await fetchPreviewBlob(visuals)
            $('#lz-preview-container').show()
            $('#lz-preview-img').attr('src', objectUrl)
            status.text(translate('vistalyze.add_modal.preview_ready'))
        } catch (err) {
            error('Preview', 'failed:', err)
            status.text(t`Failed: ${err.message}`)
            if (window.toastr) window.toastr.warning(err.message, 'Vistalyze Preview')
        } finally {
            btn.prop('disabled', false).text(translate('vistalyze.add_modal.btn_preview'))
        }
    })

    const confirmed = await popupPromise;
    if (earlyResult) return earlyResult;
    if (!confirmed) return null;

    const name = $('#lz-add-name').val().trim();
    const key  = $('#lz-add-key').val().trim();

    if (!name || !key) {
        if (window.toastr) window.toastr.warning(t`Name and Key are required.`, 'Vistalyze');
        return null;
    }

    return {
        name,
        key,
        description: $('#lz-add-definition').val().trim(),
        imagePrompt: $('#lz-add-visuals').val().trim(),
        customBg: null,
    };
}