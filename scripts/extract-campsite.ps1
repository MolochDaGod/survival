Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = 'C:\Users\nugye\Documents\CampsiteEnvironment_3Dexter_V1.1.zip'
$destBase = 'F:\GitHub\survival\artifacts\arpg-game\public\models\campsite'

# Create directories
$dirs = @('campfire', 'tents', 'tarps', 'sleeping-bags', 'axe', 'logs', 'textures')
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $destBase $d) | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$count = 0

foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    if ($entry.Length -eq 0) { continue } # skip directories

    $destPath = $null

    # Campfire meshes + textures
    if ($name -match 'Campfire.*\.(fbx|obj)$') {
        $destPath = Join-Path $destBase "campfire\$($entry.Name)"
    }
    elseif ($name -match 'Texture/Campfire.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }
    # Axe
    elseif ($name -match 'Axe.*\.fbx$') {
        $destPath = Join-Path $destBase "axe\$($entry.Name)"
    }
    elseif ($name -match 'Texture/Axe.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }
    # Tents (only small/medium FBX, skip huge damaged ones >10MB)
    elseif ($name -match 'Tents.*\.fbx$' -and $entry.Length -lt 10000000) {
        $destPath = Join-Path $destBase "tents\$($entry.Name)"
    }
    elseif ($name -match 'Texture/Tents.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }
    # Tarps (only small FBX)
    elseif ($name -match 'Tarps.*\.fbx$' -and $entry.Length -lt 5000000) {
        $destPath = Join-Path $destBase "tarps\$($entry.Name)"
    }
    elseif ($name -match 'Texture/Tarp.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }
    # Sleeping bags
    elseif ($name -match 'SleepingBag.*\.fbx$') {
        $destPath = Join-Path $destBase "sleeping-bags\$($entry.Name)"
    }
    elseif ($name -match 'Texture/SleepingBag.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }
    # Logs
    elseif ($name -match 'Log.*\.(fbx|obj)$' -and $name -notmatch 'Texture') {
        $destPath = Join-Path $destBase "logs\$($entry.Name)"
    }
    elseif ($name -match 'Texture/Log.*\.(png|jpg)$') {
        $destPath = Join-Path $destBase "textures\$($entry.Name)"
    }

    if ($destPath) {
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
        $count++
    }
}

$zip.Dispose()
Write-Host "Extracted $count campsite assets to $destBase"

# List what we got
Get-ChildItem -Recurse $destBase | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $rel = $_.FullName.Replace($destBase, '').TrimStart('\')
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $rel ($sizeMB MB)"
}
