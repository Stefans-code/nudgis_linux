; Installer Windows di Nugis (Inno Setup).
; Compila apps/server/dist-exe/ (Nugis.exe + risorse) in un unico NugisSetup.exe che:
;   - installa i file in Program Files
;   - chiede all'installazione email/password del primo admin ed (opzionalmente) la
;     chiave di licenza, e genera .env da solo (nessuna modifica manuale di file)
;   - genera ADMIN_JWT_SECRET e ENCRYPTION_KEY casuali (mai chiesti all'utente: sono
;     segreti tecnici, non credenziali che il cliente deve scegliere o ricordare)
;   - registra un'attività pianificata di Windows che avvia Nugis.exe all'accensione
;     del PC (come SYSTEM, sessione non interattiva: nessuna finestra console visibile,
;     riparte da sola se il processo termina)
;   - crea collegamenti nel menu Start e un disinstallatore che ripulisce tutto
;
; Richiede Inno Setup 6 (ISCC.exe) per la compilazione. Uso:
;   npm run build:installer -w apps/server
; (vedi scripts/build-installer.js: builda l'exe e poi compila questo script)

#define AppName "Nugis"
#define AppVersion "1.0.0"
#define AppPublisher "Nugis"
#define TaskName "Nugis"

[Setup]
AppId={{8F2B9C0E-6A3E-4E7A-9B7B-2B6B8C9C0A11}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=..\installer-output
OutputBaseFilename=NugisSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Nugis.exe
WizardStyle=modern

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Files]
Source: "..\dist-exe\Nugis.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist-exe\generated\*"; DestDir: "{app}\generated"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist-exe\prisma\*"; DestDir: "{app}\prisma"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist-exe\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist-exe\.env.example"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Apri Nugis (pannello web)"; Filename: "http://localhost:4000"
Name: "{group}\Avvia Nugis manualmente (debug)"; Filename: "{app}\Nugis.exe"; WorkingDir: "{app}"
Name: "{group}\Disinstalla {#AppName}"; Filename: "{uninstallexe}"

[Run]
; Registra l'attività pianificata: avvio all'accensione del PC come SYSTEM, sessione
; non interattiva -> nessuna finestra console, e riparte da sola dopo un crash.
Filename: "{sys}\schtasks.exe"; \
  Parameters: "/Create /F /RU SYSTEM /RL HIGHEST /SC ONSTART /TN ""{#TaskName}"" /TR ""\""{app}\Nugis.exe\"""" "; \
  Flags: runhidden; StatusMsg: "Registrazione avvio automatico..."
; Riavvio automatico dopo un crash: fino a 3 tentativi, ogni minuto.
Filename: "{sys}\schtasks.exe"; \
  Parameters: "/Change /TN ""{#TaskName}"" /RI 1 /DU 0003:00"; \
  Flags: runhidden; StatusMsg: "Configurazione riavvio automatico..."
Filename: "{sys}\schtasks.exe"; \
  Parameters: "/Run /TN ""{#TaskName}"""; \
  Flags: runhidden; StatusMsg: "Avvio di Nugis..."
Filename: "{cmd}"; Parameters: "/c timeout /t 3 >nul & start http://localhost:4000"; \
  Flags: runhidden postinstall skipifsilent; Description: "Apri il pannello Nugis nel browser"

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""{#TaskName}"""; Flags: runhidden; RunOnceId: "StopTask"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""{#TaskName}"""; Flags: runhidden; RunOnceId: "DeleteTask"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Nugis.exe"; Flags: runhidden; RunOnceId: "KillExe"

[Code]
var
  AdminPage: TInputQueryWizardPage;
  LicensePage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  AdminPage := CreateInputQueryPage(wpSelectDir,
    'Account amministratore', 'Crea il primo account (ruolo owner) del pannello Nugis',
    'Queste credenziali servono per accedere al pannello web la prima volta. Potrai crearne altri (owner o chatter) in seguito dal pannello stesso.');
  AdminPage.Add('Email amministratore:', False);
  AdminPage.Add('Password (minimo 8 caratteri):', True);
  AdminPage.Add('Conferma password:', True);

  LicensePage := CreateInputQueryPage(AdminPage.ID,
    'Licenza (opzionale)', 'Attiva la licenza commerciale',
    'Lascia questi campi vuoti per un uso interno/di prova senza restrizioni. Compilali solo se hai ricevuto una chiave di licenza dal fornitore (formato NUGIS-XXXX-XXXX-XXXX-XXXX) e l''indirizzo del server di licenze.');
  LicensePage.Add('Indirizzo server di licenze (es. http://ufficio-ip:5000):', False);
  LicensePage.Add('Chiave di licenza:', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Email, Pwd, PwdConfirm: String;
begin
  Result := True;
  if CurPageID = AdminPage.ID then
  begin
    Email := Trim(AdminPage.Values[0]);
    Pwd := AdminPage.Values[1];
    PwdConfirm := AdminPage.Values[2];

    if (Pos('@', Email) = 0) or (Pos('.', Email) = 0) then
    begin
      MsgBox('Inserisci un indirizzo email valido.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    if Length(Pwd) < 8 then
    begin
      MsgBox('La password deve avere almeno 8 caratteri.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    if Pwd <> PwdConfirm then
    begin
      MsgBox('Le due password non coincidono.', mbError, MB_OK);
      Result := False;
      exit;
    end;
  end;
end;

// Genera un segreto casuale robusto delegando a PowerShell (RNG crittografico), invece
// di un generatore pseudo-casuale Pascal debole: ADMIN_JWT_SECRET/ENCRYPTION_KEY
// proteggono le sessioni admin e le credenziali cifrate sul DB, non vanno indovinabili.
function GenerateSecret(): String;
var
  ResultCode: Integer;
  TempFile: String;
  Lines: TArrayOfString;
  Cmd: String;
begin
  TempFile := ExpandConstant('{tmp}\nugis_secret_' + IntToStr(Random(1000000)) + '.txt');
  Cmd := '-NoProfile -Command "[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)) | Out-File -Encoding ascii -NoNewline ''' + TempFile + '''"';
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) and LoadStringsFromFile(TempFile, Lines) and (GetArrayLength(Lines) > 0) then
  begin
    Result := Lines[0];
  end
  else
  begin
    // Fallback estremo se PowerShell non è disponibile: comunque casuale (timestamp +
    // Random Pascal), meno robusto ma mai un valore fisso/prevedibile.
    Result := IntToStr(Random(MaxInt)) + IntToStr(Random(MaxInt)) + IntToStr(Random(MaxInt)) + IntToStr(Random(MaxInt));
  end;
  if FileExists(TempFile) then
    DeleteFile(TempFile);
end;

function EnvEscape(S: String): String;
begin
  // Le nostre chiavi non contengono virgolette; rimuoviamo comunque eventuali doppi
  // apici digitati per errore, per non rompere il parsing di dotenv. StringChangeEx
  // modifica S per riferimento e ritorna il numero di sostituzioni (Integer), non una
  // stringa: il valore di ritorno va ignorato, il risultato è in S.
  StringChangeEx(S, '"', '', True);
  Result := S;
end;

procedure WriteEnvFile();
var
  DbPath, EnvContent: String;
begin
  DbPath := ExpandConstant('{app}\nugis.db');
  StringChangeEx(DbPath, '\', '/', True);

  EnvContent :=
    '# Generato automaticamente dall''installer Nugis. Modifica solo se sai cosa stai facendo.' + #13#10 +
    'DATABASE_URL="file:' + DbPath + '"' + #13#10 +
    'TELEGRAM_BOT_TOKEN=""' + #13#10 +
    'TELEGRAM_API_ID=""' + #13#10 +
    'TELEGRAM_API_HASH=""' + #13#10 +
    'ENCRYPTION_KEY="' + GenerateSecret() + '"' + #13#10 +
    'LLM_PROVIDER="ollama"' + #13#10 +
    'ANTHROPIC_API_KEY=""' + #13#10 +
    'ANTHROPIC_MODEL="claude-sonnet-5"' + #13#10 +
    'OPENAI_API_KEY=""' + #13#10 +
    'OPENAI_MODEL="gpt-4o-mini"' + #13#10 +
    'DEEPSEEK_API_KEY=""' + #13#10 +
    'ADMIN_JWT_SECRET="' + GenerateSecret() + '"' + #13#10 +
    'ADMIN_DEFAULT_EMAIL="' + EnvEscape(Trim(AdminPage.Values[0])) + '"' + #13#10 +
    'ADMIN_DEFAULT_PASSWORD="' + EnvEscape(AdminPage.Values[1]) + '"' + #13#10 +
    'PORT=4000' + #13#10 +
    'WEB_ORIGIN="http://localhost:4000"' + #13#10 +
    'LICENSE_SERVER_URL="' + EnvEscape(Trim(LicensePage.Values[0])) + '"' + #13#10 +
    'LICENSE_KEY="' + EnvEscape(Trim(LicensePage.Values[1])) + '"' + #13#10;

  SaveStringToFile(ExpandConstant('{app}\.env'), EnvContent, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    WriteEnvFile();
  end;
end;
