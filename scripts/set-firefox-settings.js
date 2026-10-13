const fs = require('fs')
const manifestPath = './build/manifest.json'

// Firefox ships Manifest V3 support from version 109 onwards.
//
// The floor is raised to 140 because of data_collection_permissions below: AMO
// requires that disclosure on new submissions, and the key was only introduced
// in Firefox 140 (142 on Android). Declaring it against a 109 floor makes
// web-ext warn that the key is ignored on older builds. Raising the floor keeps
// the manifest coherent; the cost is dropping Firefox 109-139, which predates
// 2025. Lower this back to 109 if supporting those older builds matters more
// than a clean AMO submission.
const FIREFOX_STRICT_MIN_VERSION = '140.0'

// Chrome-only permissions that Firefox does not implement. Requesting them
// causes Firefox to flag an unsupported permission, so we drop them. The
// features that depend on them are feature detected at runtime.
const CHROME_ONLY_PERMISSIONS = ['debugger']

// AMO ties an add-on id to the account that first submitted it, so signing a
// fork with your own API key needs your own id. Set FIREFOX_ADDON_ID in .env.
const FIREFOX_ADDON_ID =
  process.env.FIREFOX_ADDON_ID || 'graphql-network-inspector@achyutbadyal'

const run = async () => {
  const json = await fs.promises.readFile(manifestPath, 'utf-8')
  const manifest = JSON.parse(json)

  // Firefox does not support Manifest V3 service workers. Background scripts
  // (event pages) are used instead and declared via `background.scripts`.
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
  const backgroundScripts = manifest.background?.scripts ?? ['background.js']
  delete manifest.background?.service_worker
  manifest.background = { scripts: backgroundScripts }

  // Remove permissions Firefox does not understand.
  if (Array.isArray(manifest.permissions)) {
    manifest.permissions = manifest.permissions.filter(
      (permission) => !CHROME_ONLY_PERMISSIONS.includes(permission)
    )
  }

  // Firefox requires a stable add-on id for Manifest V3 extensions.
  //
  // data_collection_permissions is a mandatory disclosure for AMO submissions.
  // "none" asserts that nothing is transmitted off-device. VERIFY THIS BEFORE
  // SIGNING: if the extension ever sends captured network data anywhere, this
  // must list the real categories instead of "none". See
  // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
  manifest.browser_specific_settings = {
    gecko: {
      id: FIREFOX_ADDON_ID,
      strict_min_version: FIREFOX_STRICT_MIN_VERSION,
      data_collection_permissions: {
        required: ['none'],
      },
    },
  }

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}

run()
