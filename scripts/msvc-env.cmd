@echo off
rem Called inside a disposable cmd.exe; configure SDK and C++ without vcpkg shell hooks.
if "%~1"=="" exit /b 2
set "VSCMD_DEBUG="
call "%~1\Common7\Tools\VsDevCmd.bat" -no_logo -no_ext -arch=x64 -host_arch=x64 -startdir=none >nul
if errorlevel 1 exit /b 1
call "%~1\Common7\Tools\vsdevcmd\ext\vcvars.bat" >nul
if errorlevel 1 exit /b 1
rem VsDevCmd finalizes INCLUDE before the explicit C++ extension, so prepend its headers here.
set "INCLUDE=%__VSCMD_VCVARS_INCLUDE%%INCLUDE%"
set "EXTERNAL_INCLUDE=%__VSCMD_VCVARS_INCLUDE%%EXTERNAL_INCLUDE%"
set "__VSCMD_VCVARS_INCLUDE="
call "%~1\Common7\Tools\vsdevcmd\ext\cmake.bat" >nul
if errorlevel 1 exit /b 1
exit /b 0
