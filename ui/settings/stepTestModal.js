/**
 * @file data/default-user/extensions/vistalyze/ui/settings/stepTestModal.js
 * @stamp {"utc":"2026-06-18T00:00:00.000Z"}
 * @architectural-role UI Executor / IO
 * @description
 * Step-isolation test modal for prompt tuning.
 *
 * Flow:
 *   - Opens with the raw prompt template (same as the prompt editor).
 *   - Toggle swaps to a read-only populated view (all {{variables}} filled with
 *     current turn values) so you can see exactly what the LLM would receive.
 *   - Toggle again returns to the editable template.
 *   - Run always fires with a freshly populated version of the current template.
 *   - Update Prompt saves the tuned template back to settings.
 *
 * @api-declaration
 * openStepTestModal(stepId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, detector.js, state.js, getContext, history utils]
 */

import { callPopup } from '../../../../../../script.js';
import { getContext } from '../../../../../extensions.js';
import { state } from '../../state.js';
import { getSettings, updateActiveSetting } from '../../settings/data.js';
import { dispatchRaw, extractMarkerData } from '../../detector.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { buildHistoryText, buildDescriberContext, buildSpatialContext } from '../../utils/history.js';
import { escapeHtml } from './templates.js';

function interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ─── Variable Getters ─────────────────────────────────────────────────────────

function getLastAiMessage() {
    const context = getContext();
    if (!context?.chat) return '';
    const last = [...context.chat].reverse().find(m => !m.is_user && !m.is_system);
    return last?.mes ?? '';
}

function getCurrentLocationName() {
    const key = state.currentLocation;
    if (!key) return '';
    return state.locations[key]?.name ?? key;
}

// ─── Prompt Populators  ───────────────────────────────────────────────────────
// Each takes the current template text (from the textarea) and fills in all
// variables using the same logic as the real pipeline.

function populateBoolean(template, s) {
    const context = getContext();
    const lastMsgId = context.chat.length - 1;
    return interpolate(template, {
        current_location: getCurrentLocationName(),
        history:          buildHistoryText(context.chat, lastMsgId, s.booleanHistory ?? 0),
        message:          getLastAiMessage(),
    });
}

function populateClassifier(template, s) {
    const context = getContext();
    const lastMsgId = context.chat.length - 1;

    const fmt = ([key, loc]) => `${loc.name} — ${loc.description ?? 'Unknown'} (ID: [${key}])`;
    const descriptiveList = Object.entries(state.locations).map(fmt).join('\n');
    const filteredList    = Object.entries(state.locations)
        .filter(([key]) => key !== state.currentLocation)
        .map(fmt).join('\n');
    const { spatial_transitions, spatial_discovery_count } = buildSpatialContext(
        state.currentLocation, state.transitionsMap, state.newFromMap
    );

    // Mirror the pipeline's pre-replace pass, then interpolate the remainder
    const preReplaced = template
        .replace('{{current_location}}',        getCurrentLocationName() || 'Unknown')
        .replace('{{key_list}}',                descriptiveList)
        .replace('{{filtered_list}}',           filteredList)
        .replace('{{spatial_transitions}}',     spatial_transitions)
        .replace('{{spatial_discovery_count}}', String(spatial_discovery_count));

    return interpolate(preReplaced, {
        history: buildHistoryText(context.chat, lastMsgId, s.classifierHistory ?? 0),
        message: getLastAiMessage(),
    });
}

function populateDescriber(template, s) {
    const context = getContext();
    const lastMsgId = context.chat.length - 1;
    return interpolate(template, {
        context: buildDescriberContext(context.chat, lastMsgId, s.describerHistory ?? 3),
    });
}

function populateImage(template) {
    const loc = state.currentLocation ? state.locations[state.currentLocation] : null;
    return interpolate(template, {
        image_prompt: loc?.imagePrompt  ?? '',
        name:         loc?.name         ?? '',
        description:  loc?.description  ?? '',
    });
}

function populateDiscovery(template, s, keywords) {
    const context = getContext();
    const lastMsgId = context.chat.length - 1;
    const withKeywords = template.replace(/\{\{keywords\}\}/g, keywords ?? '');
    return interpolate(withKeywords, {
        context: buildDescriberContext(context.chat, lastMsgId, s.discoveryHistory ?? 3),
    });
}

// ─── Response Parsers ─────────────────────────────────────────────────────────

function parseBoolean(raw) {
    const clean = String(raw).toUpperCase();
    const yes   = /\bYES\b/.test(clean) && !clean.includes('NOT YES');
    return yes
        ? { label: 'YES — location changed', color: 'var(--SmartThemeQuoteColor,#28a745)' }
        : { label: 'NO — same location',     color: 'var(--SmartThemeErrorColor,#dc3545)' };
}

function parseClassifier(raw) {
    const clean = String(raw).trim();
    if (!clean || clean.toUpperCase().includes('NULL')) {
        return { label: 'null — no match', color: 'var(--SmartThemeErrorColor,#dc3545)' };
    }
    for (const key of Object.keys(state.locations)) {
        if (new RegExp(`\\b${key}\\b`, 'i').test(clean)) {
            return { label: `Matched: ${key}`, color: 'var(--SmartThemeQuoteColor,#28a745)' };
        }
    }
    return { label: 'null — no match', color: 'var(--SmartThemeErrorColor,#dc3545)' };
}

function parseDescriber(raw) {
    const result = extractMarkerData(raw);
    if (!result) return { label: 'null — extraction failed', color: 'var(--SmartThemeErrorColor,#dc3545)' };
    return {
        label: `Name: ${result.name}\nDefinition: ${result.description}\nVisuals: ${result.imagePrompt}`,
        color: 'var(--SmartThemeQuoteColor,#28a745)',
    };
}

// ─── Step Configs ─────────────────────────────────────────────────────────────

const STEPS = {
    boolean: {
        title:      'Step 1 — Location Changed? (Boolean)',
        promptKey:  'booleanPrompt',
        profileKey: 'booleanProfileId',
        populate:   (template, s)          => populateBoolean(template, s),
        parse:      parseBoolean,
    },
    classifier: {
        title:      'Step 2 — Which Location? (Classifier)',
        promptKey:  'classifierPrompt',
        profileKey: 'classifierProfileId',
        populate:   (template, s)          => populateClassifier(template, s),
        parse:      parseClassifier,
    },
    describer: {
        title:      'Step 3 — Describe New Location',
        promptKey:  'describerPrompt',
        profileKey: 'describerProfileId',
        populate:   (template, s)          => populateDescriber(template, s),
        parse:      parseDescriber,
    },
    discovery: {
        title:      'Step 4 — Targeted Discovery',
        promptKey:  'discoveryPrompt',
        profileKey: 'discoveryProfileId',
        populate:   (template, s, kw)      => populateDiscovery(template, s, kw),
        parse:      parseDescriber,
        hasKeywords: true,
    },
    image: {
        title:      'Image Generation',
        promptKey:  'imagePromptTemplate',
        profileKey: null,
        populate:   (template)             => populateImage(template),
        isImage:    true,
    },
};

// ─── Modal HTML ───────────────────────────────────────────────────────────────

function buildModalHTML(config) {
    const keywordsRow = config.hasKeywords ? `
    <div>
        <label style="opacity:0.75;font-size:0.9em;display:block;margin-bottom:4px;">Keywords</label>
        <input id="lz-test-keywords" type="text" class="text_pole" style="width:100%;"
               placeholder="Substituted into {{keywords}} on next Toggle" />
    </div>` : '';

    return `
    <div style="display:flex;flex-direction:column;gap:8px;">
        <strong>${escapeHtml(config.title)}</strong>
        ${keywordsRow}
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <label style="opacity:0.75;font-size:0.9em;" id="lz-test-prompt-label">Template</label>
                <button id="lz-test-toggle-btn" class="menu_button" style="padding:2px 8px;font-size:0.8em;">Fill Variables</button>
            </div>
            <textarea id="lz-test-prompt" class="text_pole" rows="16"
                style="width:100%;font-family:monospace;font-size:0.82em;resize:vertical;"></textarea>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
            <div style="display:flex;align-items:center;gap:8px;">
                <button id="lz-test-run-btn" class="menu_button">Run</button>
                <span id="lz-test-spinner" style="display:none;opacity:0.65;font-size:0.9em;">Running...</span>
            </div>
            <button id="lz-test-update-btn" class="menu_button" style="opacity:0.5;" disabled>Update Prompt</button>
        </div>
        <div id="lz-test-raw"
             style="display:none;padding:10px;border-radius:6px;background:var(--SmartThemeBlurTintColor,#1a1a1a);
                    font-family:monospace;font-size:0.82em;white-space:pre-wrap;word-break:break-word;"></div>
        <div id="lz-test-result"
             style="display:none;font-size:0.9em;font-weight:600;white-space:pre-wrap;"></div>
    </div>`;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function openStepTestModal(stepId) {
    const config = STEPS[stepId];
    if (!config) return;

    const s = getSettings();
    const popupPromise = callPopup(buildModalHTML(config), 'text');

    // Start with the raw template (same as the prompt editor shows)
    $('#lz-test-prompt').val(s[config.promptKey] ?? '');

    // Track toggle state
    let isPopulated = false;
    let savedTemplate = '';

    // Enable Update Prompt once the user edits the template
    $('#lz-test-prompt').on('input', function () {
        if (!isPopulated) {
            $('#lz-test-update-btn').prop('disabled', false).css('opacity', '1');
        }
    });

    function getKeywords() {
        return config.hasKeywords ? ($('#lz-test-keywords').val() ?? '') : '';
    }

    $('#lz-test-toggle-btn').on('click', function () {
        const $area  = $('#lz-test-prompt');
        const $label = $('#lz-test-prompt-label');
        const $btn   = $(this);

        if (!isPopulated) {
            // Save template, switch to read-only populated view
            savedTemplate = $area.val();
            $area.val(config.populate(savedTemplate, s, getKeywords())).prop('readonly', true);
            $label.text('Populated (read-only)');
            $btn.text('Edit Template');
            isPopulated = true;
        } else {
            // Restore editable template
            $area.val(savedTemplate).prop('readonly', false);
            $label.text('Template');
            $btn.text('Fill Variables');
            isPopulated = false;
        }
    });

    $('#lz-test-run-btn').on('click', async function () {
        const $btn    = $(this);
        const $spin   = $('#lz-test-spinner');
        const $raw    = $('#lz-test-raw');
        const $result = $('#lz-test-result');

        $btn.prop('disabled', true);
        $spin.show();
        $raw.hide();
        $result.hide();

        try {
            // Always build from the current template (not the populated view)
            const template  = isPopulated ? savedTemplate : ($('#lz-test-prompt').val() ?? '');
            const populated = config.populate(template, s, getKeywords());

            if (config.isImage) {
                const url = await fetchPreviewBlob(populated);
                $result.html(`<img src="${url}" style="width:100%;border-radius:6px;" />`).show();
            } else {
                const raw = await dispatchRaw(populated, s[config.profileKey] ?? null);
                $raw.text(raw).show();
                const out = config.parse(raw);
                $result.css('color', out.color ?? 'inherit').text(out.label).show();
            }
        } catch (err) {
            $raw.css('color', 'var(--SmartThemeErrorColor,#dc3545)').text(`Error: ${err.message}`).show();
        } finally {
            $btn.prop('disabled', false);
            $spin.hide();
        }
    });

    $('#lz-test-update-btn').on('click', function () {
        const template = isPopulated ? savedTemplate : ($('#lz-test-prompt').val() ?? '');
        updateActiveSetting(config.promptKey, template);
        $(this).prop('disabled', true).css('opacity', '0.5');
        if (window.toastr) window.toastr.success('Prompt updated.', 'Vistalyze');
    });

    await popupPromise;
}
