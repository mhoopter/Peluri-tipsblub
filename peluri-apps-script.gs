// ════════════════════════════════════════════════════════════════
//  PELURI TIPSKLUB — Google Apps Script Backend
//  Opret på: https://script.google.com → Nyt projekt
//  Deploy: Implementér → Ny implementering → Web app
//          - Kør som: Mig
//          - Adgang: Alle
// ════════════════════════════════════════════════════════════════

const SHEET_ID       = '1wTUtLvmatwqW4rMD3hKoVEBTkLtTtWor';
const SHEET_STILLING = 'Aktuel Saeson 2025-26';
const SHEET_TOKENS   = 'Push Tokens';   // oprettes automatisk

// Rotationsorden 2025/26 — starter 25. august 2025
const SEASON_START = new Date('2025-08-25');
const ROTATION = [
  'Ruhi Erdogan',
  'Alexander Hansen',
  'Frederick Larsen',
  'Martin Hojgaard',
  'Lars Gonzalez',
  'Sebastian Seecoomar'
];

// Rækkerne i sheetet (B2:B7 → row index 2-7)
const MEMBER_ROWS = {
  'Ruhi Erdogan':      2,
  'Alexander Hansen':  3,
  'Frederick Larsen':  4,
  'Martin Hojgaard':   5,
  'Lars Gonzalez':     6,
  'Sebastian Seecoomar': 7
};

// PINs — ændr disse! Gem hemmeligt.
const PINS = {
  'Ruhi Erdogan':      '1234',
  'Alexander Hansen':  '2345',
  'Frederick Larsen':  '3456',
  'Martin Hojgaard':   '4567',
  'Lars Gonzalez':     '5678',
  'Sebastian Seecoomar': '6789'
};

// Firebase Web API Key (til FCM v1 via REST)
const FIREBASE_PROJECT_ID     = 'peluri-e6e7c';
const SA_CLIENT_EMAIL         = PropertiesService.getScriptProperties().getProperty('SA_CLIENT_EMAIL');
const SA_PRIVATE_KEY          = PropertiesService.getScriptProperties().getProperty('SA_PRIVATE_KEY');

// ── CORS helper ──────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router ───────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;
    if (action === 'login')     return handleLogin(data);
    if (action === 'saveToken') return handleSaveToken(data);
    if (action === 'report')    return handleReport(data);
    if (action === 'sendPush')  return handleSendPush(data);
    return jsonResponse({ ok: false, error: 'Ukendt action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doGet(e) {
  const action = e.parameter.action || '';
  if (action === 'week') return jsonResponse(getCurrentWeek());
  return jsonResponse({ ok: false, error: 'Ukendt action' });
}

// ── Login (ingen PIN — åben adgang med navn) ─────────────────────
function handleLogin(data) {
  const { name } = data;
  if (!MEMBER_ROWS[name]) return jsonResponse({ ok: false, error: 'Ukendt navn' });
  return jsonResponse({ ok: true, name });
}

// ── Gem FCM token ────────────────────────────────────────────────
function handleSaveToken(data) {
  const { name, token } = data;
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_TOKENS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TOKENS);
    sheet.appendRow(['Navn', 'Token', 'Opdateret']);
  }

  const values = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[token, new Date()]]);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow([name, token, new Date()]);

  return jsonResponse({ ok: true });
}

// ── Indberetning → skriv til sheet ───────────────────────────────
function handleReport(data) {
  const { name, amount } = data;
  if (!MEMBER_ROWS[name]) return jsonResponse({ ok: false, error: 'Ukendt spiller' });

  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_STILLING);
  const row   = MEMBER_ROWS[name];

  // Gevinst: C[row] += amount
  const existingGevinst = sheet.getRange(row, 3).getValue() || 0;
  sheet.getRange(row, 3).setValue(Number(existingGevinst) + Number(amount));

  // Antal Spil: G[row] += 1
  const existingSpil = sheet.getRange(row, 7).getValue() || 0;
  sheet.getRange(row, 7).setValue(Number(existingSpil) + 1);

  return jsonResponse({ ok: true });
}

// ── Manuel push til specifikt medlem ─────────────────────────────
function handleSendPush(data) {
  const { name } = data;
  const token = getTokenForMember(name);
  if (!token) return jsonResponse({ ok: false, error: 'Ingen token for ' + name });

  const title = '🎯 Peluri — Det er din uge!';
  const body  = `Hej ${name.split(' ')[0]}! Indberét dit spilresultat for denne uge.`;
  sendFcmPush(token, title, body);

  return jsonResponse({ ok: true });
}

// ── Automatisk mandag kl. 10 (sæt som time-based trigger) ────────
function sendMondayPush() {
  const player = getCurrentWeek().player;
  if (!player) return;

  const token = getTokenForMember(player);
  if (!token) { Logger.log('Ingen token for: ' + player); return; }

  const title = '🎯 Peluri — Det er din uge!';
  const body  = `Hej ${player.split(' ')[0]}! Det er din uge. Gå ind i appen og indberét dit resultat.`;
  sendFcmPush(token, title, body);
  Logger.log('Push sendt til: ' + player);
}

// ── Uge-helper ────────────────────────────────────────────────────
function getCurrentWeek() {
  const now   = new Date();
  const ms    = now - SEASON_START;
  if (ms < 0) return { player: null, week: 0 };
  const week  = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
  return { player: ROTATION[week % ROTATION.length], week: week + 1 };
}

// ── Hent token for et medlem ─────────────────────────────────────
function getTokenForMember(name) {
  try {
    const ss     = SpreadsheetApp.openById(SHEET_ID);
    const sheet  = ss.getSheetByName(SHEET_TOKENS);
    if (!sheet) return null;
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === name) return values[i][1];
    }
  } catch (e) { Logger.log(e); }
  return null;
}

// ── FCM v1 push via service account ──────────────────────────────
function sendFcmPush(token, title, body) {
  const accessToken = getServiceAccountToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;

  const payload = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title, body,
          icon:  'https://peluri.onrender.com/logo.jpg',
          click_action: 'https://peluri.onrender.com/report.html'
        }
      }
    }
  };

  UrlFetchApp.fetch(url, {
    method:  'post',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ── OAuth2 token via service account JWT ─────────────────────────
function getServiceAccountToken() {
  const now = Math.floor(Date.now() / 1000);

  const header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimset = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss:   SA_CLIENT_EMAIL,
    sub:   SA_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  }));

  const toSign  = header + '.' + claimset;
  const privateKey = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sig     = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(toSign, privateKey)
  );

  const jwt = toSign + '.' + sig;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
  });

  return JSON.parse(res.getContentText()).access_token;
}

// ════════════════════════════════════════════════════════════════
//  OPSÆTNING — Kør disse trin manuelt én gang:
//
//  1. Gå til Firebase Console → Project Settings → Service accounts
//     → "Generate new private key" → download JSON
//
//  2. I Apps Script → Projektindstillinger → Scriptegenskaber:
//     Tilføj:
//       SA_CLIENT_EMAIL  →  client_email fra JSON-filen
//       SA_PRIVATE_KEY   →  private_key fra JSON-filen
//
//  3. Implementér → Ny implementering → Web app
//     Kør som: Mig | Adgang: Alle
//     Kopiér URL → indsæt i report.html som APPS_SCRIPT_URL
//
//  4. Sæt trigger for mandag kl. 10:
//     Udløsere (ur-ikon) → Tilføj udløser:
//       Funktion: sendMondayPush
//       Hændelse: Tidsbaseret → Uge-timer → Mandag → 9-10
// ════════════════════════════════════════════════════════════════
