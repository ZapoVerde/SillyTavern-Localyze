/**
 * @file data/default-user/extensions/vistalyze/ui/parallax.js
 * @stamp {"utc":"2026-04-04T13:30:00.000Z"}
 * @architectural-role IO Executor
 * @description
 * Manages the parallax background image for #bg1. Injects an <img> child,
 * positions it centered, and drives horizontal-only panning via rAF in
 * response to mouse movement (desktop) or device tilt (mobile).
 * Includes translation-ready wrappers for the mobile tilt permission prompt.
 *
 * @api-declaration
 * attachParallax(url)  — injects #lz-bg-img, registers events, starts rAF loop
 * detachParallax()     — removes #lz-bg-img, cancels rAF, unbinds all events
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [#bg1 DOM (child img write), window mousemove,
 *                   window deviceorientation, window resize,
 *                   requestAnimationFrame, sessionStorage (iOS tilt flag), i18n]
 */

import { translate } from '../../../../i18n.js'
import { log } from '../utils/logger.js'

const IMG_ID          = 'lz-bg-img'
const TILT_SESSION_KEY = 'lz_tilt_asked'
const MAX_EFFECTIVE_PAN = 200   // px — caps travel on very narrow screens
const ALPHA_MOUSE     = 0.12   // lerp — responsive, removes micro-jitter
const ALPHA_TILT      = 0.06   // lerp — more damping for noisy accelerometer

// ─── Module-level private state ────────────────────────────────────────────

let _rafId              = null
let _imgEl              = null
let _currentX           = 0
let _targetX            = 0
let _effectivePan       = 0
let _alpha              = ALPHA_MOUSE

// Named references required for clean removeEventListener
let _onMouseMove        = null
let _onDeviceOrientation = null
let _onResize           = null

// ─── Geometry ──────────────────────────────────────────────────────────────

/**
 * Computes layout values from the image's natural dimensions and the current
 * viewport. Uses naturalWidth/naturalHeight so no layout flush is required.
 */
function _computeGeometry(img) {
    const displayedWidth = img.naturalWidth * (window.innerHeight / img.naturalHeight)
    const baseLeft       = (window.innerWidth - displayedWidth) / 2
    const panRange       = Math.max(0, (displayedWidth - window.innerWidth) / 2)
    const effectivePan   = Math.min(panRange, MAX_EFFECTIVE_PAN)
    return { baseLeft, effectivePan }
}

// ─── rAF loop ──────────────────────────────────────────────────────────────

function _tick() {
    if (!_imgEl) return

    const next = _currentX + (_targetX - _currentX) * _alpha

    // Skip DOM write when effectively idle — avoids unnecessary compositor work
    if (Math.abs(next - _currentX) >= 0.1) {
        _imgEl.style.transform = `translateX(${next}px)`
    }

    _currentX = next
    _rafId = requestAnimationFrame(_tick)
}

// ─── Tilt (mobile) ─────────────────────────────────────────────────────────

function _bindTilt() {
    _alpha = ALPHA_TILT
    _onDeviceOrientation = e => {
        const gx = Math.max(-30, Math.min(30, e.gamma ?? 0))
        _targetX = -(gx / 30) * _effectivePan
    }
    window.addEventListener('deviceorientation', _onDeviceOrientation)
}

/**
 * On non-iOS mobile, binds tilt immediately. On iOS 13+,
 * DeviceOrientationEvent.requestPermission must be called from a direct user
 * gesture — the event will not fire otherwise. Shows a one-time dismissable
 * button and marks the session so it never re-prompts.
 */
function _maybeRequestTilt() {
    if (sessionStorage.getItem(TILT_SESSION_KEY)) return

    // Non-iOS: no permission API, bind directly
    if (typeof DeviceOrientationEvent === 'undefined' ||
        typeof DeviceOrientationEvent.requestPermission !== 'function') {
        _bindTilt()
        return
    }

    // iOS 13+: show a tap target after a short delay so it doesn't
    // appear before the background has faded in
    setTimeout(() => {
        if (!_imgEl) return  // navigated away during delay

        sessionStorage.setItem(TILT_SESSION_KEY, '1')

        const btn = document.createElement('button')
        btn.id = 'lz-tilt-prompt'
        btn.textContent = translate('✦ Enable tilt parallax', 'vistalyze.parallax.enable_tilt_btn')
        btn.style.cssText = [
            'position:fixed', 'bottom:80px', 'left:50%',
            'transform:translateX(-50%)', 'z-index:9999',
            'padding:8px 18px', 'border-radius:20px',
            'background:rgba(0,0,0,0.65)', 'color:#fff',
            'border:1px solid rgba(255,255,255,0.25)',
            'font-size:0.85em', 'cursor:pointer',
            'backdrop-filter:blur(4px)',
        ].join(';')

        btn.addEventListener('click', async () => {
            btn.remove()
            try {
                const result = await DeviceOrientationEvent.requestPermission()
                if (result === 'granted') _bindTilt()
            } catch (err) {
                log('Parallax', 'Tilt permission request failed:', err)
            }
        })

        document.body.appendChild(btn)
        setTimeout(() => btn.remove(), 8000)  // auto-dismiss
    }, 1500)
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Injects #lz-bg-img into #bg1, waits for load, then starts the rAF loop
 * and binds input listeners. Safe to call while already active — tears down
 * the previous instance first.
 * @param {string} url Relative URL of the background image.
 */
export function attachParallax(url) {
    detachParallax()

    const bg1 = document.getElementById('bg1')
    if (!bg1) return

    const img = document.createElement('img')
    img.id = IMG_ID
    img.style.cssText = [
        'position:absolute', 'height:100%', 'width:auto',
        'top:0', 'pointer-events:none', 'will-change:transform',
    ].join(';')
    bg1.appendChild(img)
    _imgEl = img

    img.onerror = () => {
        log('Parallax', 'Image failed to load, detaching.')
        detachParallax()
    }

    img.onload = () => {
        const { baseLeft, effectivePan } = _computeGeometry(img)
        img.style.left = `${baseLeft}px`
        _effectivePan = effectivePan
        _currentX = 0
        _targetX  = 0
        _alpha    = ALPHA_MOUSE

        _onMouseMove = e => {
            _targetX = -((e.clientX / window.innerWidth) - 0.5) * 2 * _effectivePan
        }
        window.addEventListener('mousemove', _onMouseMove)

        _onResize = () => {
            if (!_imgEl) return
            const { baseLeft: bl, effectivePan: ep } = _computeGeometry(_imgEl)
            _imgEl.style.left = `${bl}px`
            _effectivePan = ep
            _currentX = Math.max(-ep, Math.min(ep, _currentX))
            _targetX  = Math.max(-ep, Math.min(ep, _targetX))
        }
        window.addEventListener('resize', _onResize)

        if ('ontouchstart' in window) {
            _maybeRequestTilt()
        }

        _rafId = requestAnimationFrame(_tick)
    }

    img.src = url
}

/**
 * Removes #lz-bg-img, cancels the rAF loop, and unbinds all event listeners.
 * Safe to call when not active.
 */
export function detachParallax() {
    if (_rafId !== null) {
        cancelAnimationFrame(_rafId)
        _rafId = null
    }

    if (_onMouseMove)         { window.removeEventListener('mousemove',          _onMouseMove);         _onMouseMove = null }
    if (_onDeviceOrientation) { window.removeEventListener('deviceorientation',  _onDeviceOrientation); _onDeviceOrientation = null }
    if (_onResize)            { window.removeEventListener('resize',             _onResize);            _onResize = null }

    const existing = document.getElementById(IMG_ID)
    if (existing) existing.remove()

    _imgEl        = null
    _currentX     = 0
    _targetX      = 0
    _effectivePan = 0
    _alpha        = ALPHA_MOUSE
}