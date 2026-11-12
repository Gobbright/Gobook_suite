# Run from backend with: npm run package:upload
# Creates ../backend-upload.zip without touching the running MongoDB database.
# Configure environment variables on the server and run npm ci after extracting.
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$backendPath = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$projectPath = Split-Path -Parent $backendPath
$outputPath = Join-Path $projectPath 'backend-upload.zip'
$temporaryPath = Join-Path $projectPath ('.backend-upload-' + [guid]::NewGuid().ToString('N') + '.zip')
$excludedDirectories = @('runtime', 'node_modules', '.git', '.aws', '.codex', '.agents', 'coverage')

function Add-BackendDirectory {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$Directory
    )

    # Filter directories BEFORE recursion: locked database files are never opened.
    foreach ($item in (Get-ChildItem -LiteralPath $Directory -Force)) {
        if ($item.PSIsContainer -and $item.Name -in $excludedDirectories) { continue }
        if ($item.LinkType -in @('SymbolicLink', 'Junction')) {
            throw "Cannot package a linked item outside the source tree: $($item.FullName)"
        }
        if ($item.PSIsContainer) {
            Add-BackendDirectory -Archive $Archive -Directory $item.FullName
            continue
        }
        if (($item.Name -eq '.env' -or $item.Name -like '.env.*') -and $item.Name -ne '.env.example') { continue }
        if ($item.Extension -in @('.zip', '.log', '.wt', '.lock')) { continue }

        $entryName = $item.FullName.Substring($backendPath.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $Archive, $item.FullName, $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}

try {
    $archive = [System.IO.Compression.ZipFile]::Open($temporaryPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        Add-BackendDirectory -Archive $archive -Directory $backendPath
    } finally {
        $archive.Dispose()
    }

    # Replace the previous upload only after the new archive finishes successfully.
    Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
    Write-Host "Upload ZIP ready: $outputPath"
    Write-Host 'Excluded: runtime/database files, node_modules, environment secrets, logs and existing ZIPs.'
    Write-Host 'On the server: configure environment variables, run npm ci, then npm run start:production.'
} finally {
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}
