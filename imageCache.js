/**
 * @file imageCache.js
 * @stamp {"utc":"2026-06-02T00:00:00.000Z"}
 * @architectural-role Image IO
 * @description
 * Owns all image-related IO. Delegates Pollinations API calls to the ST SD
 * extension proxy (/api/sd/pollinations/generate), which handles auth
 * server-side. VLZ retains full control over filenames and upload destination.
 *
 * @updates
 * - Migrated from direct Pollinations fetch + client-side secret to ST SD proxy.
 * - Removes allowKeysExposure requirement from config.yaml.
 *
 * @api-declaration
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
 *     external_io: [fetch(/api/sd/pollinations/generate), fetch(/api/backgrounds/all), fetch(/api/backgrounds/upload)]
 */

import { getRequestHeaders } from '../../../../script.js'
import { getSettings } from './settings/data.js'
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
} from './defaults.js'

function interpolateImagePrompt(template, locationDef) {
    return template
        .replace(/\{\{image_prompt\}\}/g, locationDef.imagePrompt ?? '')
        .replace(/\{\{name\}\}/g,         locationDef.name        ?? '')
        .replace(/\{\{description\}\}/g,  locationDef.description ?? '')
}

async function callPollinationsProxy(prompt, overrides = {}) {
    const s = getSettings()
    const devMode = s.devMode ?? false
    const res = await fetch('/api/sd/pollinations/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            prompt,
            model:           s.imageModel ?? DEFAULT_IMAGE_MODEL,
            negative_prompt: '',
            width:           overrides.width  ?? (devMode ? DEV_IMAGE_WIDTH  : 1920),
            height:          overrides.height ?? (devMode ? DEV_IMAGE_HEIGHT : 1080),
            seed:            -1,
        }),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Pollinations proxy error (${res.status}): ${text}`)
    }
    return res.json()
}

function base64ToBlob(base64, format) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: `image/${format}` })
}

export async function fetchPreviewBlob(prompt) {
    const { image, format } = await callPollinationsProxy(prompt, { width: 320, height: 180 })
    return URL.createObjectURL(base64ToBlob(image, format))
}

/**
 * Fetches a full-resolution image using the same template as generate(),
 * but returns a local blob URL instead of uploading to the server.
 * The filename is assigned later, at upload time.
 */
export async function fetchFullBlob(locationDef) {
    const template = getSettings().imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)
    const { image, format } = await callPollinationsProxy(finalPrompt)
    return URL.createObjectURL(base64ToBlob(image, format))
}

/**
 * Uploads a pre-fetched blob URL to the server backgrounds store.
 * Filename is assigned here — this is the "write" step.
 */
export async function uploadBlob(blobUrl, filename) {
    const res = await fetch(blobUrl)
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
    const res = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    })
    const data = await res.json()
    const images = (data.images ?? []).map(f => (typeof f === 'string' ? f : f.filename))
    const fileIndex = new Set(images.filter(f => f.startsWith(`vistalyze_${sessionId}_`)))
    return { fileIndex, allImages: images }
}

export async function generate(key, locationDef, sessionId) {
    const filename = `vistalyze_${sessionId}_${key}.png`
    const template = getSettings().imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)

    const { image, format } = await callPollinationsProxy(finalPrompt)
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