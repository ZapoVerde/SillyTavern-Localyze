/**
 * @file data/default-user/extensions/vistalyze/index.js
 * @stamp {"utc":"2026-04-02T17:00:00.000Z"}
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Location Engine (Vistalyze) — extension entry point.
 * 
 * @updates
 * - Removed initial runBoot() call if no chat is active to prevent "Abort" log.
 * - Confirmed zero i18n hooks to minimize translation overhead.
 * - Standardized event registration sequence.
 *
 * @api-declaration
 * handleMessageReceived(messageId) — routes new AI messages to the pipeline.
 * handleChatChanged()              — resets state and reboots on chat switch.
 * init()                           — the primary async initialization sequence.
 *
 * @contract
 *   assertions:
 *     purity: Event Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource (subscribe), UI Injections, Bootstrapper]
 */

import { eventSource, event_types, chat_metadata } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { resetState } from './state.js';
import { log, error } from './utils/logger.js';
import { initSettings } from './settings/data.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { releaseLock } from './background.js';
import { handleOpenLibrary, handleEditLocation, handleManualDescriber } from './logic/maintenance.js';
import { injectToolbar } from './ui/toolbar.js';
import { injectSettingsPanel } from './settings/panel.js';
import { injectMessageBadge, reinjectAllBadges } from './ui/messageBadge.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received.
 */
function handleMessageReceived(messageId) {
    runPipeline(messageId)
        .then(() => injectMessageBadge(messageId))
        .catch(err => {
            error('Core', 'Pipeline execution failed:', err);
        });
}

/**
 * Swipe Dispatcher.
 * Triggered when the user navigates to an existing swipe alternative.
 * Skips if the swipe slot is unpopulated (new generation in progress —
 * MESSAGE_RECEIVED will fire when that generation completes).
 */
function handleMessageSwiped(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    if (!message || message.is_user) return;

    // If the active swipe slot has no content yet, a new generation is
    // starting. Don't run the pipeline here — MESSAGE_RECEIVED handles it.
    const swipeContent = message.swipes?.[message.swipe_id];
    if (typeof swipeContent !== 'string') return;

    runPipeline(messageId)
        .then(() => injectMessageBadge(messageId))
        .catch(err => {
            error('Core', 'Pipeline execution failed on swipe:', err);
        });
}

/**
 * Session Lifecycle Manager.
 * Resets runtime state and initiates the boot sequence (DNA reconstruction)
 * whenever the active chat changes.
 */
function handleChatChanged() {
    log('Core', 'Chat changed event detected.');
    // DEBUG: Snapshot chat_metadata at the moment CHAT_CHANGED fires.
    // If custom_background contains a vistalyze filename here, ST's onChatChanged
    // will immediately apply it as CSS before runBoot() can verify the file exists.
    log('Core', 'chat_metadata snapshot on CHAT_CHANGED:', {
        custom_background: chat_metadata.custom_background ?? '(not set)',
        vistalyze_managed:  chat_metadata.vistalyze_managed  ?? '(not set)',
    });
    resetState();

    const context = getContext();
    if (!context?.chatId) {
        log('Core', 'No active chat — releasing VLZ lock, ST will restore default bg.');
        releaseLock();
        return;
    }

    runBoot()
        .then(() => reinjectAllBadges())
        .catch(err => {
            error('Core', 'Bootstrapper failed during chat change:', err);
        });
}

/**
 * Extension Entry Point.
 * Orchestrates the startup sequence.
 * 
 * NOTE: i18n (Internationalization) is explicitly disabled/ignored to 
 * reduce overhead during development.
 */
async function init() {
    log('Core', 'Extension initializing...');

    try {
        // 1. Data Layer - Bootstrap settings.
        initSettings();

        // 2. UI Layer - Inject persistent elements into the ST DOM.
        injectToolbar(handleOpenLibrary, handleEditLocation, handleManualDescriber);
        injectSettingsPanel();

        // 3. Host Events - Bind core SillyTavern lifecycle events.
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.MESSAGE_SWIPED, handleMessageSwiped);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, injectMessageBadge);
        log('Core', 'Listeners active.');

        // 4. Conditional Initial Boot
        // We only trigger runBoot if a chatId is already present (e.g. extension hot-reload).
        // On a fresh ST load, we wait for the CHAT_CHANGED event to trigger the engine.
        const context = getContext();
        if (context && context.chatId) {
            log('Core', 'Active chat detected on init. Running boot sequence...');
            await runBoot();
            reinjectAllBadges();
        } else {
            log('Core', 'Standing by for chat selection.');
        }

    } catch (err) {
        error('Core', 'CRITICAL FAILURE during initialization:', err);
    }
}

// ─── Execution ───────────────────────────────────────────────────────────────

init().catch(err => {
    error('Core', 'Top-level initialization rejection:', err);
});