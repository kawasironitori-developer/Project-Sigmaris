@echo off
setlocal

REM Build with VS2022 Build Tools (x64 Release)
REM Requires: Desktop development with C++

set ROOT=%~dp0
pushd "%ROOT%"

set MSBUILD="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
if not exist %MSBUILD% (
  echo MSBuild not found: %MSBUILD%
  exit /b 1
)

call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -no_logo -arch=x64
if errorlevel 1 exit /b 1

%MSBUILD% AquesTalkTtsCmd.vcxproj /t:Build /p:Configuration=Release /p:Platform=x64
if errorlevel 1 exit /b 1

popd
echo Done.
