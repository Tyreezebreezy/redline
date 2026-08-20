!macro NSIS_HOOK_PREINSTALL
  ${If} ${Silent}
    ReadRegStr $R9 SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${If} $R9 != ""
      nsis_tauri_utils::SemverCompare "${VERSION}" $R9
      Pop $R9
      ${If} $R9 = -1
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    Sleep 500
    RmDir /r /REBOOTOK "$APPDATA\${BUNDLEID}"
    RmDir /r /REBOOTOK "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
