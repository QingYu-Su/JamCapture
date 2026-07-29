import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent
