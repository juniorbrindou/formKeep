# formKeep — packaging pour les stores.
# Produit dist/formkeep-<version>-chrome.zip et -firefox.zip (manifest.json à la
# racine de chaque archive, comme exigé par les stores).
# Usage : depuis la racine du repo -> pwsh store/package.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$ext  = Join-Path $root "extension"
$dist = Join-Path $root "dist"

$manifestPath = Join-Path $ext "manifest.json"
$ver = (Get-Content $manifestPath -Raw | ConvertFrom-Json).version
Write-Host "Version : $ver"

New-Item -ItemType Directory -Force $dist | Out-Null

# ---- Chrome / Edge (paquet tel quel) ----
$chromeZip = Join-Path $dist "formkeep-$ver-chrome.zip"
if (Test-Path $chromeZip) { Remove-Item $chromeZip }
Compress-Archive -Path (Join-Path $ext "*") -DestinationPath $chromeZip
Write-Host "OK  $chromeZip"

# ---- Firefox (AMO) : background en 'scripts' + id gecko ----
$ffBuild = Join-Path $dist "_ff_build"
if (Test-Path $ffBuild) { Remove-Item $ffBuild -Recurse -Force }
New-Item -ItemType Directory -Force $ffBuild | Out-Null
Copy-Item (Join-Path $ext "*") $ffBuild -Recurse

$m = Get-Content $manifestPath -Raw
# Firefox stable ne supporte pas background.service_worker : on passe en event page.
$m = $m -replace '"service_worker"\s*:\s*"background/service-worker.js"', '"scripts": ["background/service-worker.js"]'
# Identifiant d'extension requis par AMO.
$geckoBlock = '$1' + "`n" + '  "browser_specific_settings": { "gecko": { "id": "formkeep@brindoujunior", "strict_min_version": "115.0" } },'
$m = $m -replace '("version"\s*:\s*"[^"]*"\s*,)', $geckoBlock
Set-Content (Join-Path $ffBuild "manifest.json") $m -NoNewline -Encoding utf8

$ffZip = Join-Path $dist "formkeep-$ver-firefox.zip"
if (Test-Path $ffZip) { Remove-Item $ffZip }
Compress-Archive -Path (Join-Path $ffBuild "*") -DestinationPath $ffZip
Remove-Item $ffBuild -Recurse -Force
Write-Host "OK  $ffZip"

Write-Host "`nTerminé."
