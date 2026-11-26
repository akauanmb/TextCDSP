; Personalizações do instalador NSIS do TextCDSP (package.json > build > nsis > include).
;
; O instalador é por usuário e não pede administrador. Os dados do usuário ficam em
; %APPDATA%\TextCDSP (config, motor em uso, atalhos pessoais e logs) e NÃO são apagados na
; desinstalação: é lá que está o pessoal.yml. Por isso este arquivo não apaga nada dessa pasta,
; e "deleteAppDataOnUninstall" está desligado no package.json.

; Roda antes de os arquivos do programa serem removidos (na desinstalação e também quando uma
; versão nova é instalada por cima, que desinstala a antiga primeiro).
!macro customUnInstall
  ; 1) Fecha o TextCDSP se ainda estiver aberto. Se ficasse aberto, ele reiniciaria o motor.
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 500

  ; 2) Para o motor do TextCDSP: só o que roda de %APPDATA%\TextCDSP\engine. Nunca mexe em outro
  ;    Espanso instalado pelo usuário (por isso não se usa "taskkill /IM espansod.exe").
  ${If} ${FileExists} "$APPDATA\TextCDSP\engine\espanso-portable\espansod.exe"
    nsExec::Exec `"$APPDATA\TextCDSP\engine\espanso-portable\espansod.exe" service stop`
    Pop $0
  ${EndIf}

  ; 3) Rede de segurança: encerra o que ainda sobrar de espansod.exe dentro dessa mesma pasta.
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'espansod.exe' -and $$_.ExecutablePath -like '$APPDATA\TextCDSP\engine\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
  Pop $0
  Sleep 500

  ; 4) Tira o início automático com o Windows (o app grava esta entrada). Numa atualização, o
  ;    app novo a grava de novo ao abrir, então só se remove na desinstalação de verdade.
  ${IfNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TextCDSP"
  ${EndIf}
!macroend
