<#
.SYNOPSIS
    Lets RDP entries in CMS-PPA Credentials Management open Remote Desktop Connection directly.

.DESCRIPTION
    Registers a cms-ppa-rdp:// link handler for the current Windows user only. No administrator rights are needed.
    Clicking an RDP entry then opens Remote Desktop Connection (mstsc) for that host, with the username filled in.
    Links never contain passwords; Remote Desktop asks for the password when it connects.

    Only links shaped like cms-ppa-rdp://host, cms-ppa-rdp://host:port, or cms-ppa-rdp://user@host:port are accepted.
    Anything else is refused, so a link can't be used to run other commands.

.PARAMETER Uninstall
    Removes the handler and the helper script.

.PARAMETER Force
    Replaces a cms-ppa-rdp:// handler that another app already registered.

.EXAMPLE
    Right-click this file and choose "Run with PowerShell".

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-rdp-link-handler.ps1 -Uninstall
#>
param(
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$installDirectory = Join-Path $env:LOCALAPPDATA 'CmsPpa'
$handlerPath = Join-Path $installDirectory 'rdp-link-handler.ps1'
$connectionDirectory = Join-Path $installDirectory 'rdp'
$protocolKey = 'HKCU:\Software\Classes\cms-ppa-rdp'
$marker = 'CMS-PPA RDP link handler'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Complete([string]$Message, [int]$ExitCode = 0) {
    Write-Host ''
    Write-Host $Message
    if (-not [Console]::IsInputRedirected) {
        [void](Read-Host 'Press Enter to close')
    }
    exit $ExitCode
}

function Test-OwnHandler {
    $properties = Get-ItemProperty -Path $protocolKey -ErrorAction SilentlyContinue
    return $null -ne $properties -and $properties.CmsPpaHandler -eq $marker
}

if ($Uninstall) {
    if (Test-OwnHandler) {
        Remove-Item -Path $protocolKey -Recurse -Force
    }
    if (Test-Path $handlerPath) {
        Remove-Item -Path $handlerPath -Force
    }
    if (Test-Path $connectionDirectory) {
        Remove-Item -Path $connectionDirectory -Recurse -Force
    }
    Complete 'Removed. RDP entries in Credentials Management will copy the host instead of opening Remote Desktop.'
}

$existingCommand = (Get-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\cms-ppa-rdp\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
if ($existingCommand -and -not (Test-OwnHandler) -and -not $Force) {
    Complete "Another app already opens cms-ppa-rdp:// links on this computer:`n  $existingCommand`nRun this script again with -Force to replace it for your account." 1
}

$handler = @'
# CMS-PPA RDP link handler. Installed by install-rdp-link-handler.ps1.
# Opens Remote Desktop Connection for links shaped like cms-ppa-rdp://host, cms-ppa-rdp://host:port, or cms-ppa-rdp://user@host:port.
# The username is percent-encoded in the link, so DOMAIN\user becomes DOMAIN%5Cuser.
param([string]$Link)

function Stop-WithWarning([string]$Message) {
    Add-Type -AssemblyName PresentationFramework
    [void][System.Windows.MessageBox]::Show($Message, 'CMS-PPA RDP link', 'OK', 'Warning')
    exit 1
}

$pattern = '^cms-ppa-rdp://(?:(?<user>[^@/?#\s]{1,300})@)?(?<host>[A-Za-z0-9][A-Za-z0-9.-]{0,252})(?::(?<port>[0-9]{1,5}))?/?\z'
if ($Link -notmatch $pattern) {
    Stop-WithWarning "This Remote Desktop link can't be opened:`n$Link"
}
$rdpHost = $Matches['host']
$port = $Matches['port']
$encodedUser = $Matches['user']

if ($port -and ([int]$port -lt 1 -or [int]$port -gt 65535)) {
    Stop-WithWarning "This Remote Desktop link can't be opened:`n$Link"
}

$username = ''
if ($encodedUser) {
    try {
        $username = [Uri]::UnescapeDataString($encodedUser)
    } catch {
        $username = ''
    }
    if ($username -notmatch '^[^\x00-\x1f\x7f]{1,100}\z') {
        Stop-WithWarning "This Remote Desktop link can't be opened:`n$Link"
    }
}

$address = if ($port) { "${rdpHost}:$port" } else { $rdpHost }

# Launch with /v, not an .rdp file: Windows shows an "Unknown publisher" warning every time an unsigned .rdp file opens.
# mstsc has no username switch, so the sign-in prompt is pre-filled from its per-host username hint instead.
if ($username) {
    $serverKey = "HKCU:\Software\Microsoft\Terminal Server Client\Servers\$address"
    if (-not (Test-Path -LiteralPath $serverKey)) {
        New-Item -Path $serverKey -Force | Out-Null
    }
    Set-ItemProperty -LiteralPath $serverKey -Name 'UsernameHint' -Value $username
}

Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\mstsc.exe') -ArgumentList "/v:$address", '/f'
'@

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Set-Content -Path $handlerPath -Value $handler -Encoding UTF8
if (Test-Path $connectionDirectory) {
    Remove-Item -Path $connectionDirectory -Recurse -Force
}

$commandKey = Join-Path $protocolKey 'shell\open\command'
New-Item -Path $commandKey -Force | Out-Null
Set-ItemProperty -Path $protocolKey -Name '(default)' -Value 'URL:CMS-PPA Remote Desktop link'
Set-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path $protocolKey -Name 'CmsPpaHandler' -Value $marker
Set-ItemProperty -Path $commandKey -Name '(default)' -Value "`"$powershellPath`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$handlerPath`" `"%1`""

Complete 'Done. In Credentials Management, open "Set up one-click RDP" and turn on the switch. Then click any RDP entry.'
