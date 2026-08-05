import '@testing-library/jest-dom'

try {
  window.localStorage
} catch {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: (() => {
      const values = new Map()
      return {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: (key) => values.delete(String(key)),
        clear: () => values.clear(),
      }
    })(),
  })
}

if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: (() => {
      const values = new Map()
      return {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: (key) => values.delete(String(key)),
        clear: () => values.clear(),
      }
    })(),
  })
}

// jsdom doesn't implement scrollIntoView
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
