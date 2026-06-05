/**
 * @file data/default-user/extensions/vistalyze/ui/toolbar.js
 * @stamp {"utc":"2026-04-04T13:15:00.000Z"}
 * @version 1.7.1
 * @architectural-role Toolbar UI
 * @description
 * Injects management buttons into the ST extensions panel (#extensionsMenu).
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @updates
 * - Migration: Replaced direct mutation of auditCache with the updateMetaSetting() API.
 * - Standardized Callbacks: Uses logic/maintenance.js controllers for all entries.
 * - Integrated translation-ready translate wrapper for user-facing strings.
 *
 * @api-declaration
 * injectToolbar(onOpenLibrary, onEdit) — Injects toolbar button.
 * showOrphanBadge(count) — shows red count badge on audit button (rendered in settings panel).
 * clearOrphanBadge()     — hides badge.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [none]
 *     external_io: [#extensionsMenu DOM, updateMetaSetting, maintenance.js, i18n]
 */

import { translate } from '../../../../i18n.js';

/**
 * Injects the Vistalyze button into the ST extension menu.
 * @param {Function} onOpenLibrary Callback from maintenance.js to sync and open library.
 * @param {Function} onEdit Callback for Architect mode.
 */
export function injectToolbar(onOpenLibrary, onEdit) {
    // 1. Cleanup for hot-reloads
    $('#lz-toolbar-btn').remove();

    // 2. Single Vistalyze Button
    const vistalyzeBtn = $(`
        <div id="lz-toolbar-btn" class="list-group-item flex-container flexGap5" 
             data-i18n="[title]vistalyze.toolbar.title"
             title="${translate('vistalyze.toolbar.title')}">
            <i class="fa-solid fa-location-dot"></i>
            <span data-i18n="vistalyze.toolbar.label">${translate('vistalyze.toolbar.label')}</span>
        </div>
    `);

    vistalyzeBtn.on('click', () => {
        if (typeof onOpenLibrary === 'function') onOpenLibrary();
    });

    // 3. DOM Injection
    const $menu = $('#extensionsMenu');
    if ($menu.length) {
        $menu.append(vistalyzeBtn);
    }
}

/**
 * Updates the visual badge for orphan detection results.
 * @param {number} count 
 */
export function showOrphanBadge(count) {
    if (count > 0) {
        $('#lz-orphan-badge').text(count).show();
    } else {
        clearOrphanBadge();
    }
}

/**
 * Hides the badge.
 */
export function clearOrphanBadge() {
    $('#lz-orphan-badge').hide().text('');
}