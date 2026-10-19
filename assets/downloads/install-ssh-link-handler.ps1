<#
.SYNOPSIS
    Lets SSH entries in CMS-PPA Credentials Management open PowerShell and start an SSH session.

.DESCRIPTION
    Registers an ssh:// link handler for the current Windows user only. No administrator rights are needed.
    Clicking an SSH entry then opens PowerShell and runs "ssh user@host". Links never contain passwords;
    ssh asks for the password in the PowerShell window.

    Only links shaped like ssh://user@host or ssh://user@host:port are accepted. Anything else is refused,
    so a link can't be used to run other commands.

.PARAMETER Uninstall
    Removes the handler and the helper script.

.PARAMETER Force
    Replaces an ssh:// handler that another app already registered.

.EXAMPLE
    Right-click this file and choose "Run with PowerShell".

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-ssh-link-handler.ps1 -Uninstall
#>
param(
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$installDirectory = Join-Path $env:LOCALAPPDATA 'CmsPpa'
$handlerPath = Join-Path $installDirectory 'ssh-link-handler.ps1'
$protocolKey = 'HKCU:\Software\Classes\ssh'
$marker = 'CMS-PPA SSH link handler'
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
    Complete 'Removed. SSH entries in Credentials Management will copy the ssh command instead of opening PowerShell.'
}

$existingCommand = (Get-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\ssh\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
if ($existingCommand -and -not (Test-OwnHandler) -and -not $Force) {
    Complete "Another app already opens ssh:// links on this computer:`n  $existingCommand`nRun this script again with -Force to replace it for your account." 1
}

$handler = @'
# CMS-PPA SSH link handler. Installed by install-ssh-link-handler.ps1.
# Opens PowerShell and runs ssh for links shaped like ssh://user@host or ssh://user@host:port.
param([string]$Link)

$pattern = '^ssh://(?:(?<user>[A-Za-z0-9][A-Za-z0-9._-]{0,63})@)?(?<host>[A-Za-z0-9][A-Za-z0-9.-]{0,252})(?::(?<port>[0-9]{1,5}))?/?\z'
$isValid = $Link -match $pattern
if ($isValid -and $Matches['port']) {
    $isValid = [int]$Matches['port'] -ge 1 -and [int]$Matches['port'] -le 65535
}

if (-not $isValid) {
    Add-Type -AssemblyName PresentationFramework
    [void][System.Windows.MessageBox]::Show("This SSH link can't be opened:`n$Link", 'CMS-PPA SSH link', 'OK', 'Warning')
    exit 1
}

$target = if ($Matches['user']) { "$($Matches['user'])@$($Matches['host'])" } else { $Matches['host'] }
$portOption = if ($Matches['port']) { "-p $($Matches['port']) " } else { '' }
$session = "`$Host.UI.RawUI.WindowTitle = 'SSH $target'; ssh $portOption$target"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($session))
Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList '-NoExit', '-EncodedCommand', $encoded
'@

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Set-Content -Path $handlerPath -Value $handler -Encoding UTF8

$commandKey = Join-Path $protocolKey 'shell\open\command'
New-Item -Path $commandKey -Force | Out-Null
Set-ItemProperty -Path $protocolKey -Name '(default)' -Value 'URL:SSH link'
Set-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path $protocolKey -Name 'CmsPpaHandler' -Value $marker
Set-ItemProperty -Path $commandKey -Name '(default)' -Value "`"$powershellPath`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$handlerPath`" `"%1`""

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
    Write-Warning 'The OpenSSH Client is not installed. Add it in Settings > System > Optional features > OpenSSH Client.'
}

Complete 'Done. In Credentials Management, open "Set up one-click SSH" and turn on the switch. Then click any SSH entry.'
