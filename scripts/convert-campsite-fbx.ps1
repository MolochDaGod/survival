$fbx2gltf = 'F:\GitHub\survival\artifacts\arpg-game\node_modules\fbx2gltf\bin\Windows_NT\FBX2glTF.exe'
$base = 'F:\GitHub\survival\artifacts\arpg-game\public\models\campsite'
$outDir = Join-Path $base 'glb'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Convert only the best representative of each category (not every color variant)
$targets = @(
    'campfire\Campfire_LOWPOLY.fbx',
    'campfire\Campfire_Default.fbx',
    'axe\FireAxe.fbx',
    'tents\Tents_Green.fbx',
    'tents\TentScraps_Green.fbx',
    'tarps\Tarps_Green.fbx',
    'sleeping-bags\SleepingBags_Green.fbx',
    'sleeping-bags\DamagedSleepingBags_Green.fbx'
)

$converted = 0
foreach ($rel in $targets) {
    $src = Join-Path $base $rel
    if (-not (Test-Path $src)) {
        Write-Host "SKIP (not found): $rel"
        continue
    }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($rel.Split('\')[-1])
    $dst = Join-Path $outDir "$name.glb"

    Write-Host "Converting: $rel -> glb/$name.glb"
    & $fbx2gltf --binary --input $src --output $dst 2>&1 | Out-Null

    if (Test-Path $dst) {
        $sizeMB = [math]::Round((Get-Item $dst).Length / 1KB, 1)
        Write-Host "  OK ($sizeMB KB)"
        $converted++
    } else {
        # FBX2glTF sometimes appends _out
        $altDst = Join-Path $outDir "${name}_out.glb"
        if (Test-Path $altDst) {
            Move-Item $altDst $dst -Force
            $sizeMB = [math]::Round((Get-Item $dst).Length / 1KB, 1)
            Write-Host "  OK ($sizeMB KB) [renamed from _out]"
            $converted++
        } else {
            Write-Host "  FAILED"
        }
    }
}

Write-Host "`nConverted $converted campsite FBX -> GLB"
Write-Host "`nFinal GLB files:"
Get-ChildItem $outDir -Filter *.glb | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1KB, 1)
    Write-Host "  $($_.Name) ($sizeMB KB)"
}
