/**
 * @file data/default-user/extensions/vistalyze/ui/settings/templates.js
 * @stamp {"utc":"2026-06-03T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Vistalyze settings panel HTML.
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @api-declaration
 * buildPanelHTML(meta, models) -> string
 * buildCallRow(id, label, promptKey, profileKey, historyKey, guidance, i18nBase) -> string
 * escapeHtml(str) -> string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: none
 *     external_io: none
 */

/**
 * Escapes HTML special characters for safe rendering.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Builds the HTML for an LLM Step configuration row.
 */
export function buildCallRow(id, label, promptKey, profileKey, historyKey = null, guidance = '', i18nBase = '', extraContent = '') {
    const safeId = escapeHtml(id);
    const safePromptKey = escapeHtml(promptKey);
    const safeProfileKey = escapeHtml(profileKey);
    const safeGuidance = escapeHtml(guidance);

    const historyRow = historyKey ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label style="opacity:0.75;white-space:nowrap;" data-i18n="vistalyze.settings.label_history">History:</label>
            <input id="lz-history-${safeId}" type="number" min="0" step="1"
                class="text_pole lz-history-input" data-history-key="${escapeHtml(historyKey)}"
                style="width:60px;" />
            <span style="opacity:0.6;" data-i18n="vistalyze.settings.label_pairs">pairs (0 = off)</span>
        </div>` : '';

    return `
    <div class="inline-drawer lz-call-row" style="margin-bottom:6px;">
        <div class="inline-drawer-toggle inline-drawer-header" style="padding:6px 12px;">
            <span style="font-weight:600;">
                <span data-i18n="${i18nBase}.title">${escapeHtml(label)}</span>
                <i class="fa-solid fa-circle-info lz-info-icon"
                   data-i18n="[title]${i18nBase}.guidance"
                   title="${safeGuidance}"
                   data-guidance="${safeGuidance}"
                   style="opacity:0.6; cursor:pointer; margin-left:6px;"></i>
            </span>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="padding:10px 12px 12px;">
            <div class="lz-profile-row" style="display:flex;align-items:center;gap:8px;">
                <label style="opacity:0.75;white-space:nowrap;" data-i18n="vistalyze.settings.label_connection">Connection:</label>
                <select id="lz-profile-${safeId}" class="text_pole lz-step-profile-select" data-profile-key="${safeProfileKey}" style="flex:1;"></select>
                <button class="menu_button lz-open-prompt" data-prompt-key="${safePromptKey}"
                    data-i18n="vistalyze.settings.btn_edit_prompt"
                    style="white-space:nowrap;">Edit Prompt</button>
            </div>
            ${historyRow}
            ${extraContent}
        </div>
    </div>`;
}

/**
 * Generates the main settings panel layout.
 * @param {object} meta The root extension settings (metadata).
 * @param {string[]} availableModels List of Pollinations models to display.
 * @returns {string} Full HTML layout string.
 */
export function buildPanelHTML(meta) {

    const step1Guidance = "This gate runs on every AI message. To keep the chat fast and cheap, use a lightweight model. Mistral Small 2603 is the recommended choice for this high-frequency task.";
    const creativeGuidance = "This step requires higher descriptive intelligence. Weaker models can produce chaotic results or fail to follow the extraction format. Gemini 3.1 Flash Lite Preview is recommended for its balance of power and reliability.";

    return `
    <div id="lz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-location-dot"></i> <span data-i18n="vistalyze.settings.header">Vistalyze</span></b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="lz-settings-body">
                <!-- Profile Management Bar -->
                <div class="lz-profile-bar" style="display:flex;align-items:center;gap:4px;margin-bottom:12px;">
                    <select id="lz-profile-select" class="text_pole" style="flex:1;" data-i18n="[title]vistalyze.settings.profile_select_title" title="Active settings profile"></select>
                    <button id="lz-profile-save" class="menu_button" data-i18n="[title]vistalyze.settings.btn_save_profile" title="Save profile">&#x1F4BE;</button>
                    <button id="lz-profile-add" class="menu_button" data-i18n="[title]vistalyze.settings.btn_add_profile" title="New profile">&#x2795;</button>
                    <button id="lz-profile-rename" class="menu_button" data-i18n="[title]vistalyze.settings.btn_rename_profile" title="Rename profile">&#x270F;&#xFE0F;</button>
                    <button id="lz-profile-delete" class="menu_button" data-i18n="[title]vistalyze.settings.btn_delete_profile" title="Delete profile">&#x1F5D1;&#xFE0F;</button>
                </div>

                <p style="opacity:0.7;margin:0 0 10px;" data-i18n="vistalyze.settings.profile_hint">
                    Each AI call uses its own prompt template and connection profile.
                    Leave connection blank to use the chat's active API.
                </p>

                <!-- Parallax -->
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <label class="checkbox_label" style="cursor:pointer;">
                        <input type="checkbox" id="lz-parallax-enabled" />
                        <span data-i18n="vistalyze.settings.parallax_label">Parallax backgrounds</span>
                    </label>
                    <span style="opacity:0.55;" data-i18n="vistalyze.settings.parallax_hint">Pans wide images horizontally with mouse or tilt on narrow screens</span>
                </div>

                <!-- Detection & Discovery Steps -->
                ${buildCallRow('boolean',    'Step 1 — Location Changed? (Boolean)',   'booleanPrompt',    'booleanProfileId',    'booleanHistory', step1Guidance, 'vistalyze.settings.step1', `
                    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--SmartThemeBorderColor,#444);display:flex;flex-direction:column;gap:4px;">
                        <label class="checkbox_label" style="cursor:pointer;">
                            <input type="checkbox" id="lz-auto-detect-enabled" />
                            <span data-i18n="vistalyze.settings.step1.auto_detect_label">Enable Automated Detection</span>
                        </label>
                        <span style="display:block;opacity:0.55;margin-top:2px;" data-i18n="vistalyze.settings.step1.auto_detect_hint">When off, all automatic background transitions are disabled. Manual workshop edits still work normally.</span>
                        <label class="checkbox_label" style="cursor:pointer;margin-top:4px;">
                            <input type="checkbox" id="lz-auto-accept-location" />
                            <span data-i18n="vistalyze.settings.step3.auto_accept_location">Auto-Accept Location (Skip popup)</span>
                        </label>
                    </div>`)}
                ${buildCallRow('classifier', 'Step 2 — Which Location? (Classifier)', 'classifierPrompt', 'classifierProfileId', 'classifierHistory', creativeGuidance, 'vistalyze.settings.step2')}
                ${buildCallRow('describer',  'Step 3 — Describe New Location',        'describerPrompt',  'describerProfileId',  'describerHistory', creativeGuidance, 'vistalyze.settings.step3', `
                    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                        <label class="checkbox_label" style="cursor:pointer;">
                            <input type="checkbox" id="lz-auto-accept-description" />
                            <span data-i18n="vistalyze.settings.step3.auto_accept_description">Auto-Accept Description (Skip Architect review)</span>
                        </label>
                    </div>`)}
                ${buildCallRow('discovery',  'Step 4 — Targeted Discovery',           'discoveryPrompt',  'discoveryProfileId',  'discoveryHistory', creativeGuidance, 'vistalyze.settings.step4')}

                <!-- Image Generation Section -->
                <div class="inline-drawer lz-call-row" style="margin-bottom:6px;">
                    <div class="inline-drawer-toggle inline-drawer-header" style="padding:6px 12px;">
                        <span style="font-weight:600;" data-i18n="vistalyze.settings.image_gen_header">Image Generation</span>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="padding:10px 12px 12px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <label style="opacity:0.75;white-space:nowrap;min-width:80px;">Source:</label>
                            <select id="lz-image-source" class="text_pole" style="flex:1;"></select>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <label style="opacity:0.75;white-space:nowrap;min-width:80px;" data-i18n="vistalyze.settings.label_model">Model:</label>
                            <div style="flex:1;display:flex;">
                                <select id="lz-image-model" class="text_pole" style="flex:1;display:none;"></select>
                                <input id="lz-image-model-text" type="text" class="text_pole"
                                       placeholder="Enter model name..." style="flex:1;display:none;" />
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label style="opacity:0.75;white-space:nowrap;min-width:80px;" data-i18n="vistalyze.settings.label_prompt_template">Prompt:</label>
                            <button class="menu_button lz-open-prompt" data-prompt-key="imagePromptTemplate"
                                data-i18n="vistalyze.settings.btn_edit_template">Edit Template</button>
                            <span style="opacity:0.55;">{{image_prompt}} {{name}} {{description}}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                            <button class="menu_button" id="lz-img-test">Test Generation</button>
                            <span id="lz-img-test-status" style="opacity:0.65;font-size:0.9em;"></span>
                        </div>
                    </div>
                </div>

                <!-- Maintenance -->
                <div class="inline-drawer lz-call-row" style="margin-bottom:6px;">
                    <div class="inline-drawer-toggle inline-drawer-header" style="padding:6px 12px;">
                        <span style="font-weight:600;" data-i18n="vistalyze.settings.maintenance_header">Maintenance</span>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="padding:10px 12px 12px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <button class="menu_button" id="lz-audit-btn" style="white-space:nowrap;">
                                <i class="fa-solid fa-trash-can"></i> <span data-i18n="vistalyze.settings.btn_audit_images">Audit Images</span>
                            </button>
                            <span id="lz-orphan-badge" style="display:none;background:var(--SmartThemeErrorColor);color:white;padding:1px 6px;border-radius:10px;"></span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <label class="checkbox_label" style="cursor:pointer;">
                                <input type="checkbox" id="lz-verbose-logging" />
                                <span data-i18n="vistalyze.settings.label_verbose_logging">Verbose logging</span>
                            </label>
                            <span style="opacity:0.55;" data-i18n="vistalyze.settings.verbose_logging_hint">Logs pipeline steps and AI calls to the browser console</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="checkbox_label" style="cursor:pointer;">
                                <input type="checkbox" id="lz-rerun-badge" />
                                <span>Re-run badge</span>
                            </label>
                            <span style="opacity:0.55;">Shows a ? icon on each message to manually re-trigger the full detection pipeline</span>
                        </div>
                    </div>
                </div>
                </div><!-- end lz-settings-body -->
            </div>
        </div>
    </div>`;
}
