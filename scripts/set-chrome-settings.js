const fs = require("fs")
const manifestPath = "./build/manifest.json"

const run = async () => {
  const json = await fs.promises.readFile(manifestPath, "utf-8")
  const manifest = JSON.parse(json)

  // Remove background scripts from the manifest as this is only
  // supported in Firefox. Chrome uses the service worker instead.
  delete manifest.background?.scripts

  // Firefox specific settings must not leak into the Chrome build.
  delete manifest.browser_specific_settings

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}
run()
