/**
 * @file data/default-user/extensions/vistalyze/background.js
 * @stamp {"utc":"2026-04-01T12:00:00.000Z"}
 * @architectural-role IO Executor
 * @description
 * Sets and clears the ST background using the chat_metadata lock mechanism.
 * When parallax is enabled in settings, delegates image display to
 * ui/parallax.js via an injected <img> child. When disabled, falls back to
 * the CSS background-image approach so existing behaviour is preserved exactly.
 *
 * @updates
 * - Implemented URL Cache Busting: Appends a timestamp (?v=) to background URLs.
 *   This ensures the UI updates immediately when an image is overwritten on the server.
 *   Maintains static filenames to prevent folder clutter.
 * - Parallax integration: set() delegates to attachParallax() when enabled,
 *   falls back to CSS background-image when disabled. set() always calls
 *   detachParallax() first so no stale <img> lingers if the setting is toggled
 *   between transitions. detachParallax() and background-image clearing are
 *   both deferred to inside the fade-out window, so the outgoing image always
 *   fades smoothly before teardown.
 *
 * @api-declaration
 * set(filename)           — applies background with fade and cache-busting, sets managed lock
 * clear()                 — removes background with fade, releases lock
 * isManagedByVistalyze()   — true if the current bg lock was set by us
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [chat_metadata['custom_background'] (write),
 *       chat_metadata['vistalyze_managed'] (write),
 *       #bg1 DOM (write — CSS or via parallax delegate),
 *       saveMetadataDebounced(),
 *       attachParallax() (delegate), detachParallax() (delegate),
 *       getMetaSettings() (read)]
 */
import { chat_metadata } from '../../../../script.js'
import { saveMetadataDebounced } from '../../../extensions.js'
import { attachParallax, detachParallax } from './ui/parallax.js'
import { getMetaSettings } from './settings/data.js'
import { log } from './utils/logger.js'

const BG_KEY      = 'custom_background'
const MANAGED_KEY = 'vistalyze_managed'

/**
 * Checks if the current background lock belongs to Vistalyze.
 * @returns {boolean}
 */
export function isManagedByVistalyze() {
    return !!chat_metadata[MANAGED_KEY]
}

/**
 * Safely applies a background image to the SillyTavern UI.
 * @param {string} filename The name of the image file in public/backgrounds/
 */
export function set(filename) {
    // 1. Guard: Prevent malformed requests if filename is missing
    if (!filename || typeof filename !== 'string') {
        log('Background', 'Skipping setBg: filename is null or empty.');
        return;
    }

    // 2. Guard: Don't overwrite a manual user-set background lock
    if (chat_metadata[BG_KEY] && !isManagedByVistalyze()) {
        log('Background', 'Skipping setBg: Manual user lock detected.');
        return;
    }

    // 3. Cache Busting: Append a timestamp to the URL.
    // This forces the browser to re-download the image even if the filename is identical
    // to a previously cached version (useful for overwrites).
    const cacheBuster = `v=${Date.now()}`;
    const rawUrl  = `backgrounds/${encodeURIComponent(filename)}?${cacheBuster}`
    const cssUrl  = `url("${rawUrl}")`

    // NOTE: We intentionally do NOT write to chat_metadata[BG_KEY] (ST's native
    // 'custom_background' key). If we did, ST would apply the URL on next startup
    // before this extension has a chance to verify the file still exists, causing
    // a guaranteed 404. Vistalyze's boot sequence (bootstrapper.js) handles
    // background restoration after filesystem verification.
    chat_metadata[MANAGED_KEY] = true

    // UI Fade Sequence — image is applied while #bg1 is at opacity:0 so it is
    // positioned and ready before the fade-in begins.
    $('#bg1').addClass('vistalyze-fade-out')
    setTimeout(() => {
        // Always tear down any previous parallax instance first. Safe no-op if
        // none is active; cleans up stale <img> if setting was toggled.
        detachParallax()

        if (getMetaSettings().parallaxEnabled) {
            $('#bg1').css('background-image', '')
            attachParallax(rawUrl)
        } else {
            $('#bg1').css('background-image', cssUrl)
        }

        $('#bg1').removeClass('vistalyze-fade-out').addClass('vistalyze-fade-in')

        // Cleanup transition classes after animation completes (~600ms total)
        setTimeout(() => $('#bg1').removeClass('vistalyze-fade-in'), 600)
    }, 300)

    saveMetadataDebounced()
}

/**
 * Releases the VLZ metadata lock and tears down parallax without touching #bg1.
 * Use when the host application (ST) will handle visual restoration itself —
 * e.g. on close-chat, where ST's own onChatChanged() already restores the
 * user's global default background to #bg1.
 */
export function releaseLock() {
    if (chat_metadata[BG_KEY] && !isManagedByVistalyze()) return;
    delete chat_metadata[BG_KEY]
    delete chat_metadata[MANAGED_KEY]
    detachParallax()
    saveMetadataDebounced()
}

/**
 * Removes the background image and releases the metadata lock.
 */
export function clear() {
    // Guard: Don't release the lock if we don't own it
    if (chat_metadata[BG_KEY] && !isManagedByVistalyze()) {
        // DEBUG: This fires when custom_background has a value we didn't set.
        // If the value is a vistalyze filename, an old version likely wrote it directly.
        log('Background', 'clear() guard blocked — custom_background is set but not owned:', chat_metadata[BG_KEY]);
        return;
    }

    delete chat_metadata[BG_KEY]
    delete chat_metadata[MANAGED_KEY]

    $('#bg1').addClass('vistalyze-fade-out')
    setTimeout(() => {
        // Tear down parallax (no-op if not active) and clear CSS path together,
        // both deferred so the outgoing image fades before removal.
        detachParallax()
        $('#bg1').css('background-image', '')
        $('#bg1').removeClass('vistalyze-fade-out')
    }, 300)

    saveMetadataDebounced()
}
