/**
 * @file data/default-user/extensions/vistalyze/detector.js
 * @stamp {"utc":"2026-04-02T15:00:00.000Z"}
 * @architectural-role LLM IO / Parser
 * @description
 * Handles all LLM detection calls. Features robust heuristic parsing for 
 * non-standard AI replies (markdown, punctuation, etc.) and verbose 
 * raw-output logging for debugging.
 *
 * @api-declaration
 * detectBoolean(messageText, currentLocation, ...) → boolean
 * detectClassifier(messageText, locationKeys, ...) → string | null
 * detectDescriber(contextText, ...) → object | null
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [generateQuietPrompt, ConnectionManagerRequestService, console.debug]
 */
import { generateQuietPrompt } from '../../../../script.js'
import { ConnectionManagerRequestService } from '../../shared.js'
import { log, warn, error } from './utils/logger.js'

function interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

/**
 * Robust Marker Extractor (CNZ Pattern).
 * Scans for Name:, Definition:, and Visuals: labels.
 */
function extractMarkerData(raw) {
    const text = String(raw || '');
    const fieldMap = {
        name: 'Name',
        description: 'Definition',
        imagePrompt: 'Visuals'
    };
    const result = {};

    for (const [key, marker] of Object.entries(fieldMap)) {
        const regex = new RegExp(`\\*?\\*?${marker}\\*?\\*?:\\s*([\\s\\S]*?)(?=\\n\\*?\\*?(?:Name|Definition|Visuals)\\*?\\*?:|$)`, 'i');
        const match = text.match(regex);
        if (match) {
            result[key] = match[1].trim().replace(/^\*+|\*+$/g, '');
        }
    }

    if (!result.name || !result.imagePrompt) {
        return null;
    }

    return result;
}

/**
 * Dispatches the prompt to the LLM with Verbose Raw Logging.
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    let connectionNote;
    if (profileId) {
        try {
            const profile = ConnectionManagerRequestService.getProfile(profileId);
            connectionNote = `Routing via Connection Manager → "${profile.name}"`;
        } catch {
            connectionNote = `Routing via Connection Manager → profile: "${profileId}"`;
        }
    } else {
        connectionNote = `No custom connection specified — defaulting to main SillyTavern chat LLM`;
    }
    log(label, `--- PROMPT SENT --- (${connectionNote})\n${prompt}`);

    let result;
    if (profileId) {
        try {
            window.loggeryze?.tagNext('VLZ');
            result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions);
        } catch (err) {
            warn(label, `ConnectionManager failed for profile "${profileId}" — falling back to main chat LLM:`, err);
        }
    }

    if (!result) {
        try {
            window.loggeryze?.tagNext('VLZ');
            result = await generateQuietPrompt({
                quietPrompt: prompt,
                removeReasoning: true,
                ...extraOptions
            });
        } catch (err) {
            const msg = `[${label}] generateQuietPrompt failed (${connectionNote}): ${err.message}`;
            error(label, msg, err);
            throw new Error(msg, { cause: err });
        }
    }

    const text = result?.content ?? result;

    // VISIBILITY: Show exactly what the AI said before we touch it
    log(label, `--- RAW AI RESPONSE ---\n${text}`);

    return text;
}

/**
 * Step 1: Boolean Gate.
 * Uses Regex to handle "noisy" YES/NO replies from chatty models.
 */
export async function detectBoolean(messageText, currentLocation, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        current_location: currentLocation,
        history: historyText,
        message: messageText,
    })
    
    const text = await dispatch(prompt, profileId, 'Boolean', { temperature: 0.1 });
    const cleanText = String(text).toUpperCase();

    // Heuristic: Use Word-Boundary Regex to find YES or NO anywhere in the string
    const hasYes = /\bYES\b/.test(cleanText);

    const result = hasYes && !cleanText.includes("NOT YES");
    
    log('Boolean', `Result interpreted as: ${result ? 'YES (Changed)' : 'NO (Same)'}`);
    return result;
}

/**
 * Step 2: Classifier.
 */
export async function detectClassifier(messageText, locationKeys, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        key_list: locationKeys.join(', '),
        history: historyText,
        message: messageText,
    })
    
    const text = await dispatch(prompt, profileId, 'Classifier', { temperature: 0.1 })
    const cleanedText = String(text).trim()

    if (!cleanedText || cleanedText.toUpperCase().includes('NULL')) {
        return null
    }

    // Heuristic: Check for exact key match within the reply
    for (const key of locationKeys) {
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        if (regex.test(cleanedText)) {
            return key;
        }
    }

    return null;
}

/**
 * Step 3: Describer.
 */
export async function detectDescriber(contextText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, { context: contextText })
    const raw = await dispatch(prompt, profileId, 'Describer', { temperature: 0.1 });
    return extractMarkerData(raw);
}