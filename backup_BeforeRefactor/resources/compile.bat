@echo off
cd /d "%~dp0"
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set WINMD_DIR=C:\Windows\System32\WinMetadata
set RUNTIME_DLL=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll

"%CSC%" /nologo /target:exe /out:MediaAgent.exe /r:"%RUNTIME_DLL%" /r:"%WINMD_DIR%\Windows.Media.winmd" /r:"%WINMD_DIR%\Windows.Foundation.winmd" /r:"%WINMD_DIR%\Windows.Storage.winmd" MediaAgent.cs

