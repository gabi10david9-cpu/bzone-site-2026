# B_ZONE — site cu bază de date reală

Asta e versiunea „adevărat site" a terminalului B_ZONE: un server Node.js
(Express) cu o bază de date SQLite reală pe disc, plus chat live prin
Socket.IO. Tot ce vedeai salvat înainte — conturi, parole, grade, mesaje de
chat, comenzi + stoc, acțiuni + participanți, cereri de rulotă — se scrie
acum în fișierul `data/bzone.db`, nu mai depinde de Claude sau de un anumit
browser. Poți deschide site-ul de pe telefon, laptop, oricine din organizație,
simultan, și toată lumea vede aceleași date.

## Ce s-a schimbat față de fișierul HTML inițial

- **Parolele sunt hash-uite cu bcrypt** (nu mai stau în clar nicăieri).
- **Autentificare cu token (JWT)** — rămâi logat și dacă închizi tab-ul.
- **Bază de date SQLite reală** (`better-sqlite3`) cu tabele separate pentru
  conturi, mesaje, comenzi, stoc, acțiuni și cereri de rulotă.
- **Chat live prin WebSocket** (Socket.IO) — mesajele apar instant la toți
  cei conectați, nu mai e nevoie de refresh la 3 secunde.
- **Toată logica de permisiuni (lider/the division/colider/coordonator/membru)
  e verificată și pe server**, nu doar în interfață — nu se mai poate ocoli
  din consolă browser.
- **Rate limiting** pe autentificare, ca să descurajeze încercările automate
  de ghicit parole.

## 1. Rulează local (pe calculatorul tău)

Ai nevoie de [Node.js](https://nodejs.org) versiunea 18 sau mai nouă.

```bash
cd bzone-site
npm install
cp .env.example .env
```

Deschide `.env` și schimbă `JWT_SECRET` cu ceva lung și random. Poți genera
unul rapid rulând:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Apoi pornește serverul:

```bash
npm start
```

Deschide `http://localhost:3000` în browser. Primul cont pe care îl creezi
devine automat **LIDER**.

## Grade și permisiuni

| Grad | Vede tab membri | Grade | Stocuri | Creează/șterge acțiuni | Aprobă/respinge comenzi & rulotă | Conturi (blochează/șterge) | Acordă strike-uri | Participă + plasează comenzi |
|---|---|---|---|---|---|---|---|---|
| **LIDER** | ✅ | ✅ editează | ✅ editează | ✅ | ✅ | ✅ | ✅ (+ poate anula strike-uri) | ✅ |
| **THE DIVISION** | ✅ (doar vizualizare) | ❌ | ❌ (doar vizualizare) | ❌ | ❌ (doar vizualizare listă) | ❌ | ✅ (nu poate anula) | ✅ |
| **COLIDER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **COORDONATOR** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **MEMBRU** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Toate gradele sub LIDER și THE DIVISION au exact aceleași drepturi de bază:
participă la acțiuni, văd stocurile disponibile și plasează comenzi/cereri
de rulotă — nimic mai mult. Un membru (sau colider/coordonator) nu poate
niciodată edita stocuri, crea acțiuni sau umbla la gradele altora, indiferent
ce încearcă din interfață — regulile astea sunt aplicate și pe server.

### Sistemul de strike-uri

LIDER și THE DIVISION pot acorda strike-uri (avertismente) oricărui cont care
nu e lider. La al **3-lea strike, contul e blocat automat** (nu se mai poate
autentifica) — pragul se schimbă din `STRIKE_THRESHOLD` în `server/catalog.js`.
Un strike acordat greșit poate fi anulat, dar strict de către LIDER, ca să nu
dispară urme de disciplină fără control. Anularea unui strike **nu**
deblochează automat contul — deblocarea se face separat, din tab-ul CONTURI.

## 2. Găzduiește-l online (site public, cu bază de date persistentă)

Ai nevoie de o platformă care ține serverul pornit permanent **și** îți dă
un disc persistent (SQLite scrie fișierul `data/bzone.db` pe disc — dacă
hostingul șterge discul la fiecare deploy, pierzi datele).

### Opțiunea recomandată: Railway (simplu, are disc persistent gratuit la început)

1. Creează cont pe [railway.app](https://railway.app) și conectează-ți contul de GitHub.
2. Urcă folderul `bzone-site` într-un repo nou pe GitHub (fără folderul `node_modules`).
3. În Railway: **New Project → Deploy from GitHub repo** → alege repo-ul.
4. La secțiunea **Variables**, adaugă:
   - `JWT_SECRET` = un șir lung, random
   - `DB_PATH` = `/data/bzone.db`
5. La secțiunea **Volumes**, atașează un volum montat la `/data` (asta ține
   baza de date chiar dacă serverul repornește sau redeploy-ezi).
6. Railway detectează automat `npm start` din `package.json` și pornește
   serverul. Îți dă un URL de tipul `xxxx.up.railway.app`.

### Alternativă: Render.com

1. Cont pe [render.com](https://render.com) → **New → Web Service** → conectează repo-ul.
2. Build command: `npm install`. Start command: `npm start`.
3. Adaugă un **Persistent Disk** (din setările serviciului) montat la, de
   exemplu, `/opt/render/project/data`, și setează `DB_PATH` la
   `/opt/render/project/data/bzone.db`.
4. Adaugă variabila de mediu `JWT_SECRET`.
5. Render îți dă automat un URL public HTTPS.

> Discul persistent e obligatoriu doar dacă vrei ca datele să reziste peste
> restart-uri/redeploy-uri. Pe planurile complet gratuite fără disc, datele
> se pot pierde la fiecare redeploy — bun doar pentru testare rapidă.

### Alternativă: un VPS propriu (DigitalOcean, Hetzner etc.)

```bash
git clone <repo-ul-tau>
cd bzone-site
npm install --production
cp .env.example .env   # completează JWT_SECRET
npm install -g pm2
pm2 start server/index.js --name bzone
pm2 save
pm2 startup
```

Pune un reverse proxy Nginx în față cu certificat HTTPS gratuit (Let's
Encrypt / Certbot) ca să ai `https://domeniul-tau.ro`.

## 3. Structura proiectului

```
bzone-site/
  server/
    index.js         → pornește serverul Express + Socket.IO
    db.js             → schema SQLite + seed inițial
    catalog.js        → catalogul de produse din COMENZI + gradele
    middleware/auth.js→ verificare JWT + permisiuni pe grad
    routes/           → auth, chat, ranks, orders, actions, rulota
  public/
    index.html         → interfața (design terminal, neschimbat vizual)
    css/style.css
    js/app.js           → tot frontend-ul, vorbește cu server-ul prin fetch()
  data/bzone.db         → fișierul bazei de date (creat automat)
```

## 4. Lucruri pe care poate vrei să le schimbi

- **Catalogul de produse** din secțiunea COMENZI: editează
  `server/catalog.js`.
- **Rețetele de crafting** (ARME / GLOANTE): editează obiectul `DATA` din
  `public/js/app.js`.
- **Durata sesiunii** (cât timp rămâi logat): `JWT_EXPIRES_IN` din `.env`.

## 5. Backup

Baza de date e un singur fișier: `data/bzone.db`. Pentru backup, pur și
simplu copiază periodic acel fișier (plus `.db-wal`/`.db-shm` dacă există)
undeva în siguranță.
