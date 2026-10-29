[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$InstallDir = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'kunlun-cli'),
    [switch]$NoPersistPath
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

try {
    if (-not $PackagePath) {
        $release = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
        if ($release.package -notmatch '^kunlun-cli-[0-9A-Za-z.+-]+\.tgz$') { throw 'Invalid release package name.' }
        $PackagePath = Join-Path $PSScriptRoot $release.package
    }
    $archive = (Resolve-Path -LiteralPath $PackagePath).Path
    $checksum = (Get-Content -LiteralPath ($archive + '.sha256') -Raw).Trim().Split(' ')[0]
    if ($checksum -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 checksum file.' }
    $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
    $archiveStream = [IO.File]::OpenRead($archive)
    try { $actualHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($archiveStream)).Replace('-', '') }
    finally { $archiveStream.Dispose(); $hashAlgorithm.Dispose() }
    if ($actualHash -ne $checksum) { throw 'Package checksum mismatch. Installation stopped.' }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeVersion = [version]((& $node --version).TrimStart('v'))
    if ($nodeVersion -lt [version]'22.18.0') { throw 'Node.js 22.18 or later is required.' }
    $target = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\', '/')
    if ($target -match '[;%\r\n]' -or $target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\')) {
        throw 'Choose a dedicated installation folder without PATH separators or environment placeholders.'
    }

    # Use an explicit prefix: do not change the user's npm configuration or CLI credentials.
    & $npm install --global --prefix $target $archive --offline --ignore-scripts --no-audit --no-fund --update-notifier=false --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "npm installation failed (exit $LASTEXITCODE)." }
    $command = Join-Path $target 'kunlun.cmd'
    $versionOutput = & $command --version
    if ($LASTEXITCODE -ne 0) { throw 'Installed command failed its version check.' }
    $installed = $versionOutput | ConvertFrom-Json
    if (-not $installed.ok) { throw 'Installed command returned an invalid version response.' }

    $pathAdded = $false
    if (-not $NoPersistPath) {
        # Read the unexpanded USER value, never copy the process/machine PATH into it.
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
        try {
            $oldPath = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $present = @($oldPath.Split(';') | Where-Object {
                [Environment]::ExpandEnvironmentVariables($_.Trim().Trim('"')).TrimEnd('\', '/') -ieq $target
            }).Count -gt 0
            if (-not $present) {
                $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
                $separator = if ($oldPath.Length -gt 0 -and -not $oldPath.EndsWith(';')) { ';' } else { '' }
                $key.SetValue('Path', ($oldPath + $separator + $target), $kind)
                $pathAdded = $true
            }
        } finally { $key.Dispose() }

        # Notify Explorer so newly launched applications can inherit the updated PATH.
        try {
            if (-not ('KunlunInstaller.EnvironmentBroadcast' -as [type])) {
                Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace KunlunInstaller {
    public static class EnvironmentBroadcast {
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam, string lparam, uint flags, uint timeout, out UIntPtr result);
    }
}
'@
            }
            $broadcastResult = [UIntPtr]::Zero
            [void][KunlunInstaller.EnvironmentBroadcast]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$broadcastResult)
        } catch { Write-Warning 'PATH was saved. Restart your terminal or sign out and back in if applications still use the old environment.' }
    }

    $env:Path = $target + ';' + $env:Path
    $resolvedCommand = (Get-Command kunlun.cmd -CommandType Application -ErrorAction Stop).Source
    if ($resolvedCommand -ine $command) { throw "Unexpected command on PATH: $resolvedCommand" }
    [ordered]@{
        ok = $true
        version = $installed.data.version
        install_dir = $target
        command = $resolvedCommand
        user_path_added = $pathAdded
        path_persisted = (-not $NoPersistPath)
        next = 'Restart CMD and your Agent application, then run: kunlun --version (PowerShell: kunlun.cmd --version).'
    } | ConvertTo-Json
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
