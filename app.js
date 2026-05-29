// ─────────────────────────────────────────────────────────────
//  KONFIGURATION
//  1. Åbn Google Sheet → Del → "Alle med linket kan se"
//  2. Kopier Sheet ID fra URL:  spreadsheets/d/HER_ER_ID/edit
//  3. Indsæt ID herunder
// ─────────────────────────────────────────────────────────────
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const REFRESH_MS = 5 * 60 * 1000; // opdater hvert 5. minut
// ─────────────────────────────────────────────────────────────

const SHEET_STILLING = 'Aktuel Saeson 2025-26';
const SHEET_TOTALER  = 'Medlem Totaler';

let activeTab = 'stilling';

// ── CSV-hjælpere ──────────────────────────────────────────────

function sheetUrl(name) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && !inQ)                       { inQ = true; continue; }
      if (c === '"' && inQ && line[i+1] === '"')   { cur += '"'; i++; continue; }
      if (c === '"' && inQ)                         { inQ = false; continue; }
      if (c === ',' && !inQ)                        { cols.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

async function fetchCSV(sheetName) {
  const res = await fetch(sheetUrl(sheetName));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCSV(await res.text());
}

// ── Formattering ──────────────────────────────────────────────

function fmtKr(v) {
  if (v === null || v === undefined || v === '' || v === '-') return '<span class="dash">—</span>';
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return '<span class="dash">—</span>';
  return n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + '&nbsp;kr';
}

function fmtOdds(v) {
  if (!v || v === '-' || v === '') return '<span class="dash">—</span>';
  return String(v).replace('.', ',');
}

function fmtSaldo(v) {
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? v : n.toLocaleString('da-DK') + ' kr';
}

// ── Tab 1: Årets Stilling ─────────────────────────────────────

async function loadStilling() {
  const el = document.getElementById('stilling');
  el.innerHTML = '<div class="loading">Henter data</div>';
  try {
    const rows = await fetchCSV(SHEET_STILLING);

    // Row 0 = titel, row 1 = headers, rows 2–7 = 6 spillere
    const members = rows.slice(2, 8).filter(r => r[1] && r[1].trim() !== '');

    // Find saldo (søg efter "SAMLET" i kolonne A)
    let saldo = '';
    for (const r of rows) {
      if (r[0] && r[0].toUpperCase().includes('SAMLET')) { saldo = r[1]; break; }
    }

    const medals  = ['🥇', '🥈', '🥉'];
    const classes = ['rank-1', 'rank-2', 'rank-3'];

    const tRows = members.map((r, i) => {
      const cls    = classes[i] || (i % 2 === 0 ? '' : '');
      const rankEl = medals[i]
        ? `<span class="medal">${medals[i]}</span>`
        : `<span class="rank-num">${i + 1}.</span>`;
      const nameW  = i < 3 ? 'bold' : '';
      return `
        <tr class="${cls}">
          <td style="white-space:nowrap">${rankEl}</td>
          <td><span class="player-name ${nameW}">${r[1]}</span></td>
          <td class="num ${nameW}">${fmtKr(r[2])}</td>
          <td class="num">${r[3] || '<span class="dash">—</span>'}</td>
          <td class="num">${fmtOdds(r[4])}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <h2 class="section-title">Sæson 2025/26</h2>
      <p class="section-sub">Live stillinger</p>
      <div class="section-rule"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:52px">#</th>
              <th>Spiller</th>
              <th class="num">Gevinst</th>
              <th class="num">Vundet</th>
              <th class="num">Bedste Odds</th>
            </tr>
          </thead>
          <tbody>${tRows}</tbody>
        </table>
      </div>
      ${saldo ? `
      <div class="saldo-box">
        <div class="saldo-label">Samlet Saldo</div>
        <div class="saldo-value">${fmtSaldo(saldo)}</div>
      </div>` : ''}
    `;
    updateTimestamp();
  } catch (e) {
    el.innerHTML = `<div class="error-msg">Kunne ikke hente data.<br><small>${e.message}</small></div>`;
  }
}

// ── Tab 2: Historiske Totaler ─────────────────────────────────

async function loadTotaler() {
  const el = document.getElementById('historik');
  el.innerHTML = '<div class="loading">Henter data</div>';
  try {
    const rows = await fetchCSV(SHEET_TOTALER);

    // Row 0 = titel, row 1 = headers, rows 2–7 = 6 spillere
    const headers = rows[1] || [];
    const members = rows.slice(2, 8).filter(r => r[0] && r[0].trim() !== '' && r[0].trim() !== '-');

    // Sæson-kolonner: indeks 1–6  (2020/21 … 2025/26)
    const seasonLabels = headers.slice(1, 7).map(h => h.replace(' (kr)', '').replace(' kr', ''));

    const medals  = ['🥇', '🥈', '🥉'];
    const classes = ['rank-1', 'rank-2', 'rank-3'];

    const headCols = seasonLabels.map(s =>
      `<th class="num" style="font-size:11px">${s}</th>`).join('');

    const tRows = members.map((r, i) => {
      const cls    = classes[i] || '';
      const nameW  = i < 3 ? 'bold' : '';
      const rankEl = medals[i]
        ? `<span class="medal">${medals[i]}</span> `
        : `<span class="rank-num">${i + 1}.</span> `;

      const seasonCols = seasonLabels.map((_, si) => {
        const val = r[si + 1];
        const empty = !val || val.trim() === '' || val.trim() === '-';
        return `<td class="num">${empty ? '<span class="dash">—</span>' : fmtKr(val)}</td>`;
      }).join('');

      const total = r[7] || '';
      return `
        <tr class="${cls}">
          <td style="white-space:nowrap">
            ${rankEl}<span class="player-name ${nameW}">${r[0]}</span>
          </td>
          ${seasonCols}
          <td class="num total-col">${fmtKr(total)}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <h2 class="section-title">Totaler per Medlem</h2>
      <p class="section-sub">Alle sæsoner</p>
      <div class="section-rule"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Spiller</th>
              ${headCols}
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>${tRows}</tbody>
        </table>
      </div>
    `;
    updateTimestamp();
  } catch (e) {
    el.innerHTML = `<div class="error-msg">Kunne ikke hente data.<br><small>${e.message}</small></div>`;
  }
}

// ── Setup-besked ──────────────────────────────────────────────

function showSetup() {
  const html = `
    <div class="setup-card">
      <h2>Opsætning krævet</h2>
      <p>Indsæt dit Google Sheet ID i <code>app.js</code> for at aktivere live data:</p>
      <ol>
        <li>Åbn dit Google Sheet i Google Drev</li>
        <li>Klik <strong>Del</strong> → vælg <em>"Alle med linket kan se"</em></li>
        <li>Kopiér ID fra URL'en:<br>
            <code>docs.google.com/spreadsheets/d/<strong>← ID HER →</strong>/edit</code></li>
        <li>Åbn <code>app.js</code> og erstat <code>YOUR_GOOGLE_SHEET_ID</code> med dit ID</li>
      </ol>
    </div>`;
  document.getElementById('stilling').innerHTML = html;
  document.getElementById('historik').innerHTML = html;
}

// ── Timestamp ─────────────────────────────────────────────────

function updateTimestamp() {
  const el = document.getElementById('last-updated');
  if (el) {
    const now = new Date().toLocaleString('da-DK', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    el.textContent = `Sidst opdateret ${now}`;
  }
}

// ── Tab-skift ─────────────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.id === tab));
  if (tab === 'stilling') loadStilling();
  else loadTotaler();
}

// ── Init ──────────────────────────────────────────────────────

function init() {
  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  if (SHEET_ID === 'YOUR_GOOGLE_SHEET_ID') {
    showSetup();
    return;
  }

  loadStilling();

  setInterval(() => {
    if (activeTab === 'stilling') loadStilling();
    else loadTotaler();
  }, REFRESH_MS);
}

init();
