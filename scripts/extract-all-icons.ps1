Add-Type -AssemblyName System.IO.Compression.FileSystem

$SurvivalRoot = if ($env:GRUDGE_REPOS_ROOT) { Join-Path $env:GRUDGE_REPOS_ROOT 'survival' } else { 'D:\GrudgeRepos\survival' }
$baseDir = Join-Path $SurvivalRoot 'artifacts\arpg-game\public\icons'

$packs = @(
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-net-501950-street-food-for-cyberpunk-pixel-art-32x32-icons.zip'; Dir = 'cyberpunk-food' },
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-net-791436-cyberpunk-weapons-and-ammo-pixel-art-32x32-icon-pack.zip'; Dir = 'cyberpunk-weapons' },
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-net-415479-artifact-32x32-icons-pixel-art-for-cyberpunk.zip'; Dir = 'cyberpunk-artifacts' },
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-net-681784-free-sci-fi-items-icons-weapons.zip'; Dir = 'scifi-items' },
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-402486-free-different-sci-fi-item-icons.zip'; Dir = 'scifi-misc' },
    @{ Zip = 'C:\Users\nugye\Documents\craftpix-608609-rpg-gui.zip'; Dir = 'rpg-gui' }
)

foreach ($pack in $packs) {
    $destDir = Join-Path $baseDir $pack.Dir
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null

    if (-not (Test-Path $pack.Zip)) {
        Write-Host "SKIP (not found): $($pack.Zip)"
        continue
    }

    $zip = [System.IO.Compression.ZipFile]::OpenRead($pack.Zip)
    $count = 0
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '\.(png|jpg|jpeg)$' -and $entry.Length -gt 0) {
            # Flatten directory structure - just use filename
            $destPath = Join-Path $destDir $entry.Name
            # Handle duplicate names by prefixing folder
            if (Test-Path $destPath) {
                $folder = ($entry.FullName -replace '[/\\][^/\\]+$','') -replace '[/\\]','_'
                $destPath = Join-Path $destDir "$folder`_$($entry.Name)"
            }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
            $count++
        }
    }
    $zip.Dispose()
    Write-Host "Extracted $count files to $($pack.Dir)"
}

Write-Host "`nDone! All packs extracted."
