const fs = require("fs")
const manifestPath = "./build/manifest.json"

// Firefox ships Manifest V3 support from version 109 onwards.
const FIREFOX_STRICT_MIN_VERSION = "109.0"

// Chrome-only permissions that Firefox does not implement. Requesting them
// causes Firefox to flag an unsupported permission, so we drop them. The
// features that depend on them are feature detected at runtime.
const CHROME_ONLY_PERMISSIONS = ["debugger"]

const run = async () => {
  const json = await fs.promises.readFile(manifestPath, "utf-8")
  const manifest = JSON.parse(json)

  // Firefox does not support Manifest V3 service workers. Background scripts
  // (event pages) are used instead and declared via `background.scripts`.
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
  const backgroundScripts = manifest.background?.scripts ?? ["background.js"]
  delete manifest.background?.service_worker
  manifest.background = { scripts: backgroundScripts }

  // Remove permissions Firefox does not understand.
  if (Array.isArray(manifest.permissions)) {
    manifest.permissions = manifest.permissions.filter(
      (permission) => !CHROME_ONLY_PERMISSIONS.includes(permission)
    )
  }

  // Firefox requires a stable add-on id for Manifest V3 extensions.
  manifest.browser_specific_settings = {
    gecko: {
      id: "warrenjday@graphqlnetworkinspector.com",
      strict_min_version: FIREFOX_STRICT_MIN_VERSION,
    },
  }

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}

run()
