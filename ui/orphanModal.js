/**
 * @file data/default-user/extensions/vistalyze/ui/orphanModal.js
 * @stamp {"utc":"2026-04-04T12:55:00.000Z"}
 * @architectural-role Orphan File Review UI
 * @description
 * Modal for reviewing and deleting orphaned Vistalyze background images.
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @updates
 * - Migration: Replaced direct mutation of getMetaSettings().auditCache 
 *   with the updateMetaSetting() API.
 * - Standardized Flow: Audit results are cleared via the Stateful Owner.
 * - Integrated translation-ready t and translate wrappers for user-facing strings.
 *
 * @api-declaration
 * openOrphanModal(orphans) — opens the modal.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [none]
 *     external_io: [POST /api/backgrounds/delete, updateMetaSetting, clearOrphanBadge, i18n]
 */
import { getRequestHeaders, callPopup } from '../../../../../script.js'
import { t, translate } from '../../../../i18n.js'
import { clearOrphanBadge } from './toolbar.js'
import { updateMetaSetting } from '../settings/data.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function openOrphanModal(orphans) {
    if (!orphans || orphans.length === 0) {
        if (window.toastr) window.toastr.success(translate('vistalyze.orphan.success_no_orphans'), 'Vistalyze')
        return
    }

    const rowsHtml = orphans.map(filename => `
        <tr>
            <td style="width:32px; text-align:center;">
                <input type="checkbox" class="lz-orphan-check" value="${escapeHtml(filename)}" checked />
            </td>
            <td style="font-size:0.85em;">${escapeHtml(filename)}</td>
        </tr>
    `).join('')

    const popupPromise = callPopup(
        `<h3 data-i18n="vistalyze.orphan.title">Orphaned Vistalyze Images (${orphans.length})</h3>
        <p style="opacity:0.65;font-size:0.88em;" data-i18n="vistalyze.orphan.hint">These files belong to sessions not found in any known chat.</p>
        <div style="max-height:300px; overflow-y:auto; border:1px solid var(--SmartThemeBorderColor); border-radius:4px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.88em;">
                <thead>
                    <tr>
                        <th style="width:32px;text-align:center;">
                            <input type="checkbox" id="lz-orphan-select-all" data-i18n="[title]vistalyze.orphan.select_all_title" title="Select All" checked />
                        </th>
                        <th style="text-align:left;" data-i18n="vistalyze.orphan.label_filename">Filename</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`,
        'confirm',
    )

    // Bind select-all on the next tick — callPopup renders synchronously
    // before returning the promise, so the elements are in the DOM here.
    setTimeout(() => {
        $('#lz-orphan-select-all').off('change').on('change', function () {
            $('.lz-orphan-check').prop('checked', this.checked)
        })
    }, 0)

    const confirmed = await popupPromise

    if (!confirmed) return

    const selected = $('.lz-orphan-check:checked').map(function () { return this.value }).get()
    if (selected.length === 0) {
        if (window.toastr) window.toastr.warning(translate('vistalyze.orphan.warn_no_selection'), 'Vistalyze')
        return
    }

    let failed = 0
    for (const file of selected) {
        try {
            const res = await fetch('/api/backgrounds/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ bg: file }),
            })
            if (!res.ok) failed++
        } catch {
            failed++
        }
    }

    // Protected Update: Reset the global audit cache via Setter API
    const cleanAuditCache = {
        suspects: [],
        lastAudit: new Date().toISOString(),
        orphans: []
    }
    updateMetaSetting('auditCache', cleanAuditCache);
    
    clearOrphanBadge()

    if (failed > 0) {
        if (window.toastr) window.toastr.warning(t`Deleted ${selected.length - failed} files. ${failed} deletion(s) failed.`, 'Vistalyze')
    } else {
        if (window.toastr) window.toastr.success(t`Deleted ${selected.length} orphaned file(s).`, 'Vistalyze')
    }
}