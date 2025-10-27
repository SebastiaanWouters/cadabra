#!/usr/bin/env pwsh
# Cadabra installer script for Windows
# Based on Deno's install script (https://github.com/denoland/deno_install)

$ErrorActionPreference = 'Stop'

# Configuration
$GitHubRepo = "SebastiaanWouters/cadabra"
$BinaryName = "cadabra"

# Functions
function Write-Error-Message {
    param([string]$Message)
    Write-Host "Error: $Message" -ForegroundColor Red
    exit 1
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning-Message {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

# Detect architecture
function Get-Architecture {
    $arch = $env:PROCESSOR_ARCHITECTURE

    switch ($arch) {
        "AMD64" { return "windows-x64" }
        "ARM64" { return "windows-arm64" }
        default {
            Write-Error-Message "Unsupported architecture: $arch"
        }
    }
}

# Get latest release version
function Get-LatestVersion {
    Write-Info "Fetching latest release version..."

    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest"
        $version = $response.tag_name

        if (-not $version) {
            Write-Error-Message "Failed to fetch latest version"
        }

        Write-Success "Latest version: $version"
        return $version
    }
    catch {
        Write-Error-Message "Failed to fetch latest version: $_"
    }
}

# Download binary
function Download-Binary {
    param(
        [string]$Version,
        [string]$Platform
    )

    $downloadUrl = "https://github.com/$GitHubRepo/releases/download/$Version/${BinaryName}-${Platform}.exe"
    $checksumUrl = "https://github.com/$GitHubRepo/releases/download/$Version/checksums.txt"

    $tempDir = Join-Path $env:TEMP "cadabra-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    $tempBinary = Join-Path $tempDir "$BinaryName.exe"
    $tempChecksum = Join-Path $tempDir "checksums.txt"

    Write-Info "Downloading $BinaryName $Version for $Platform..."

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempBinary -UseBasicParsing
        Invoke-WebRequest -Uri $checksumUrl -OutFile $tempChecksum -UseBasicParsing

        Write-Success "Downloaded binary"

        return @{
            Binary = $tempBinary
            Checksum = $tempChecksum
            TempDir = $tempDir
        }
    }
    catch {
        Write-Error-Message "Failed to download binary: $_"
    }
}

# Verify checksum
function Verify-Checksum {
    param(
        [string]$BinaryPath,
        [string]$ChecksumPath,
        [string]$Platform
    )

    Write-Info "Verifying checksum..."

    try {
        $checksumContent = Get-Content $ChecksumPath
        $expectedLine = $checksumContent | Where-Object { $_ -match "${BinaryName}-${Platform}" }

        if (-not $expectedLine) {
            Write-Warning-Message "Checksum not found for $Platform. Skipping verification."
            return
        }

        $expectedChecksum = ($expectedLine -split '\s+')[0]

        $actualHash = (Get-FileHash -Path $BinaryPath -Algorithm SHA256).Hash.ToLower()
        $expectedChecksum = $expectedChecksum.ToLower()

        if ($actualHash -ne $expectedChecksum) {
            Write-Error-Message "Checksum verification failed!`nExpected: $expectedChecksum`nActual: $actualHash"
        }

        Write-Success "Checksum verified"
    }
    catch {
        Write-Warning-Message "Checksum verification failed: $_"
    }
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Try to install to system-wide location
function Install-System {
    param([string]$SourcePath)

    $targetDir = "$env:ProgramFiles\Cadabra"
    $targetPath = Join-Path $targetDir "$BinaryName.exe"

    if (-not (Test-Administrator)) {
        return $null
    }

    try {
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        Copy-Item -Path $SourcePath -Destination $targetPath -Force

        # Add to system PATH
        $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        if ($currentPath -notlike "*$targetDir*") {
            [Environment]::SetEnvironmentVariable('Path', "$currentPath;$targetDir", 'Machine')
            Write-Success "Added to system PATH"
        }

        return $targetDir
    }
    catch {
        return $null
    }
}

# Install to user-local location
function Install-User {
    param([string]$SourcePath)

    $targetDir = Join-Path $env:LOCALAPPDATA "Cadabra\bin"
    $targetPath = Join-Path $targetDir "$BinaryName.exe"

    try {
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        Copy-Item -Path $SourcePath -Destination $targetPath -Force

        # Add to user PATH
        $currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if ($currentPath -notlike "*$targetDir*") {
            [Environment]::SetEnvironmentVariable('Path', "$currentPath;$targetDir", 'User')
            Write-Success "Added to user PATH"
            Write-Warning-Message "Restart your terminal for PATH changes to take effect"
        }

        return $targetDir
    }
    catch {
        Write-Error-Message "Failed to install to user directory: $_"
    }
}

# Cleanup temporary files
function Cleanup {
    param([string]$TempDir)

    if ($TempDir -and (Test-Path $TempDir)) {
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Main installation flow
function Main {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║     Cadabra Installer                  ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""

    $platform = Get-Architecture
    Write-Success "Detected platform: $platform"

    $version = Get-LatestVersion
    $download = Download-Binary -Version $version -Platform $platform

    Verify-Checksum -BinaryPath $download.Binary -ChecksumPath $download.Checksum -Platform $platform

    Write-Info "Installing $BinaryName..."

    $installDir = $null

    if (Test-Administrator) {
        Write-Info "Running with administrator privileges, installing system-wide..."
        $installDir = Install-System -SourcePath $download.Binary
    }

    if (-not $installDir) {
        if (Test-Administrator) {
            Write-Warning-Message "System-wide installation failed, falling back to user installation..."
        } else {
            Write-Info "Installing to user directory (run as administrator for system-wide installation)..."
        }
        $installDir = Install-User -SourcePath $download.Binary
    }

    Cleanup -TempDir $download.TempDir

    Write-Success "Installed to $installDir\$BinaryName.exe"

    Write-Host ""
    Write-Success "Cadabra $version installed successfully!"
    Write-Host ""
    Write-Host "Run 'cadabra' to start the server" -ForegroundColor Green
    Write-Host ""
    Write-Host "For help, visit: https://github.com/$GitHubRepo"
    Write-Host ""
}

# Run main function
try {
    Main
}
catch {
    Write-Error-Message "Installation failed: $_"
}
