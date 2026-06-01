/**
 * @file data/default-user/extensions/vistalyze/settings/panel.js
 * @stamp {"utc":"2026-04-04T12:20:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * The primary entry point for the Vistalyze settings UI. 
 *
 * @updates
 * - Migration: Replaced all direct setting mutations with updateActiveSetting, 
 *   updateMetaSetting, and switchProfile setters.
 * - Standardized Flow: UI events now trigger data updates through protected gatekeepers.
 * - Guidance Support: Added click handler for .lz-info-icon to display model advice via callPopup.
 * - Added bindings for autoAcceptLocation and autoAcceptDescription checkboxes.
 * - Integrated translation-ready t and translate wrappers for user-facing strings.
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point for extension settings init.
 *
 * @contract
 *   assertions:
 *     purity: UI Orchestrator
 *     state_ownership: [none]
 *     external_io: [#extensions_settings DOM, settings/data.js, callPopup]
 */

import { getRequestHeaders, callPopup } from '../../../../../script.js';
import { t, translate } from '../../../../i18n.js';
import { warn, error, setVerboseLogging } from '../utils/logger.js';
import { runFullAudit } from '../orphanDetector.js';
import { openOrphanModal } from '../ui/orphanModal.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { 
    getSettings, 
    getMetaSettings, 
    initSettings, 
    updateActiveSetting, 
    updateMetaSetting, 
    switchProfile 
} from './data.js';
import { 
    DEFAULT_BOOLEAN_PROMPT, 
    DEFAULT_CLASSIFIER_PROMPT, 
    DEFAULT_DESCRIBER_PROMPT, 
    DEFAULT_DISCOVERY_PROMPT,
    DEFAULT_IMAGE_PROMPT_TEMPLATE, 
    DEFAULT_IMAGE_MODEL, 
    POLLINATIONS_MODELS 
} from '../defaults.js';

import { buildPanelHTML } from '../ui/settings/templates.js';
import { openPromptModal } from '../ui/settings/promptModal.js';
import { 
    updateKeyStatusIndicator, 
    savePollinationsKey, 
    testPollinationsConnection 
} from '../ui/settings/vault.js';
import { 
    updateDirtyIndicator, 
    refreshProfileDropdown, 
    handleProfileSave, 
    handleProfileAdd, 
    handleProfileRename, 
    handleProfileDelete 
} from '../ui/settings/profileController.js';

// ─── Connection Dropdowns ──────────────────────────────────────────────────

function initDropdowns() {
    const s = getSettings();
    const pairs = [
        { selector: '#lz-profile-boolean',    key: 'booleanProfileId'    },
        { selector: '#lz-profile-classifier', key: 'classifierProfileId' },
        { selector: '#lz-profile-describer',  key: 'describerProfileId'  },
        { selector: '#lz-profile-discovery',  key: 'discoveryProfileId'  },
    ];

    for (const { selector, key } of pairs) {
        try {
            ConnectionManagerRequestService.handleDropdown(
                selector,
                s[key] ?? '',
                (profile) => {
                    // Protected Update: Set connection profile ID
                    updateActiveSetting(key, profile?.id ?? null);
                    updateDirtyIndicator(getMetaSettings());
                },
            );
        } catch (err) {
            warn('Settings', `Connection Manager failed for ${selector}:`, err);
            $(selector).closest('.lz-profile-row').hide();
        }
    }
}

// ─── UI Population ──────────────────────────────────────────────────────────

function populateInputs() {
    const s = getSettings();
    const meta = getMetaSettings();

    $('#lz-settings').find('.lz-history-input').each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    $('#lz-image-model').val(s.imageModel ?? DEFAULT_IMAGE_MODEL);
    $('#lz-dev-mode').prop('checked', s.devMode ?? false);
    $('#lz-parallax-enabled').prop('checked', meta.parallaxEnabled ?? false);

    // Auto-Detect toggle
    $('#lz-auto-detect-enabled').prop('checked', s.autoDetectEnabled ?? true);

    // Auto-Accept bypasses
    $('#lz-auto-accept-location').prop('checked', s.autoAcceptLocation ?? false);
    $('#lz-auto-accept-description').prop('checked', s.autoAcceptDescription ?? false);

    $('#lz-verbose-logging').prop('checked', meta.verboseLogging ?? true);
    $('#lz-rerun-badge').prop('checked', meta.rerunBadge ?? false);

    $('#lz-pollinations-status').text('');
    updateKeyStatusIndicator();
    refreshProfileDropdown(meta);
}

function refreshPanel() {
    initDropdowns();
    populateInputs();
}

// ─── Event Bindings ─────────────────────────────────────────────────────────

function bindHandlers() {
    const meta = getMetaSettings();
    const promptDefaults = {
        booleanPrompt:       DEFAULT_BOOLEAN_PROMPT,
        classifierPrompt:    DEFAULT_CLASSIFIER_PROMPT,
        describerPrompt:     DEFAULT_DESCRIBER_PROMPT,
        discoveryPrompt:     DEFAULT_DISCOVERY_PROMPT,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    };
    const promptTitles = {
        booleanPrompt:       'Step 1 — Has Location Changed?',
        classifierPrompt:    'Step 2 — Which Location?',
        describerPrompt:     'Step 3 — Describe New Location',
        discoveryPrompt:     'Step 4 — Targeted Discovery',
        imagePromptTemplate: 'Image Prompt Template',
    };
    const promptVariables = {
        booleanPrompt: [
            { name: 'current_location', description: 'Display name of the current active location' },
            { name: 'history',          description: 'Recent conversation turns (count set by History slider)' },
            { name: 'message',          description: 'The latest AI message being evaluated' },
        ],
        classifierPrompt: [
            { name: 'current_location',        description: 'The active location the character is currently in' },
            { name: 'key_list',                description: 'All known locations — name, definition, and ID' },
            { name: 'filtered_list',           description: 'All known locations except the current one' },
            { name: 'history',                 description: 'Recent conversation turns (count set by History slider)' },
            { name: 'message',                 description: 'The latest AI message being evaluated' },
            { name: 'spatial_transitions',     description: 'Historical exit frequencies from the current location (raw list or Often / Sometimes / Seldom buckets)' },
            { name: 'spatial_discovery_count', description: 'Number of new locations ever created from the current location' },
        ],
        describerPrompt: [
            { name: 'context', description: 'Recent transcript used to identify and describe a new location' },
        ],
        discoveryPrompt: [
            { name: 'keywords', description: 'User-supplied search keywords for targeted location creation' },
            { name: 'context',  description: 'Recent transcript for world-consistency grounding' },
        ],
        imagePromptTemplate: [
            { name: 'image_prompt', description: 'The location\'s raw visual description (Visuals field)' },
            { name: 'name',         description: 'The location\'s display name' },
            { name: 'description',  description: 'The location\'s conceptual definition' },
        ],
    };

    $('#lz-settings').on('change', '#lz-profile-select', function() {
        const newName = $(this).val();
        if (!meta.profiles[newName]) return;
        
        // Protected Update: Switch profile via Setter API
        switchProfile(newName);
        refreshPanel();
    });

    $('#lz-settings').on('click', '#lz-profile-save',   () => handleProfileSave(meta));
    $('#lz-settings').on('click', '#lz-profile-add',    () => handleProfileAdd(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-rename', () => handleProfileRename(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-delete', () => handleProfileDelete(meta, refreshPanel));

    $('#lz-settings').on('click', '.lz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        const updated = await openPromptModal(key, promptTitles[key], promptDefaults[key], promptVariables[key] ?? []);
        if (updated) updateDirtyIndicator(meta);
    });

    // Guidance Popup Handler
    $('#lz-settings').on('click', '.lz-info-icon', function () {
        const guidance = $(this).data('guidance');
        callPopup(`<h3>${translate('Vistalyze Guidance')}</h3><p>${guidance}</p>`, 'text');
    });

    $('#lz-settings').on('input', '.lz-history-input', function () {
        const key = $(this).data('history-key');
        const val = Math.max(0, parseInt($(this).val()) || 0);
        
        // Protected Update: Update numeric setting
        updateActiveSetting(key, val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-auto-detect-enabled', function () {
        updateActiveSetting('autoDetectEnabled', $(this).prop('checked'));
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-auto-accept-location', function () {
        updateActiveSetting('autoAcceptLocation', $(this).prop('checked'));
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-auto-accept-description', function () {
        updateActiveSetting('autoAcceptDescription', $(this).prop('checked'));
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('click', '#lz-pollinations-save', () => {
        savePollinationsKey($('#lz-pollinations-key').val());
        $('#lz-pollinations-key').val('');
    });

    $('#lz-settings').on('click', '#lz-pollinations-check', () => testPollinationsConnection());

    $('#lz-settings').on('change', '#lz-image-model', function () {
        const val = $(this).val() || DEFAULT_IMAGE_MODEL;
        
        // Protected Update: Update active model
        updateActiveSetting('imageModel', val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-dev-mode', function () {
        const val = $(this).prop('checked');
        
        // Protected Update: Update boolean flag
        updateActiveSetting('devMode', val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-parallax-enabled', function () {
        const val = $(this).prop('checked');

        // Protected Update: Update global feature flag
        updateMetaSetting('parallaxEnabled', val);
    });

    $('#lz-settings').on('change', '#lz-verbose-logging', function () {
        const val = $(this).prop('checked');
        updateMetaSetting('verboseLogging', val);
        setVerboseLogging(val);
    });

    $('#lz-settings').on('change', '#lz-rerun-badge', async function () {
        const val = $(this).prop('checked');
        updateMetaSetting('rerunBadge', val);
        const { reinjectAllBadges } = await import('../ui/messageBadge.js');
        reinjectAllBadges();
    });

    $('#lz-settings').on('click', '#lz-audit-btn', async function () {
        const $btn = $(this);
        const originalHtml = $btn.html();

        try {
            $btn.html(`<i class="fa-solid fa-spinner fa-spin"></i> ${translate('Auditing...')}`);

            const res = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            });
            const data = await res.json();
            const images = data.images ?? [];

            const orphans = await runFullAudit(images);

            updateMetaSetting('auditCache', {
                lastAudit: new Date().toISOString(),
                orphans,
                suspects: orphans,
            });

            if (orphans.length > 0) {
                openOrphanModal(orphans);
            } else {
                if (window.toastr) window.toastr.success(t`No orphaned images found.`, 'Vistalyze');
            }
        } catch (err) {
            error('Settings', 'Audit failed:', err);
            if (window.toastr) window.toastr.error(t`Audit failed. See console for details.`, 'Vistalyze');
        } finally {
            $btn.html(originalHtml);
        }
    });
}

// ─── Entry Point ────────────────────────────────────────────────────────────

export function injectSettingsPanel() {
    if ($('#lz-settings').length) return;

    initSettings();

    const $parent = $('#extensions_settings');
    if (!$parent.length) return;

    const meta = getMetaSettings();
    $parent.append(buildPanelHTML(meta, POLLINATIONS_MODELS));

    setVerboseLogging(meta.verboseLogging ?? true);
    bindHandlers();
    refreshPanel();
}