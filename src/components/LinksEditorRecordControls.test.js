/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LinksEditorRecordControls from './LinksEditorRecordControls'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const icons = {
    recordcircle: 'mic',
    stopsmall: 'stop',
    waiting: 'wait',
}

describe('LinksEditorRecordControls', function() {
    let container
    let root

    beforeEach(function() {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(function() {
        act(function() { root.unmount() })
        container.remove()
    })

    test('shows the record button when idle', function() {
        const onRecord = jest.fn()
        act(function() {
            root.render(React.createElement(LinksEditorRecordControls, {
                icons: icons,
                onRecord: onRecord,
            }))
        })
        const button = container.querySelector('[data-testid="links-editor-record-button"]')
        expect(button).toBeTruthy()
        expect(button.getAttribute('aria-label')).toBe('Record')
        expect(button.textContent).toMatch(/mic/)
        expect(button.textContent).toMatch(/Record/)
        expect(button.querySelector('.is-waiting')).toBeNull()

        act(function() {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        expect(onRecord).toHaveBeenCalled()
    })

    test('shows stop and duration while recording', function() {
        const onStop = jest.fn()
        act(function() {
            root.render(React.createElement(LinksEditorRecordControls, {
                icons: icons,
                isRecording: true,
                recordingDuration: 4,
                onStop: onStop,
            }))
        })
        expect(container.querySelector('[data-testid="links-editor-record-button"]')).toBeNull()
        const stop = container.querySelector('[data-testid="links-editor-stop-recording"]')
        expect(stop).toBeTruthy()
        expect(stop.getAttribute('aria-label')).toBe('Stop recording')
        expect(container.textContent).toMatch(/5s/)

        act(function() {
            stop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        expect(onStop).toHaveBeenCalled()
    })

    test('shows a waiting icon while the recording is being saved', function() {
        const onRecord = jest.fn()
        act(function() {
            root.render(React.createElement(LinksEditorRecordControls, {
                icons: icons,
                isSaving: true,
                isRecording: true,
                onRecord: onRecord,
            }))
        })
        const button = container.querySelector('[data-testid="links-editor-record-button"]')
        expect(button).toBeTruthy()
        expect(button.getAttribute('aria-label')).toBe('Saving recording')
        expect(button.getAttribute('aria-busy')).toBe('true')
        expect(button.disabled).toBe(true)
        expect(button.querySelector('.links-editor-toolbar-btn-icon.is-waiting')).toBeTruthy()
        expect(button.textContent).toMatch(/wait/)
        expect(button.textContent).toMatch(/Saving/)
        expect(container.querySelector('[data-testid="links-editor-stop-recording"]')).toBeNull()

        act(function() {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        expect(onRecord).not.toHaveBeenCalled()
    })
})
