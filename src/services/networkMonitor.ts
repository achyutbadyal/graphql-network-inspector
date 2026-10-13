import { chromeProvider } from './chromeProvider'

/**
 * The devtools / webRequest APIs are not guaranteed to exist in every browser
 * context. In particular Firefox does not expose `webRequest` to devtools
 * panels, so every access is feature detected and falls back to a no-op.
 *
 * See `src/services/browserSupport.ts` for the capability helpers.
 */

const emptyHARLog = (): chrome.devtools.network.HARLog => ({
  version: '1.2',
  creator: { name: 'GraphQL Network Inspector', version: '1.0' },
  entries: [],
})

export const getHAR = async (): Promise<chrome.devtools.network.HARLog> => {
  const chrome = chromeProvider()

  if (!chrome.devtools?.network?.getHAR) {
    return emptyHARLog()
  }

  return new Promise((resolve) => {
    chrome.devtools.network.getHAR((harLog) => {
      resolve(harLog)
    })
  })
}

export const onBeforeRequest = (
  cb: (e: chrome.webRequest.WebRequestBodyDetails) => void
) => {
  const chrome = chromeProvider()

  // Not available in Firefox devtools panels - the caller falls back to
  // reading request bodies from the devtools network API instead.
  if (!chrome.webRequest?.onBeforeRequest) {
    return () => {}
  }

  const currentTabId = chrome.devtools.inspectedWindow.tabId

  chrome.webRequest.onBeforeRequest.addListener(
    cb,
    { urls: ['<all_urls>'], tabId: currentTabId },
    ['requestBody']
  )
  return () => {
    chrome.webRequest.onBeforeRequest.removeListener(cb)
  }
}

export const onBeforeSendHeaders = (
  cb: (e: chrome.webRequest.WebRequestHeadersDetails) => void
) => {
  const chrome = chromeProvider()

  // Not available in Firefox devtools panels.
  if (!chrome.webRequest?.onBeforeSendHeaders) {
    return () => {}
  }

  const currentTabId = chrome.devtools.inspectedWindow.tabId

  chrome.webRequest.onBeforeSendHeaders.addListener(
    cb,
    { urls: ['<all_urls>'], tabId: currentTabId },
    ['requestHeaders']
  )
  return () => {
    chrome.webRequest.onBeforeSendHeaders.removeListener(cb)
  }
}

export const onRequestFinished = (
  cb: (e: chrome.devtools.network.Request) => void
) => {
  const chrome = chromeProvider()

  if (!chrome.devtools?.network?.onRequestFinished) {
    return () => {}
  }

  chrome.devtools.network.onRequestFinished.addListener(cb)
  return () => {
    chrome.devtools.network.onRequestFinished.removeListener(cb)
  }
}

export const onNavigate = (cb: () => void) => {
  const chrome = chromeProvider()

  if (!chrome.devtools?.network?.onNavigated) {
    return () => {}
  }

  chrome.devtools.network.onNavigated.addListener(cb)
  return () => {
    chrome.devtools.network.onNavigated.removeListener(cb)
  }
}

// Can I get request body in webrequest event?
// If so, can just match on headers, method, body.
// Just associate first response where match, is found.
