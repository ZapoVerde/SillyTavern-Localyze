/**
 * @file data/default-user/extensions/vistalyze/ui/settings/profileController.js
 * @stamp {"utc":"2026-04-04T12:35:00.000Z"}
 * @architectural-role UI Controller / Profile Logic
 * @description
 * Manages the logic for settings profiles and "dirty" state tracking.
 * Provides the bridge between the UI dropdown and the underlying 
 * profile dictionary in settings/data.js.
 *
 * @updates
 * - Migration: Replaced direct mutation of extension_settings with switchProfile,
 *   saveCurrentProfile, createProfile, renameCurrentProfile, and deleteCurrentProfile.
 * - Integrated translation-ready t and translate wrappers for user-facing strings.
 *
 * @api-declaration
 * isStateDirty(meta) -> boolean
 * updateDirtyIndicator(meta) -> void
 * refreshProfileDropdown(meta) -> void
 * handleProfileSave(meta) -> void
 * handleProfileAdd(meta, onRefresh) -> Promise<void>
 * handleProfileRename(meta, onRefresh) -> Promise<void>
 * handleProfileDelete(meta, onRefresh) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: UI Controller
 *     state_ownership: [none]
 *     external_io: [settings/data.js, callPopup, toastr, i18n]
 */

import { callPopup } from '../../../../../../script.js';
import { t, translate } from '../../../../../i18n.js';
import { escapeHtml } from './templates.js';
import { 
    saveCurrentProfile, 
    switchProfile, 
    createProfile, 
    renameCurrentProfile, 
    deleteCurrentProfile 
} from '../../settings/data.js';

/**
 * Compares the active temporary state against the saved profile data.
 * @param {object} meta Root metadata object.
 * @returns {boolean} True if changes are unsaved.
 */
export function isStateDirty(meta) {
    if (!meta.profiles || !meta.currentProfileName) return false;
    const currentSaved = JSON.stringify(meta.profiles[meta.currentProfileName]);
    const currentActive = JSON.stringify(meta.activeState);
    return currentSaved !== currentActive;
}

/**
 * Updates the profile dropdown labels to reflect unsaved changes (*).
 * @param {object} meta Root metadata object.
 */
export function updateDirtyIndicator(meta) {
    const isDirty = isStateDirty(meta);
    const label = meta.currentProfileName + (isDirty ? ' *' : '');
    const $sel = $('#lz-profile-select');
    
    // Update the text of the currently selected option
    $sel.find(`option[value="${CSS.escape(meta.currentProfileName)}"]`).text(label);
    $sel.val(meta.currentProfileName);
}

/**
 * Repopulates the profile dropdown list.
 * @param {object} meta Root metadata object.
 */
export function refreshProfileDropdown(meta) {
    const $sel = $('#lz-profile-select');
    if (!$sel.length) return;

    $sel.empty();
    for (const name of Object.keys(meta.profiles)) {
        $sel.append($('<option>').val(name).text(name));
    }
    updateDirtyIndicator(meta);
}

/**
 * Commits the current activeState to the profile dictionary.
 * @param {object} meta Root metadata object.
 */
export function handleProfileSave(meta) {
    // Protected Update: Delegate persistence to Stateful Owner
    saveCurrentProfile();
    updateDirtyIndicator(meta);
    if (window.toastr) window.toastr.success(t`Profile "${meta.currentProfileName}" saved.`, 'Vistalyze');
}

/**
 * Logic for creating a new profile.
 */
export async function handleProfileAdd(meta, onRefresh) {
    const rawName = await callPopup(`<h3>${translate('New profile name', 'vistalyze.profile.new_name_title')}</h3>`, 'input', '');
    const name = (rawName ?? '').trim();
    if (!name) return;

    if (meta.profiles[name]) {
        if (window.toastr) window.toastr.warning(t`Profile "${name}" already exists.`, 'Vistalyze');
        return;
    }

    // Protected Update: Delegate creation to Stateful Owner
    createProfile(name);
    onRefresh();
}

/**
 * Logic for renaming the active profile.
 */
export async function handleProfileRename(meta, onRefresh) {
    const rawName = await callPopup(`<h3>${translate('Rename profile', 'vistalyze.profile.rename_title')}</h3>`, 'input', meta.currentProfileName);
    const newName = (rawName ?? '').trim();
    if (!newName || newName === meta.currentProfileName) return;

    if (meta.profiles[newName]) {
        if (window.toastr) window.toastr.warning(t`Profile "${newName}" already exists.`, 'Vistalyze');
        return;
    }

    // Protected Update: Delegate rename to Stateful Owner
    renameCurrentProfile(newName);
    onRefresh();
}

/**
 * Logic for deleting the active profile.
 */
export async function handleProfileDelete(meta, onRefresh) {
    if (Object.keys(meta.profiles).length <= 1) {
        if (window.toastr) window.toastr.warning(t`Cannot delete the only profile.`, 'Vistalyze');
        return;
    }

    const confirmed = await callPopup(
        `<h3>${translate('Delete profile', 'vistalyze.profile.delete_title')} "${escapeHtml(meta.currentProfileName)}"?</h3>${translate('This cannot be undone.', 'vistalyze.profile.confirm_irreversible')}`,
        'confirm'
    );
    if (!confirmed) return;

    // Protected Update: Delegate deletion to Stateful Owner
    deleteCurrentProfile();
    onRefresh();
}