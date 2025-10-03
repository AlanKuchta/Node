const http = require("http");
const fs = require("fs");
const url = require("url");

let counter = 0;
const PORT = 3000;
const GUESTS_FILE = "guests.txt";

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (path === "/") {
    counter++;
    res.end(`
      <html>
        <head><title>Strona główna</title></head>
        <body>
          <h1>Witaj na stronie!</h1>
          <p>Odwiedziłeś ją już <strong>${counter}</strong> razy.</p>
          <a href="/list">Zobacz listę gości</a>
        </body>
      </html>
    `);
  }

  else if (path === "/add") {
    const name = query.name;
    if (!name) {
      res.end(`
        <html><body>
        <h1>Błąd</h1>
        <p>Musisz podać parametr <code>name</code>, np. <a href="/add?name=Jan">/add?name=Jan</a></p>
        </body></html>
      `);
      return;
    }
    fs.appendFile(GUESTS_FILE, name + "\n", (err) => {
      if (err) {
        res.end(`<html><body><h1>Błąd</h1><p>Nie udało się zapisać do pliku.</p></body></html>`);
      } else {
        res.end(`
          <html><body>
          <h1>Dodano gościa!</h1>
          <p>Dodano: <strong>${name}</strong></p>
          <a href="/list">Zobacz listę gości</a>
          </body></html>
        `);
      }
    });
  }

  else if (path === "/list") {
    fs.readFile(GUESTS_FILE, "utf-8", (err, data) => {
      if (err || !data.trim()) {
        res.end(`
          <html><body>
          <h1>Lista gości</h1>
          <p>Lista gości jest pusta.</p>
          </body></html>
        `);
        return;
      }
      const guests = data.trim().split("\n");
      const listItems = guests.map(g => `<li>${g}</li>`).join("");
      res.end(`
        <html><body>
        <h1>Lista gości</h1>
        <ul>${listItems}</ul>
        <a href="/clear">Wyczyść listę</a>
        </body></html>
      `);
    });
  }

  else if (path === "/clear") {
    fs.writeFile(GUESTS_FILE, "", (err) => {
      if (err) {
        res.end(`<html><body><h1>Błąd</h1><p>Nie udało się wyczyścić listy.</p></body></html>`);
      } else {
        res.end(`
          <html><body>
          <h1>Lista gości została wyczyszczona!</h1>
          <a href="/list">Sprawdź listę</a>
          </body></html>
        `);
      }
    });
  }

  else {
    res.statusCode = 404;
    res.end(`
      <html><body>
      <h1>404 - Strona nie istnieje</h1>
      </body></html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});




