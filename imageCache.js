/**
 * @file imageCache.js
 * @stamp {"utc":"2026-06-03T00:00:00.000Z"}
 * @architectural-role Image IO
 * @description
 * Owns all image-related IO. Routes generation through the ST SD extension's
 * server-side proxy endpoints based on VLZ's own imageSource setting.
 * VLZ retains full control of filenames and upload destination.
 *
 * @updates
 * - Added multi-source routing via ST proxy endpoints.
 * - VLZ imageSource/imageModel are fully independent from extension_settings.sd.
 *
 * @api-declaration
 * loadModelsForSource(source) → Promise<Array|null>
 * fetchPreviewBlob(prompt) → Promise<string> (Object URL)
 * fetchFullBlob(locationDef) → Promise<string> (Object URL)
 * uploadBlob(blobUrl, filename) → Promise<string> (filename)
 * fetchFileIndex(sessionId) → Promise<{fileIndex, allImages}>
 * generate(key, locationDef, sessionId) → Promise<string> (filename)
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [fetch(/api/sd/*/generate), fetch(/api/openai/generate-image),
 *                   fetch(/api/google/generate-image), fetch(/api/openrouter/image/generate),
 *                   fetch(/api/sd/*/models), fetch(/api/backgrounds/all),
 *                   fetch(/api/backgrounds/upload)]
 */

import { getRequestHeaders } from '../../../../script.js'
import { getSettings } from './settings/data.js'
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_SOURCE,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
} from './defaults.js'

// ─── Source routing tables ────────────────────────────────────────────────────

/** Sources with a live server-side model discovery endpoint. */
const MODEL_ENDPOINTS = {
    pollinations: '/api/sd/pollinations/models',
    falai:        '/api/sd/falai/models',
    togetherai:   '/api/sd/together/models',
    chutes:       '/api/sd/chutes/models',
    electronhub:  '/api/sd/electronhub/models',
    nanogpt:      '/api/sd/nanogpt/models',
    aimlapi:      '/api/sd/aimlapi/models',
    openrouter:   '/api/openrouter/models/image',
}

/** Generation endpoint for each supported cloud source. */
const GENERATION_ENDPOINTS = {
    pollinations: '/api/sd/pollinations/generate',
    falai:        '/api/sd/falai/generate',
    bfl:          '/api/sd/bfl/generate',
    stability:    '/api/sd/stability/generate',
    openai:       '/api/openai/generate-image',
    google:       '/api/google/generate-image',
    togetherai:   '/api/sd/together/generate',
    chutes:       '/api/sd/chutes/generate',
    electronhub:  '/api/sd/electronhub/generate',
    nanogpt:      '/api/sd/nanogpt/generate',
    xai:          '/api/sd/xai/generate',
    zai:          '/api/sd/zai/generate',
    aimlapi:      '/api/sd/aimlapi/generate-image',
    openrouter:   '/api/openrouter/image/generate',
    huggingface:  '/api/sd/huggingface/generate',
}

/** Sources that require a local server — unsupported for background generation. */
const LOCAL_SOURCES = new Set(['extras', 'horde', 'auto', 'vlad', 'sdcpp', 'drawthings', 'comfy', 'novel'])

// ─── Request builders ─────────────────────────────────────────────────────────

function buildRequestBody(source, prompt, model, width, height) {
    switch (source) {
        case 'openai':
            return { prompt, model, n: 1, size: `${width}x${height}`, response_format: 'b64_json' }
        case 'google':
            return { prompt, model, aspect_ratio: width >= height ? '16:9' : '9:16', api: 'makersuite' }
        case 'stability':
            return { model, payload: { prompt, negative_prompt: '', output_format: 'png' } }
        case 'xai':
            return { prompt, model, aspect_ratio: width >= height ? '16:9' : '9:16', resolution: 'HD' }
        default:
            return { prompt, model, negative_prompt: '', width, height, seed: -1 }
    }
}

// ─── Response normalizer ──────────────────────────────────────────────────────

async function normalizeImageResponse(res, source) {
    if (source === 'stability') {
        const image = await res.text()
        return { image, format: 'png' }
    }
    if (source === 'openai') {
        const data = await res.json()
        return { image: data?.data?.[0]?.b64_json, format: 'png' }
    }
    const data = await res.json()
    return { image: data?.image ?? data?.data, format: data?.format ?? 'png' }
}

// ─── Core proxy call ──────────────────────────────────────────────────────────

async function callImageProxy(prompt, overrides = {}) {
    const s = getSettings()
    const source   = s.imageSource ?? DEFAULT_IMAGE_SOURCE
    const model    = s.imageModel  ?? DEFAULT_IMAGE_MODEL
    const width    = overrides.width  ?? 1920
    const height   = overrides.height ?? 1080

    if (LOCAL_SOURCES.has(source)) {
        throw new Error(
            `"${source}" requires a local server and is not supported for background generation. ` +
            `Choose a cloud-based source in Vistalyze image settings.`
        )
    }

    if (source === 'workersai') {
        throw new Error(
            `"workersai" requires an Account ID from API Connections and is not currently ` +
            `supported by Vistalyze. Choose a different source.`
        )
    }

    const endpoint = GENERATION_ENDPOINTS[source]
    if (!endpoint) {
        throw new Error(`Unknown image source: "${source}". Please select a supported source in Vistalyze settings.`)
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(buildRequestBody(source, prompt, model, width, height)),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Image generation failed (${source} ${res.status}): ${text}`)
    }

    return normalizeImageResponse(res, source)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interpolateImagePrompt(template, locationDef) {
    return template
        .replace(/\{\{image_prompt\}\}/g, locationDef.imagePrompt ?? '')
        .replace(/\{\{name\}\}/g,         locationDef.name        ?? '')
        .replace(/\{\{description\}\}/g,  locationDef.description ?? '')
}

function base64ToBlob(base64, format) {
    const binary = atob(base64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: `image/${format}` })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns [{value, text}] if the source has a live model endpoint, null otherwise.
 * Null signals the UI to show a text input instead of a select.
 */
export async function loadModelsForSource(source) {
    const endpoint = MODEL_ENDPOINTS[source]
    if (!endpoint) return null
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        })
        if (!res.ok) return null
        const data = await res.json()
        return Array.isArray(data) && data.length > 0 ? data : null
    } catch {
        return null
    }
}

export async function fetchPreviewBlob(prompt) {
    const { image, format } = await callImageProxy(prompt, { width: 320, height: 180 })
    return URL.createObjectURL(base64ToBlob(image, format))
}

/**
 * Fetches a full-resolution image using the same template as generate(),
 * but returns a local blob URL instead of uploading to the server.
 * The filename is assigned later, at upload time.
 */
export async function fetchFullBlob(locationDef) {
    const template    = getSettings().imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)
    const { image, format } = await callImageProxy(finalPrompt)
    return URL.createObjectURL(base64ToBlob(image, format))
}

/**
 * Uploads a pre-fetched blob URL to the server backgrounds store.
 * Filename is assigned here — this is the "write" step.
 */
export async function uploadBlob(blobUrl, filename) {
    const res  = await fetch(blobUrl)
    const blob = await res.blob()
    const file = new File([blob], filename, { type: 'image/png' })

    const formData = new FormData()
    formData.append('avatar', file)

    const uploadRes = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    })

    if (!uploadRes.ok) throw new Error(`Background upload failed: ${uploadRes.status} ${uploadRes.statusText}`)

    return filename
}

export async function fetchFileIndex(sessionId) {
    const res  = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    })
    const data   = await res.json()
    const images = (data.images ?? []).map(f => (typeof f === 'string' ? f : f.filename))
    const fileIndex = new Set(images.filter(f => f.startsWith(`vistalyze_${sessionId}_`)))
    return { fileIndex, allImages: images }
}

export async function generate(key, locationDef, sessionId) {
    const filename    = `vistalyze_${sessionId}_${key}.png`
    const template    = getSettings().imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)

    const { image, format } = await callImageProxy(finalPrompt)
    const file = new File([base64ToBlob(image, format)], filename, { type: 'image/png' })

    const formData = new FormData()
    formData.append('avatar', file)

    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    })

    if (!res.ok) throw new Error(`Background upload failed: ${res.status} ${res.statusText}`)

    return filename
}
