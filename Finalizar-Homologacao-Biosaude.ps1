#Requires -Version 7.2
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Repositorios,
  [string]$Estado = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Biosaude-Homologacao-Preview'),
  [switch]$SomenteVerificar,
  [switch]$Iniciar,
  [switch]$ValidarRedis,
  [string]$PerfilCorporativo
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (($Iniciar -or $ValidarRedis) -and !$PerfilCorporativo) {
  throw 'Informe -PerfilCorporativo com o caminho do arquivo privado do operador.'
}
$node = Get-Command node -CommandType Application -ErrorAction Stop
$argsNode = @((Join-Path $PSScriptRoot 'homologar.mjs'), '--repos', (Resolve-Path -LiteralPath $Repositorios).Path, '--estado', $Estado)
if ($SomenteVerificar) { $argsNode += '--verificar' }
if ($Iniciar) { $argsNode += '--iniciar' }
if ($ValidarRedis) { $argsNode += '--redis' }
if ($PerfilCorporativo) { $argsNode += @('--perfil', (Resolve-Path -LiteralPath $PerfilCorporativo).Path) }
if ($IsWindows -and !$SomenteVerificar) {
  $stateFull = [IO.Path]::GetFullPath($Estado)
  $localPrefix = [IO.Path]::GetFullPath([Environment]::GetFolderPath('LocalApplicationData')).TrimEnd('\') + '\'
  if (!$stateFull.StartsWith($localPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'O estado deve ficar em LocalAppData.' }
  $ancestor = $stateFull
  while ($ancestor) {
    if ((Test-Path -LiteralPath $ancestor) -and
        ((Get-Item -Force -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Diretório de estado com link ou junção.'
    }
    $ancestor = Split-Path -Parent $ancestor
  }
  New-Item -ItemType Directory -Force -Path $stateFull | Out-Null
  $directory = [IO.DirectoryInfo]::new($stateFull)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $ownerAcl = [IO.FileSystemAclExtensions]::GetAccessControl($directory, [Security.AccessControl.AccessControlSections]::Owner)
  if ($ownerAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value) {
    throw 'O diretório de estado precisa pertencer ao operador.'
  }
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($identity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $sid, 'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  # A API do .NET grava apenas as seções marcadas como alteradas. Aqui, somente a DACL.
  [IO.FileSystemAclExtensions]::SetAccessControl($directory, $acl)
}
& $node.Source @argsNode
if ($LASTEXITCODE -ne 0) { throw "Homologação interrompida (código $LASTEXITCODE)." }
