/**
 * @file data/default-user/extensions/vistalyze/ui/settings/templates.js
 * @stamp {"utc":"2026-04-04T12:15:00.000Z"}
 * @version 1.6.0
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Vistalyze settings panel HTML.
 * Includes data-i18n attributes for native SillyTavern translation support.
 * 
 * @updates
 * - Added autoAcceptLocation and autoAcceptDescription checkboxes to Step 3.
 * - Integrated data-i18n attributes for all text-bearing elements.
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
 * @param {string} id Unique identifier for the DOM elements.
 * @param {string} label Human-readable label for the step.
 * @param {string} promptKey The settings key for the prompt template.
 * @param {string} profileKey The settings key for the connection profile.
 * @param {string|null} historyKey The settings key for the history pairs count.
 * @param {string} guidance Advice text for the info icon.
 * @param {string} i18nBase Base key for translation.
 * @returns {string} HTML string.
 */
export function buildCallRow(id, label, promptKey, profileKey, historyKey = null, guidance = '', i18nBase = '', extraContent = '') {
    const safeId = escapeHtml(id);
    const safePromptKey = escapeHtml(promptKey);
    const safeProfileKey = escapeHtml(profileKey);
    const safeGuidance = escapeHtml(guidance);

    const historyRow = historyKey ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;" data-i18n="vistalyze.settings.label_history">History:</label>
            <input id="lz-history-${safeId}" type="number" min="0" step="1"
                class="text_pole lz-history-input" data-history-key="${escapeHtml(historyKey)}"
                style="width:60px;" />
            <span style="font-size:0.83em;opacity:0.6;" data-i18n="vistalyze.settings.label_pairs">pairs (0 = off)</span>
        </div>` : '';

    return `
    <div class="lz-call-row" style="margin-bottom:16px;padding:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <strong style="font-size:0.95em;">
                <span data-i18n="${i18nBase}.title">${escapeHtml(label)}</span>
                <i class="fa-solid fa-circle-info lz-info-icon" 
                   data-i18n="[title]${i18nBase}.guidance"
                   title="${safeGuidance}" 
                   data-guidance="${safeGuidance}" 
                   style="opacity:0.6; cursor:pointer; margin-left:6px;"></i>
            </strong>
            <button class="menu_button lz-open-prompt" data-prompt-key="${safePromptKey}" 
                data-i18n="vistalyze.settings.btn_edit_prompt"
                style="font-size:0.8em;padding:2px 8px;">Edit Prompt</button>
        </div>
        <div class="lz-profile-row" style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;" data-i18n="vistalyze.settings.label_connection">Connection:</label>
            <select id="lz-profile-${safeId}" class="text_pole lz-step-profile-select" data-profile-key="${safeProfileKey}" style="flex:1;"></select>
        </div>
        ${historyRow}
        ${extraContent}
    </div>`;
}

/**
 * Generates the main settings panel layout.
 * @param {object} meta The root extension settings (metadata).
 * @param {string[]} availableModels List of Pollinations models to display.
 * @returns {string} Full HTML layout string.
 */
export function buildPanelHTML(meta, availableModels) {
    const modelOptions = Array.isArray(availableModels) 
        ? availableModels.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')
        : '';

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
                <!-- Feature Toggles -->
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                        <input type="checkbox" id="lz-parallax-enabled" />
                        <span data-i18n="vistalyze.settings.parallax_label">Parallax backgrounds</span>
                    </label>
                    <span style="font-size:0.78em;opacity:0.55;" data-i18n="vistalyze.settings.parallax_hint">Pans wide images horizontally with mouse or tilt on narrow screens</span>
                </div>

                <!-- Profile Management Bar -->
                <div class="lz-profile-bar" style="display:flex;align-items:center;gap:4px;margin-bottom:12px;">
                    <select id="lz-profile-select" class="text_pole" style="flex:1;" data-i18n="[title]vistalyze.settings.profile_select_title" title="Active settings profile"></select>
                    <button id="lz-profile-save" class="menu_button" data-i18n="[title]vistalyze.settings.btn_save_profile" title="Save profile" style="padding:2px 8px;">&#x1F4BE;</button>
                    <button id="lz-profile-add" class="menu_button" data-i18n="[title]vistalyze.settings.btn_add_profile" title="New profile" style="padding:2px 8px;">&#x2795;</button>
                    <button id="lz-profile-rename" class="menu_button" data-i18n="[title]vistalyze.settings.btn_rename_profile" title="Rename profile" style="padding:2px 8px;">&#x270F;&#xFE0F;</button>
                    <button id="lz-profile-delete" class="menu_button" data-i18n="[title]vistalyze.settings.btn_delete_profile" title="Delete profile" style="padding:2px 8px;">&#x1F5D1;&#xFE0F;</button>
                </div>
                
                <p style="font-size:0.85em;opacity:0.7;margin:0 0 14px;" data-i18n="vistalyze.settings.profile_hint">
                    Each AI call uses its own prompt template and connection profile.
                    Leave connection blank to use the chat's active API.
                </p>

                <!-- Detection & Discovery Steps -->
                ${buildCallRow('boolean',    'Step 1 — Location Changed? (Boolean)',   'booleanPrompt',    'booleanProfileId',    'booleanHistory', step1Guidance, 'vistalyze.settings.step1', `
                    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--SmartThemeBorderColor,#444);display:flex;flex-direction:column;gap:4px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-auto-detect-enabled" />
                            <span data-i18n="vistalyze.settings.step1.auto_detect_label">Enable Automated Detection</span>
                        </label>
                        <span style="display:block;font-size:0.78em;opacity:0.55;margin-top:2px;" data-i18n="vistalyze.settings.step1.auto_detect_hint">When off, all automatic background transitions are disabled. Manual workshop edits still work normally.</span>
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;margin-top:4px;">
                            <input type="checkbox" id="lz-auto-accept-location" />
                            <span data-i18n="vistalyze.settings.step3.auto_accept_location">Auto-Accept Location (Skip popup)</span>
                        </label>
                    </div>`)}
                ${buildCallRow('classifier', 'Step 2 — Which Location? (Classifier)', 'classifierPrompt', 'classifierProfileId', 'classifierHistory', creativeGuidance, 'vistalyze.settings.step2')}
                ${buildCallRow('describer',  'Step 3 — Describe New Location',        'describerPrompt',  'describerProfileId',  'describerHistory', creativeGuidance, 'vistalyze.settings.step3', `
                    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-auto-accept-description" />
                            <span data-i18n="vistalyze.settings.step3.auto_accept_description">Auto-Accept Description (Skip Architect review)</span>
                        </label>
                    </div>`)}

                ${buildCallRow('discovery',  'Step 4 — Targeted Discovery',            'discoveryPrompt',  'discoveryProfileId',  'discoveryHistory', creativeGuidance, 'vistalyze.settings.step4')}
                
                <!-- Image Generation Section -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;" data-i18n="vistalyze.settings.image_gen_header">Image Generation</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 12px;" data-i18n="vistalyze.settings.image_gen_hint">
                        Images are generated via Pollinations. Enter your API key to securely save it to your server vault.
                    </p>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;" data-i18n="vistalyze.settings.label_api_key">API Key:</label>
                        <input type="password" id="lz-pollinations-key" class="text_pole" data-i18n="[placeholder]vistalyze.settings.placeholder_api_key" placeholder="Enter new sk_ key..." style="flex:1;" />
                        <button class="menu_button" id="lz-pollinations-save" style="white-space:nowrap;" data-i18n="vistalyze.settings.btn_save_vault">Save to Vault</button>
                    </div>
                    <div id="lz-key-status-indicator" style="font-size:0.82em; margin-left:88px; margin-bottom:12px;">
                        <span style="opacity:0.6;"><i class="fa-solid fa-spinner fa-spin"></i> <span data-i18n="vistalyze.settings.status_checking_vault">Checking vault...</span></span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <button class="menu_button" id="lz-pollinations-check" data-i18n="vistalyze.settings.btn_test_connection">Test Connection</button>
                    </div>
                    <div id="lz-pollinations-status" style="font-size:0.82em;opacity:0.65;margin-bottom:8px;"></div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;" data-i18n="vistalyze.settings.label_model">Model:</label>
                        <select id="lz-image-model" class="text_pole" style="flex:1;">
                            ${modelOptions}
                        </select>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;" data-i18n="vistalyze.settings.label_prompt_template">Prompt:</label>
                        <button class="menu_button lz-open-prompt" data-prompt-key="imagePromptTemplate"
                            data-i18n="vistalyze.settings.btn_edit_template"
                            style="font-size:0.8em;padding:2px 8px;">Edit Template</button>
                        <span style="font-size:0.78em;opacity:0.55;">{{image_prompt}} {{name}} {{description}}</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-dev-mode" />
                            <span data-i18n="vistalyze.settings.label_dev_mode">Dev mode</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;" data-i18n="vistalyze.settings.dev_mode_hint">Generates 320×180 preview images to save credits</span>
                    </div>
                </div>

                <!-- Maintenance -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;" data-i18n="vistalyze.settings.maintenance_header">Maintenance</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 12px;" data-i18n="vistalyze.settings.maintenance_hint">
                        Scan for background images no longer referenced by any location.
                    </p>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <button class="menu_button" id="lz-audit-btn">
                            <i class="fa-solid fa-trash-can"></i> <span data-i18n="vistalyze.settings.btn_audit_images">Audit Images</span>
                        </button>
                        <span id="lz-orphan-badge" style="display:none;background:var(--SmartThemeErrorColor);color:white;padding:1px 6px;border-radius:10px;font-size:0.75em;"></span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-verbose-logging" />
                            <span data-i18n="vistalyze.settings.label_verbose_logging">Verbose logging</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;" data-i18n="vistalyze.settings.verbose_logging_hint">Logs pipeline steps and AI calls to the browser console</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-rerun-badge" />
                            <span>Re-run badge</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;">Shows a ? icon on each message to manually re-trigger the full detection pipeline</span>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}