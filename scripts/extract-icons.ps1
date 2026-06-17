Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = 'C:\Users\nugye\Documents\craftpix-net-960481-genetics-pixel-art-icon-32x32-pack.zip'
$SurvivalRoot = if ($env:GRUDGE_REPOS_ROOT) { Join-Path $env:GRUDGE_REPOS_ROOT 'survival' } else { 'D:\GrudgeRepos\survival' }
$destDir = Join-Path $SurvivalRoot 'artifacts\arpg-game\public\icons\genetics'

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)

foreach ($entry in $zip.Entries) {
    if ($entry.FullName -match '\.png$') {
        $destPath = Join-Path $destDir $entry.Name
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
        Write-Host "Extracted: $($entry.Name)"
    }
}

$zip.Dispose()
Write-Host "Done! Extracted to $destDir"
