!macro customUnInstall
  ; Kill any running Vault processes before uninstalling so files aren't locked
  nsExec::ExecToLog 'taskkill /F /IM "Vault.exe" /T'
  Sleep 1000
!macroend
