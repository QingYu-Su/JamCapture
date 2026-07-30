import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
