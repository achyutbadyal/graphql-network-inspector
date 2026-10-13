import { chromeProvider } from "./chromeProvider"

export type SupportedBrowser = "chrome" | "firefox" | "unknown"

interface BrowserGlobal {
  browser?: { runtime?: unknown }
}

/**
 * Firefox (and Safari) expose a promise based `browser` namespace in addition
 * to the callback based `chrome` alias that Chrome also provides. Detecting
 * `browser.runtime` is the most reliable way to identify Firefox without
 * relying on a spoofable user agent string.
 */
export const isFirefox = (): boolean => {
  const global = globalThis as BrowserGlobal
  return typeof global.browser !== "undefined" && Boolean(global.browser?.runtime)
}

/**
 * Which browser the extension is currently running in.
 *
 * Note: both Chrome and Firefox expose a callback based `chrome` namespace, so
 * the majority of the extension code can stay browser agnostic. Only APIs that
 * are genuinely Chrome specific need to be feature detected.
 */
export const getSupportedBrowser = (): SupportedBrowser => {
  if (isFirefox()) return "firefox"
  if (typeof chrome !== "undefined" && Boolean(chrome?.runtime)) return "chrome"
  return "unknown"
}

/**
 * The `chrome.debugger` API is backed by the Chrome DevTools Protocol and is
 * not implemented by Firefox. Features that depend on it, such as WebSocket
 * and SSE subscription monitoring, must be feature detected before use so the
 * extension degrades gracefully instead of throwing.
 *
 * Resolved through `chromeProvider` so the same mock used in tests (which
 * provides a `debugger` stub) keeps working.
 */
export const hasDebuggerSupport = (): boolean =>
  Boolean(chromeProvider()?.debugger?.attach)
