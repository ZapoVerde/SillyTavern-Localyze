/**
 * @file data/default-user/extensions/vistalyze/settings/data.js
 * @stamp {"utc":"2026-04-04T12:10:00.000Z"}
 * @architectural-role Stateful Owner (Settings)
 * @description
 * Manages the Vistalyze settings lifecycle and profile-based configuration.
 * 
 * STRICT CONTRACT:
 * 1. This module is the ONLY module permitted to mutate 'extension_settings.vistalyze'.
 * 2. External modules MUST use the provided Setter API for updates.
 * 3. External modules may READ from getSettings() or getMetaSettings() directly.
 *
 * @api-declaration
 * getSettings()               — Returns activeState for the current profile (Read-Only).
 * getMetaSettings()           — Returns root metadata object (Read-Only).
 * updateActiveSetting(k, v)   — Updates a key in the current active profile.
 * updateMetaSetting(k, v)     — Updates a global meta key (e.g., parallaxEnabled).
 * switchProfile(name)         — Changes the active profile and updates activeState.
 * saveCurrentProfile()        — Commits activeState to the profiles dictionary.
 * createProfile(name)         — Creates a new profile from current activeState.
 * renameCurrentProfile(name)  — Renames the active profile.
 * deleteCurrentProfile()      — Removes the active profile.
 * initSettings()              — Initializes structure and performs migrations.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { log, warn } from '../utils/logger.js';
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_BOOLEAN_HISTORY,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_CLASSIFIER_HISTORY,
    DEFAULT_DESCRIBER_PROMPT,
    DEFAULT_DESCRIBER_HISTORY,
    DEFAULT_DISCOVERY_PROMPT,
    DEFAULT_DISCOVERY_HISTORY,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_PARALLAX_ENABLED,
    DEFAULT_AUTO_DETECT_ENABLED,
    DEFAULT_AUTO_ACCEPT_LOCATION,
    DEFAULT_AUTO_ACCEPT_DESCRIPTION,
    DEFAULT_VERBOSE_LOGGING,
    DEFAULT_RERUN_BADGE,
} from '../defaults.js';

const EXT_NAME = 'vistalyze';

/**
 * Blueprint for profile-level settings.
 */
export const PROFILE_DEFAULTS = Object.freeze({
    booleanPrompt:         DEFAULT_BOOLEAN_PROMPT,
    booleanProfileId:      null,
    booleanHistory:        DEFAULT_BOOLEAN_HISTORY,
    classifierPrompt:      DEFAULT_CLASSIFIER_PROMPT,
    classifierProfileId:   null,
    classifierHistory:     DEFAULT_CLASSIFIER_HISTORY,
    describerPrompt:       DEFAULT_DESCRIBER_PROMPT,
    describerProfileId:    null,
    describerHistory:      DEFAULT_DESCRIBER_HISTORY,
    discoveryPrompt:       DEFAULT_DISCOVERY_PROMPT,
    discoveryProfileId:    null,
    discoveryHistory:      DEFAULT_DISCOVERY_HISTORY,
    imageModel:            DEFAULT_IMAGE_MODEL,
    imagePromptTemplate:   DEFAULT_IMAGE_PROMPT_TEMPLATE,
    autoDetectEnabled:     DEFAULT_AUTO_DETECT_ENABLED,
    autoAcceptLocation:    DEFAULT_AUTO_ACCEPT_LOCATION,
    autoAcceptDescription: DEFAULT_AUTO_ACCEPT_DESCRIPTION,
});

/**
 * Returns the active configuration for the current profile.
 * @returns {object}
 */
export function getSettings() {
    return extension_settings[EXT_NAME].activeState;
}

/**
 * Returns the root settings object for global metadata.
 * @returns {object}
 */
export function getMetaSettings() {
    return extension_settings[EXT_NAME];
}

// ─── Setter API ────────────────────────────────────────────────────────────

/**
 * Updates a specific key in the active profile settings.
 * @param {string} key 
 * @param {any} value 
 */
export function updateActiveSetting(key, value) {
    const active = getSettings();
    if (Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, key)) {
        active[key] = value;
        saveSettingsDebounced();
    } else {
        warn('Settings', `Attempted to update invalid profile key: ${key}`);
    }
}

/**
 * Updates a global (meta) setting.
 * @param {string} key 
 * @param {any} value 
 */
export function updateMetaSetting(key, value) {
    const meta = getMetaSettings();
    meta[key] = value;
    saveSettingsDebounced();
}

/**
 * Switches the active profile and synchronizes the activeState.
 * @param {string} profileName 
 */
export function switchProfile(profileName) {
    const meta = getMetaSettings();
    if (meta.profiles[profileName]) {
        meta.currentProfileName = profileName;
        meta.activeState = structuredClone(meta.profiles[profileName]);
        saveSettingsDebounced();
    }
}

/**
 * Saves the current activeState into the profiles dictionary.
 */
export function saveCurrentProfile() {
    const meta = getMetaSettings();
    meta.profiles[meta.currentProfileName] = structuredClone(meta.activeState);
    saveSettingsDebounced();
}

/**
 * Creates a new profile using the current active state.
 * @param {string} name 
 */
export function createProfile(name) {
    const meta = getMetaSettings();
    meta.profiles[name] = structuredClone(meta.activeState);
    meta.currentProfileName = name;
    saveSettingsDebounced();
}

/**
 * Renames the active profile.
 * @param {string} newName 
 */
export function renameCurrentProfile(newName) {
    const meta = getMetaSettings();
    const oldName = meta.currentProfileName;
    meta.profiles[newName] = meta.profiles[oldName];
    delete meta.profiles[oldName];
    meta.currentProfileName = newName;
    saveSettingsDebounced();
}

/**
 * Deletes the active profile.
 */
export function deleteCurrentProfile() {
    const meta = getMetaSettings();
    const oldName = meta.currentProfileName;
    delete meta.profiles[oldName];
    
    // Pick first remaining profile
    const remaining = Object.keys(meta.profiles);
    meta.currentProfileName = remaining[0];
    meta.activeState = structuredClone(meta.profiles[remaining[0]]);
    saveSettingsDebounced();
}

// ─── Initialization ────────────────────────────────────────────────────────

/**
 * Initializes the settings structure.
 */
export function initSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = extension_settings[EXT_NAME];

    if (!root.profiles) {
        log('Settings', 'Creating fresh profile-based settings structure...');

        const legacyConfig = {};
        for (const key of Object.keys(PROFILE_DEFAULTS)) {
            if (Object.prototype.hasOwnProperty.call(root, key)) {
                legacyConfig[key] = root[key];
                delete root[key];
            }
        }

        const defaultProfile = Object.assign({}, PROFILE_DEFAULTS, legacyConfig);

        root.profiles = { 'Default': defaultProfile };
        root.currentProfileName = 'Default';
        root.activeState = structuredClone(defaultProfile);
        saveSettingsDebounced(); 
    } else {
        if (!root.currentProfileName) root.currentProfileName = Object.keys(root.profiles)[0];
        if (!root.activeState) root.activeState = structuredClone(root.profiles[root.currentProfileName]);
        root.activeState = Object.assign({}, PROFILE_DEFAULTS, root.activeState);
    }

    if (typeof root.parallaxEnabled !== 'boolean') root.parallaxEnabled = DEFAULT_PARALLAX_ENABLED;
    if (typeof root.verboseLogging !== 'boolean') root.verboseLogging = DEFAULT_VERBOSE_LOGGING;
    if (typeof root.rerunBadge !== 'boolean') root.rerunBadge = DEFAULT_RERUN_BADGE;
    if (!Array.isArray(root.knownSessions)) root.knownSessions = [];
    if (!root.auditCache) {
        root.auditCache = { suspects: [], lastAudit: null, orphans: [] };
    }

    // Clean legacy artifacts
    delete root.pollinationsKey;
    delete root.pollinationsSecretKey;
    delete root.vistalyze_pollinations_key;
}