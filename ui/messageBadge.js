/**
 * @file data/default-user/extensions/vistalyze/ui/messageBadge.js
 * @stamp {"utc":"2026-04-04T13:10:00.000Z"}
 * @version 1.0.1
 * @architectural-role UI / Per-Message Location Badge
 * @description
 * Injects a clickable location badge into the .mes_buttons bar of each AI message,
 * sitting alongside the other message action controls (edit, bookmark, etc.).
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @api-declaration
 * injectMessageBadge(messageId)  — Injects or refreshes the badge for one message.
 * reinjectAllBadges()            — Refreshes badges for all AI messages in the chat.
 *
 * @contract
 *   assertions:
 *     purity: UI / IO
 *     state_ownership: [none]
 *     external_io: [DOM (.mes_buttons), pickerModal, maintenance.js, i18n]
 */

import { getContext } from '../../../../extensions.js';
import { t, translate } from '../../../../i18n.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';
import { syncDraftState, handleEditLocation } from '../logic/maintenance.js';
import { getMetaSettings } from '../settings/data.js';

/**
 * Forward-scans the chat up to msgId and returns the last non-null location key.
 * This is the "effective" location active when that message was delivered.
 * @param {Array} chat
 * @param {number} msgId
 * @returns {string|null}
 */
function getLocationAtMessage(chat, msgId) {
    let current = null;
    for (let i = 0; i <= msgId; i++) {
        const vistalyze = chat[i]?.extra?.vistalyze;
        if (!vistalyze) continue;
        const records = Array.isArray(vistalyze) ? vistalyze : [vistalyze];
        for (const rec of records) {
            if (rec?.type === 'scene' && rec.location) current = rec.location;
        }
    }
    return current;
}

/**
 * Builds and attaches the badge into .mes_buttons for a message element.
 * Removes any existing badge first — safe for repeated calls.
 * @param {jQuery} $mes
 * @param {number} msgId
 */
function renderBadge($mes, msgId) {
    $mes.find('.lz-msg-badge').remove();

    const context = getContext();
    const locKey  = getLocationAtMessage(context.chat, msgId);
    const locName = locKey ? (state.locations[locKey]?.name ?? locKey) : null;
    const label   = locName ?? '?';

    const editIcon = locKey
        ? `<i class="fa-solid fa-pen-to-square lz-badge-edit"
               data-i18n="[title]vistalyze.badge.edit_architect"
               title="${translate('vistalyze.badge.edit_architect')}"
               style="opacity:0.6; padding:0 2px; cursor:pointer;"></i>`
        : '';

    const rerunIcon = getMetaSettings().rerunBadge
        ? `<i class="fa-solid fa-question lz-badge-rerun"
               title="Re-run full detection pipeline"
               style="opacity:0.6; padding:0 2px; cursor:pointer;"></i>`
        : '';

    // Rendered as its own row below .ch_name so it doesn't crowd .mes_buttons on mobile
    const $badge = $(`
        <div class="lz-msg-badge"
             style="
                 display: flex;
                 align-items: center;
                 gap: 4px;
                 font-size: 0.75em;
                 opacity: 0.7;
                 user-select: none;
                 padding: 0 4px 2px 4px;
             ">
            <span class="lz-badge-picker"
                  data-i18n="[title]vistalyze.badge.change_location"
                  title="${escapeHtml(label)}"
                  style="
                      display: inline-flex;
                      align-items: center;
                      gap: 3px;
                      cursor: pointer;
                      padding: 2px 6px;
                      border-radius: 10px;
                      border: 1px solid var(--SmartThemeBorderColor);
                      white-space: nowrap;
                      max-width: min(220px, 100%);
                      min-width: 0;
                      overflow: hidden;
                  ">
                <i class="fa-solid fa-location-dot" style="font-size:0.85em; flex-shrink:0;"></i>
                <span class="lz-badge-label" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">${escapeHtml(label)}</span>
            </span>
            ${editIcon}
            ${rerunIcon}
        </div>
    `);

    // Insert as a new row after .ch_name, leaving .mes_buttons uncluttered
    const $chName = $mes.find('.ch_name');
    if ($chName.length) $chName.after($badge);

    // ── Click: pill → open location picker for this specific message ──────────
    $badge.on('click', '.lz-badge-picker', async (e) => {
        e.stopPropagation();
        syncDraftState();
        const { openPickerModal } = await import('./pickerModal.js');
        await openPickerModal(handleEditLocation, null, msgId);
        // Refresh the badge to reflect any change
        renderBadge($mes, msgId);
    });

    // ── Click: edit icon → open Architect for the location at this message ────
    $badge.on('click', '.lz-badge-edit', async (e) => {
        e.stopPropagation();
        if (locKey) await handleEditLocation(locKey);
    });

    $badge.on('click', '.lz-badge-rerun', async (e) => {
        e.stopPropagation();
        const { runPipeline } = await import('../logic/pipeline.js');
        await runPipeline(msgId);
        renderBadge($mes, msgId);
    });
}

/**
 * Injects or refreshes the location badge for a single message.
 * Safe to call multiple times — always removes the stale badge before re-rendering.
 * @param {number} messageId
 */
export function injectMessageBadge(messageId) {
    const $mes = $(`.mes[mesid="${messageId}"]`);
    if (!$mes.length) return;

    const context = getContext();
    const message = context.chat[messageId];
    if (!message || message.is_user) return;

    renderBadge($mes, messageId);
}

/**
 * Removes all injected badges from the DOM. Called on extension disable.
 */
export function removeAllBadges() {
    $('.lz-msg-badge').remove();
}

/**
 * Re-renders badges for every AI message currently in the chat.
 * Called after boot and after a chat-changed event so all messages get a badge.
 */
export function reinjectAllBadges() {
    const context = getContext();
    if (!context?.chat) return;

    context.chat.forEach((_msg, idx) => {
        injectMessageBadge(idx);
    });
}