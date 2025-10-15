const http = require('http');
const url = require('url');
const fs = require('fs').promises;
const path = require('path');
const querystring = require('querystring');

const PORT = 3000;
const GUESTS_FILE = path.join(__dirname, 'guests.json');
const VISITS_FILE = path.join(__dirname, 'visits.json');

let totalVisits = 0;
async function ensureFileExists(filePath, initialValue) {
  try {
    await fs.access(filePath);
  } catch (err) {
    await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2), 'utf8');
  }
}

async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return JSON.parse(txt || 'null') ?? null;
  } catch (err) {
    return null;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function htmlWrapper(title, bodyContent) {
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family: Arial, Helvetica, sans-serif; max-width:800px;margin:24px auto;padding:0 12px;color:#222}
    h1{color:#2c3e50}
    a {color:#1a73e8;text-decoration:none}
    a:hover{text-decoration:underline}
    .btn{display:inline-block;padding:6px 10px;margin:6px 4px;border-radius:6px;background:#eee;border:1px solid #ccc}
    form input[type="text"]{padding:8px;width:60%;box-sizing:border-box}
    form input[type="submit"]{padding:8px 12px}
    ul{line-height:1.6}
    .meta{color:#666;font-size:0.9rem}
    .danger{color:#b00020}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getIp(req) {
  const raw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return raw.replace(/^::ffff:/, '') || 'unknown';
}

function makeId() {
  return Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

(async () => {
  await ensureFileExists(GUESTS_FILE, []);
  await ensureFileExists(VISITS_FILE, { total: 0, byIp: {} });

  const visits = await readJson(VISITS_FILE);
  if (visits && typeof visits.total === 'number') {
    totalVisits = visits.total;
  } else {
    totalVisits = 0;
    await writeJson(VISITS_FILE, { total: 0, byIp: {} });
  }
})();

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;
  const method = req.method;

  try {
    if (pathname === '/' && method === 'GET') {
      const ip = getIp(req);
      totalVisits++;
      const visits = (await readJson(VISITS_FILE)) || { total: 0, byIp: {} };
      visits.total = (visits.total || 0) + 1;
      visits.byIp = visits.byIp || {};
      visits.byIp[ip] = (visits.byIp[ip] || 0) + 1;
      await writeJson(VISITS_FILE, visits);

      const body = `
        <h1>Witaj na stronie!</h1>
        <p>Odwiedziłeś ją już <strong>${totalVisits}</strong> razy.</p>
        <p class="meta">Twoje IP: ${escapeHtml(ip)}</p>
        <p>
          <a class="btn" href="/fom">Dodaj gościa przez formularz</a>
          <a class="btn" href="/list">Zobacz listę gości</a>
          <a class="btn" href="/stats">Statystyki odwiedzin</a>
        </p>
      `;
      res.end(htmlWrapper('Strona główna', body));
      return;
    }

    if (pathname === '/stats' && method === 'GET') {
      const visits = (await readJson(VISITS_FILE)) || { total: totalVisits, byIp: {} };
      const items = Object.entries(visits.byIp || {}).sort((a,b)=>b[1]-a[1]);
      const list = items.length
        ? '<ul>' + items.map(([ip, cnt]) => `<li>${escapeHtml(ip)} — ${cnt} odwiedzin</li>`).join('') + '</ul>'
        : '<p>Brak danych o odwiedzinach.</p>';

      const body = `
        <h1>Statystyki odwiedzin</h1>
        <p class="meta">Łącznie: <strong>${visits.total || 0}</strong> odwiedzin</p>
        ${list}
        <p><a href="/">Powrót</a></p>
      `;
      res.end(htmlWrapper('Statystyki', body));
      return;
    }

    if (pathname === '/fom' && method === 'GET') {
      const body = `
        <h1>Dodaj gościa</h1>
        <form method="POST" action="/add">
          <label>Imię: <input type="text" name="name" required></label>
          <input type="submit" value="Dodaj">
        </form>
        <p class="meta">Możesz też dodać przez URL: <code>/add?name=Jan</code></p>
        <p><a href="/">Powrót</a> · <a href="/list">Lista gości</a></p>
      `;
      res.end(htmlWrapper('Dodaj gościa', body));
      return;
    }

    if (pathname === '/add') {
      if (method === 'GET') {
        const name = (query.name || '').trim();
        if (!name) {
          const body = `
            <h1>Błąd</h1>
            <p>Brakuje parametru <code>name</code>. Użyj <code>/add?name=Jan</code> lub formularza <a href="/fom">/fom</a>.</p>
            <p><a href="/">Powrót</a></p>
          `;
          res.end(htmlWrapper('Błąd - brak name', body));
          return;
        }
        await addGuest(name, getIp(req), res);
        return;
      }

      if (method === 'POST') {
        let bodyData = '';
        req.on('data', chunk => { bodyData += chunk.toString(); });
        req.on('end', async () => {
          const parsedBody = querystring.parse(bodyData);
          const name = (parsedBody.name || '').trim();
          if (!name) {
            const body = `
              <h1>Błąd</h1>
              <p>Formularz nie zawiera pola <code>name</code> lub jest puste.</p>
              <p><a href="/fom">Powrót do formularza</a></p>
            `;
            res.end(htmlWrapper('Błąd - brak name', body));
            return;
          }
          await addGuest(name, getIp(req), res);
        });
        return;
      }

      res.statusCode = 405;
      res.end(htmlWrapper('Metoda niedozwolona', '<h1>405 - Method Not Allowed</h1>'));
      return;
    }

    if (pathname === '/list' && method === 'GET') {
      const guests = (await readJson(GUESTS_FILE)) || [];
      if (!guests.length) {
        const body = `
          <h1>Lista gości</h1>
          <p>Lista gości jest pusta.</p>
          <p><a href="/fom">Dodaj pierwszego gościa</a></p>
        `;
        res.end(htmlWrapper('Lista gości', body));
        return;
      }
      const items = guests.map(g => {
        return `<li><strong>${escapeHtml(g.name)}</strong> <span class="meta">(${escapeHtml(g.addedAt)})</span>
                — <a href="/delete?id=${encodeURIComponent(g.id)}" class="danger">usuń</a></li>`;
      }).join('');
      const body = `
        <h1>Lista gości</h1>
        <ul>${items}</ul>
        <p><a href="/fom">Dodaj kolejnego</a> · <a href="/clear">Wyczyść listę</a> · <a href="/">Strona główna</a></p>
      `;
      res.end(htmlWrapper('Lista gości', body));
      return;
    }

    if (pathname === '/delete' && method === 'GET') {
      const id = (query.id || '').trim();
      if (!id) {
        const body = `
          <h1>Błąd</h1>
          <p>Brakuje parametru <code>id</code>. Podaj id gościa do usunięcia.</p>
          <p><a href="/list">Powrót do listy</a></p>
        `;
        res.end(htmlWrapper('Błąd - brak id', body));
        return;
      }
      const guests = (await readJson(GUESTS_FILE)) || [];
      const index = guests.findIndex(g => g.id === id);
      if (index === -1) {
        const body = `
          <h1>Nie znaleziono gościa</h1>
          <p>Nie znaleziono gościa o id <code>${escapeHtml(id)}</code>.</p>
          <p><a href="/list">Powrót do listy</a></p>
        `;
        res.end(htmlWrapper('Nie znaleziono', body));
        return;
      }
      const removed = guests.splice(index, 1)[0];
      await writeJson(GUESTS_FILE, guests);
      const body = `
        <h1>Usunięto gościa</h1>
        <p>Usunięto: <strong>${escapeHtml(removed.name)}</strong> (dodany: ${escapeHtml(removed.addedAt)})</p>
        <p><a href="/list">Powrót do listy</a></p>
      `;
      res.end(htmlWrapper('Usunięto', body));
      return;
    }

    if (pathname === '/clear' && method === 'GET') {
      await writeJson(GUESTS_FILE, []);
      const body = `
        <h1>Lista gości została wyczyszczona</h1>
        <p><a href="/list">Zobacz listę</a> · <a href="/">Strona główna</a></p>
      `;
      res.end(htmlWrapper('Wyczyszczono', body));
      return;
    }

    res.statusCode = 404;
    res.end(htmlWrapper('404 - Nie istnieje', '<h1>404 - Strona nie istnieje</h1><p><a href="/">Powrót</a></p>'));
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.end(htmlWrapper('500 - Błąd serwera', `<h1>Błąd serwera</h1><pre>${escapeHtml(err.message)}</pre>`));
  }
});

async function addGuest(nameRaw, ip, res) {
  const name = String(nameRaw).trim();
  if (!name) {
    const body = `
      <h1>Błąd</h1>
      <p>Imię nie może być puste.</p>
      <p><a href="/fom">Powrót do formularza</a></p>
    `;
    res.end(htmlWrapper('Błąd - puste imię', body));
    return;
  }

  const guest = {
    id: makeId(),
    name: name,
    addedAt: new Date().toISOString()
  };

  try {
    const guests = (await readJson(GUESTS_FILE)) || [];
    guests.push(guest);
    await writeJson(GUESTS_FILE, guests);

    const body = `
      <h1>Dodano gościa</h1>
      <p>Dodano: <strong>${escapeHtml(guest.name)}</strong></p>
      <p class="meta">Data i czas dodania: ${escapeHtml(guest.addedAt)}</p>
      <p><a href="/list">Zobacz listę</a> · <a href="/fom">Dodaj kolejnego</a> · <a href="/">Strona główna</a></p>
    `;
    res.end(htmlWrapper('Dodano gościa', body));
  } catch (err) {
    console.error('Błąd zapisu gościa:', err);
    const body = `
      <h1>Błąd</h1>
      <p>Nie udało się zapisać gościa. Spróbuj ponownie.</p>
      <p><a href="/fom">Powrót</a></p>
    `;
    res.end(htmlWrapper('Błąd zapisu', body));
  }
}

server.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
