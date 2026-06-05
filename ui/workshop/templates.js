/**
 * @file data/default-user/extensions/vistalyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-05-06T14:35:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Location Workshop HTML. 
 *
 * @updates
 * - Standardized footer buttons: Added lz-hidden to #lz-workshop-global-lib and #lz-workshop-alt-bg.
 * - terminology fix: Updated fallback text for #lz-workshop-alt-bg to "Pick from Gallery".
 *
 * @api-declaration
 * getBaseWorkshopHTML(sessionId) -> string
 * getLibraryListHTML(drafts, currentKey, fileIndex, sessionId) -> string
 * getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl) -> string
 * getArchitectEmptyHTML() -> string
 * getExplorerHTML() -> string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Main skeleton of the Workshop Modal.
 * Implements the split-footer logic with the new Global Library entry point.
 */
export function getBaseWorkshopHTML(sessionId) {
    return `
    <div id="lz-workshop-overlay" class="lz-overlay lz-hidden">
        <div id="lz-workshop-modal" class="lz-modal">
            
            <div class="lz-workshop-header">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0;" data-i18n="vistalyze.workshop.title">Location Workshop</h3>
                    <div style="font-size:0.85em; opacity:0.6;"><span data-i18n="vistalyze.workshop.label_session">Session:</span> ${escapeHtml(sessionId)}</div>
                </div>
                <div class="lz-tab-bar">
                    <button class="lz-tab-btn menu_button" data-tab="library" data-i18n="vistalyze.workshop.tab_library">Library</button>
                    <button class="lz-tab-btn menu_button" data-tab="architect" data-i18n="vistalyze.workshop.tab_architect">Architect</button>
                    <button class="lz-tab-btn menu_button" data-tab="explorer" data-i18n="vistalyze.workshop.tab_explorer">Explorer</button>
                </div>
            </div>

            <div class="lz-workshop-body">
                <!-- Library Tab -->
                <div id="lz-tab-library" class="lz-tab-panel lz-hidden">
                    <p style="margin-top:0; opacity:0.7; font-size:0.9em; flex-shrink:0;" data-i18n="vistalyze.workshop.library_hint">
                        Browse discovered locations and select one to apply to the current scene.
                    </p>
                    <div class="lz-library-list">
                        <!-- Items injected here by renderLibrary() -->
                    </div>
                </div>

                <!-- Architect Tab -->
                <div id="lz-tab-architect" class="lz-tab-panel lz-hidden">
                    <!-- Content injected here by renderArchitect() -->
                </div>

                <!-- Explorer Tab -->
                <div id="lz-tab-explorer" class="lz-tab-panel lz-hidden">
                    ${getExplorerHTML()}
                </div>
            </div>

            <div class="lz-workshop-controls">
                <!-- Left-aligned actions -->
                <div style="display:flex; gap:10px;">
                    <button id="lz-workshop-global-lib" class="menu_button lz-hidden" data-i18n="vistalyze.workshop.btn_global_library">Global Library</button>
                    <button id="lz-workshop-alt-bg" class="menu_button lz-hidden" data-i18n="vistalyze.workshop.btn_hijack">Pick from Gallery</button>
                </div>
                
                <!-- Right-aligned action group -->
                <div class="lz-footer-right">
                    <button id="lz-workshop-close" class="menu_button" data-i18n="vistalyze.workshop.btn_cancel">Cancel</button>
                    <button id="lz-arch-finalize" class="menu_button lz-primary-action" data-i18n="vistalyze.workshop.btn_finalize">Apply and Finalize</button>
                </div>
            </div>
        </div>
    </div>`;
}

/**
 * Generates the list of locations for the Library tab.
 * Resolves filenames using sourceSessionId for imported locations.
 */
export function getLibraryListHTML(drafts, currentKey, fileIndex = new Set(), sessionId = null) {
    if (drafts.length === 0) {
        return `
        <div style="text-align:center; padding:40px; opacity:0.5;">
            <i class="fa-solid fa-box-open" style="font-size:2em; margin-bottom:10px;"></i><br/>
            <span data-i18n="vistalyze.workshop.library_empty">Library is empty. Use "Explorer" to discover new places.</span>
        </div>`;
    }

    return drafts.map(([key, loc]) => {
        const isCurrent = currentKey === key;
        const isCustom = !!loc.customBg;
        
        // Resolve Filename: Custom > Borrowed (Source Session) > Native (Current Session)
        const sourceId = loc.sourceSessionId || sessionId;
        const filename = loc.customBg || (sourceId ? `vistalyze_${sourceId}_${key}.png` : null);
        
        const hasImage = filename && (isCustom || fileIndex.has(filename));
        const thumbUrl = hasImage ? `backgrounds/${encodeURIComponent(filename)}?v=${Date.now()}` : null;

        const thumbHTML = thumbUrl
            ? `<img src="${thumbUrl}" alt="" />`
            : `<i class="fa-solid fa-image lz-thumb-placeholder"></i>`;

        return `
        <div class="lz-library-item ${isCurrent ? 'lz-active-loc' : ''}" data-key="${escapeHtml(key)}">
            <div class="lz-lib-thumb" data-filename="${escapeHtml(filename || '')}" title="View background">
                ${thumbHTML}
            </div>
            <div class="lz-lib-text" style="cursor:pointer;"
                 data-i18n="[title]vistalyze.workshop.apply_title" title="Apply Location">
                <strong style="color: ${isCurrent ? 'var(--SmartThemeQuoteColor)' : 'inherit'};">
                    ${isCurrent ? '<i class="fa-solid fa-location-dot"></i> ' : ''}${escapeHtml(loc.name)}
                </strong>
                <small>${escapeHtml(loc.description)}</small>
            </div>
            <div class="lz-lib-actions">
                <i class="fa-solid fa-folder-open lz-lib-pick-bg" style="font-size:1.2em;"
                   data-i18n="[title]vistalyze.workshop.select_bg_title" title="Select existing background"></i>
                <i class="fa-solid fa-pen-to-square lz-lib-edit" style="font-size:1.2em;"
                   data-i18n="[title]vistalyze.workshop.edit_title" title="Edit in Architect"></i>
                <i class="fa-solid fa-trash lz-lib-delete" style="font-size:1.2em;"
                   data-i18n="[title]vistalyze.workshop.delete_title" title="Delete Location"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Calculates rows for textarea sizing.
 */
function calcRows(text, charsPerRow = 65, minRows = 2) {
    if (!text) return minRows;
    const lines = text.split('\n');
    const total = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / charsPerRow)), 0);
    return Math.max(minRows, total);
}

/**
 * Architect View: Vertical layout stacking form fields.
 */
export function getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl, proposedLabel = 'Proposed') {
    const defRows = calcRows(draft.description, 65, 2);
    const visRows = calcRows(draft.imagePrompt, 65, 4);
    const isManual = !!draft.customBg;

    return `
    <div class="lz-architect-fields">
        <label data-i18n="vistalyze.workshop.label_name">Location Name</label>
        <input type="text" id="lz-arch-name" class="text_pole" style="width:100%;" value="${escapeHtml(draft.name)}" />

        <label><span data-i18n="vistalyze.workshop.label_definition">Definition (Logic)</span> <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="description" data-i18n="[title]vistalyze.workshop.regen_logic_title" title="Regenerate logic from context"></i></label>
        <textarea id="lz-arch-definition" class="text_pole" rows="${defRows}" style="width:100%; resize:vertical;">${escapeHtml(draft.description)}</textarea>

        <label data-i18n="vistalyze.workshop.label_visuals">Visuals (Image Prompt)</label>
        <textarea id="lz-arch-visuals" class="text_pole" rows="${visRows}"
                  ${isManual ? 'disabled' : ''}
                  style="width:100%; resize:vertical; font-family:monospace; font-size:0.9em; opacity: ${isManual ? '0.5' : '1'};">
            ${escapeHtml(draft.imagePrompt)}
        </textarea>

        <div class="lz-architect-actions">
            <button id="lz-arch-preview-btn" class="menu_button" ${isManual ? 'disabled' : ''} data-i18n="vistalyze.workshop.btn_preview">Thumbnail Preview</button>
            <span id="lz-preview-spinner" class="lz-hidden"><i class="fa-solid fa-spinner fa-spin"></i></span>
        </div>
    </div>

    <div class="lz-preview-pane">
        <div class="lz-preview-box">
            <small data-i18n="vistalyze.workshop.label_current_bg">Current Background</small>
            <img id="lz-preview-before" src="${currentImgUrl}" alt="No current BG" style="display: ${currentImgUrl ? 'block' : 'none'};" />
        </div>
        <div class="lz-preview-box">
            <small>${escapeHtml(proposedLabel)}</small>
            <img id="lz-preview-after" src="${proposedImgUrl}" alt="No preview" style="display: ${proposedImgUrl ? 'block' : 'none'};" />
        </div>
    </div>`;
}

/**
 * Placeholder for empty Architect tab.
 */
export function getArchitectEmptyHTML() {
    return `
    <div id="lz-arch-empty" style="text-align:center; padding:60px; opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em; margin-bottom:15px;"></i><br/>
        <span data-i18n="vistalyze.workshop.architect_empty">Select a location from the Library or use the Explorer to start refining.</span>
    </div>`;
}

/**
 * Explorer Tab Layout.
 */
export function getExplorerHTML() {
    return `
    <div style="margin-bottom:20px; flex-shrink:0;">
        <h4 data-i18n="vistalyze.workshop.explorer_title">Automated Discovery</h4>
        <p style="opacity:0.8;" data-i18n="vistalyze.workshop.explorer_hint">Analyze the recent turns of the conversation to identify a new location. You can provide keywords to guide the AI's imagination.</p>
        <input type="text" id="lz-explorer-keywords" class="text_pole" data-i18n="[placeholder]vistalyze.workshop.explorer_placeholder" placeholder="Optional keywords (e.g. 'A dark damp cave')..." style="width:100%;" />
    </div>
    <button id="lz-explorer-go" class="menu_button" style="width:100%; padding: 12px; flex-shrink:0;" data-i18n="vistalyze.workshop.btn_discover">Discover Location</button>
    <div id="lz-explorer-status" class="lz-hidden" style="margin-top:25px; text-align:center; opacity:0.7;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5em; margin-bottom:10px;"></i><br/><span data-i18n="vistalyze.workshop.explorer_status">Analyzing roleplay context...</span>
    </div>`;
}