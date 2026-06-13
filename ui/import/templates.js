/**
 * @file data/default-user/extensions/vistalyze/ui/import/templates.js
 * @stamp {"utc":"2026-05-06T22:45:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates HTML for the Global Library import interface.
 *
 * @updates
 * - Snippet Integration: Fixed folder row layout to properly display the 
 *   memory-jogging snippet extracted by the controller.
 * - Thumbnail Resolution: Updated expanded view to allow thumbnails to 
 *   resolve via the cross-session file index.
 *
 * @api-declaration
 * getCharacterGridHTML(characters) -> string
 * getChatFolderHTML(chatInfo, locationsCount) -> string
 * getExpandedLocationsHTML(locations, fileIndex) -> string
 * getCollisionModalHTML(total, conflictCount) -> string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { translate } from '../../../../../i18n.js';

/**
 * Renders the initial character selection grid.
 * @param {object[]} characters List of { name, avatar }
 * @returns {string}
 */
export function getCharacterGridHTML(characters) {
    if (!characters.length) return `<p style="text-align:center; opacity:0.5; padding:40px;">${translate('No characters found.', 'vistalyze.import.no_characters')}</p>`;

    const items = characters.map(c => `
        <div class="lz-import-char-card" data-avatar="${escapeHtml(c.avatar)}" data-name="${escapeHtml(c.name)}"
             style="cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:8px; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid transparent; transition:all 0.2s;">
            <!-- Note the leading / and the encodeURI for filenames with spaces -->
            <img src="/characters/${encodeURI(c.avatar)}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--SmartThemeBorderColor);" />
            <span style="font-size:0.9em; text-align:center; font-weight:bold;">${escapeHtml(c.name)}</span>
        </div>
    `).join('');

    return `
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:15px; padding:10px;">
        ${items}
    </div>`;
}

/**
 * Formats a raw ST chat filename into a human-readable date.
 * @param {string} filename 
 * @returns {string}
 */
function formatDate(filename) {
    // Example: Charname - 2026-05-06@09h18m38s488ms
    const match = filename.match(/(\d{4}-\d{2}-\d{2})@(\d{2})h(\d{2})m/);
    if (!match) return filename;
    const [_, date, h, m] = match;
    return `${date} — ${h}:${m}`;
}

/**
 * Renders a single "mini-folder" chat row.
 * @param {object} chatInfo { filename, snippet }
 * @param {number} locationsCount
 * @returns {string}
 */
export function getChatFolderHTML(chatInfo, locationsCount) {
    const dateStr = formatDate(chatInfo.filename);
    
    return `
    <div class="lz-import-folder" data-filename="${escapeHtml(chatInfo.filename)}"
         style="display:flex; flex-direction:column; background:rgba(0,0,0,0.15); border:1px solid var(--SmartThemeBorderColor); border-radius:6px; margin-bottom:8px; overflow:hidden;">
        
        <div class="lz-folder-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px 15px; cursor:pointer;">
            <div style="flex:1; display:flex; flex-direction:column; gap:2px; min-width: 0;">
                <strong style="font-size:0.95em;">${escapeHtml(dateStr)}</strong>
                <small style="opacity:0.6; font-size:0.85em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display: block;">
                    ${escapeHtml(chatInfo.snippet || '...') }
                </small>
            </div>
            
            <div style="display:flex; align-items:center; gap:12px; margin-left: 10px;">
                <span class="lz-import-badge" style="background:var(--SmartThemeQuoteColor); color:white; padding:2px 8px; border-radius:10px; font-size:0.75em; font-weight:bold; white-space: nowrap;">
                    <i class="fa-solid fa-location-dot"></i> ${locationsCount}
                </span>
                <button class="menu_button lz-import-all-btn" 
                        data-i18n="[title]vistalyze.import.import_all_title"
                        style="padding:4px 10px; font-size:0.8em; white-space: nowrap;">
                    <i class="fa-solid fa-file-import"></i> <span data-i18n="vistalyze.import.btn_all">Import All</span>
                </button>
                <i class="fa-solid fa-chevron-down lz-folder-toggle" style="opacity:0.5; transition:transform 0.2s;"></i>
            </div>
        </div>

        <div class="lz-folder-content lz-hidden" style="padding:0 15px 15px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.05);">
            <!-- Thumbnails injected here by getExpandedLocationsHTML -->
        </div>
    </div>`;
}

/**
 * Renders the thumbnails and names for the expanded folder view.
 * @param {object[]} locations 
 * @param {Set} fileIndex The cross-session allFileIndex for visibility checks
 * @returns {string}
 */
export function getExpandedLocationsHTML(locations, fileIndex) {
    const items = locations.map(loc => {
        const sourceId = loc.sourceSessionId || loc.sessionId;
        const filename = loc.customBg || (sourceId ? `vistalyze_${sourceId}_${loc.key}.png` : null);
        
        // Thumbnails resolve via the source ID.
        // Presence is checked against the global cross-session index.
        const hasImage = filename && (!!loc.customBg || fileIndex.has(filename));
        const thumbUrl = hasImage ? `backgrounds/${encodeURIComponent(filename)}?v=${Date.now()}` : null;

        return `
        <div class="lz-import-item" data-key="${escapeHtml(loc.key)}" 
             style="display:flex; align-items:center; gap:12px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="width:60px; height:34px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.3); flex-shrink:0;">
                ${thumbUrl ? `<img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover;" />` : `<i class="fa-solid fa-image" style="display:flex; align-items:center; justify-content:center; height:100%; opacity:0.2;"></i>`}
            </div>
            <div style="flex:1; display:flex; flex-direction:column; min-width: 0;">
                <span style="font-size:0.9em; font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(loc.name)}</span>
                <small style="font-size:0.75em; opacity:0.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(loc.description)}</small>
            </div>
            <button class="menu_button lz-import-single-btn" style="padding:2px 8px; font-size:0.75em; white-space: nowrap;" data-i18n="vistalyze.import.btn_add">Add</button>
        </div>`;
    }).join('');

    return `<div style="display:flex; flex-direction:column; margin-top:10px;">${items}</div>`;
}

/**
 * Layout for the conflict resolution dialog.
 */
export function getCollisionModalHTML(total, conflictCount) {
    return `
    <div style="text-align:center;">
        <h3 data-i18n="vistalyze.import.conflict_title">Import Conflict</h3>
        <p style="margin-bottom:15px;">
            <span data-i18n="vistalyze.import.conflict_msg_1">You are importing</span> <strong>${total}</strong> <span data-i18n="vistalyze.import.conflict_msg_2">locations, but</span> <strong>${conflictCount}</strong> <span data-i18n="vistalyze.import.conflict_msg_3">already exist in this chat.</span>
        </p>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <button id="lz-collision-skip" class="menu_button" style="width:100%; text-align:left; padding:10px;">
                <strong data-i18n="vistalyze.import.opt_skip">Skip Existing</strong><br/>
                <small style="opacity:0.6;" data-i18n="vistalyze.import.opt_skip_hint">Keep your current locations; only import new ones.</small>
            </button>
            <button id="lz-collision-overwrite" class="menu_button" style="width:100%; text-align:left; padding:10px;">
                <strong data-i18n="vistalyze.import.opt_overwrite">Overwrite Existing</strong><br/>
                <small style="opacity:0.6;" data-i18n="vistalyze.import.opt_overwrite_hint">Replace current locations with the imported versions.</small>
            </button>
            <button id="lz-collision-rename" class="menu_button" style="width:100%; text-align:left; padding:10px;">
                <strong data-i18n="vistalyze.import.opt_rename">Import as New (Rename)</strong><br/>
                <small style="opacity:0.6;" data-i18n="vistalyze.import.opt_rename_hint">Keep both versions by renaming the incoming locations.</small>
            </button>
        </div>
    </div>`;
}