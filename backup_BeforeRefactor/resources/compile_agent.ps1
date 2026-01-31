$CSC = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$WinMdDir = "C:\Windows\System32\WinMetadata"
$RuntimeDll = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll"
$Target = "$PSScriptRoot\MediaAgent.exe"
$Source = "$PSScriptRoot\MediaAgent.cs"

# Gather all WinMDs
$WinMDs = Get-ChildItem $WinMdDir -Filter *.winmd | ForEach-Object { "/r:`"$($_.FullName)`"" }
$Refs = $WinMDs -join " "

$RuntimeFacade = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.dll"
$InteropDll = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll"
# Add System.Runtime and Facades if consistent
$ExtraRefs = "/r:`"$RuntimeDll`" /r:`"$RuntimeFacade`" /r:`"$InteropDll`" /r:System.Core.dll /r:System.dll"

$Cmd = "& `"$CSC`" /nologo /target:exe /out:`"$Target`" $ExtraRefs $Refs `"$Source`""
Write-Host "Compiling..."
Invoke-Expression $Cmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "Compilation Successful: $Target"
} else {
    Write-Host "Compilation Failed!"
}
