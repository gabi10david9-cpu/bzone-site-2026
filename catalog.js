// Catalogul de echipament pentru secțiunea COMENZI.
// Editează liber lista asta ca să adaugi/schimbi produse — stocul se
// resetează automat pentru orice id nou apărut aici.
const ORDER_CATALOG = [
  { id: 'armura', name: 'Armură', price: 5000, glyph: '▲' },
  { id: 'kit_medical', name: 'Kit medical', price: 15000, glyph: '✚' },
  { id: 'blueprint_db', name: 'Blueprint DB', price: 75000, glyph: '▦' },
  { id: 'shotgun', name: 'Shotgun', price: 60000, glyph: '▬' }
];

// La al câtelea strike se blochează automat contul.
const STRIKE_THRESHOLD = 3;

// Ierarhia gradelor. "divizie" (afișat ca "THE DIVISION") stă direct sub
// lider: vede tot ce vede liderul (tab membri, comenzi/rulotă/acțiuni în
// așteptare, conturi) dar NU poate edita stocuri, crea/șterge acțiuni,
// aproba/respinge comenzi sau cereri de rulotă, schimba grade sau
// bloca/șterge conturi — acele puteri rămân strict ale liderului.
const RANKS = {
  lider:       { label: 'LIDER',        weight: 5 },
  divizie:     { label: 'THE DIVISION', weight: 4 },
  colider:     { label: 'COLIDER',      weight: 3 },
  coordonator: { label: 'COORDONATOR',  weight: 2 },
  membru:      { label: 'MEMBRU',       weight: 1 }
};

function isLider(rank) {
  return rank === 'lider';
}

// Poate vedea tab-ul de membri / ierarhia completă (fără drept de editare
// decât dacă e și lider).
function canViewMembersTab(rank) {
  return rank === 'lider' || rank === 'divizie';
}

// Poate schimba gradul altor conturi. Strict lider — inclusiv "the division"
// nu poate umbla la grade, ca să nu existe risc de auto-promovare.
function canManageRanks(rank) {
  return rank === 'lider';
}

// Poate șterge conturi sau le poate bloca/debloca.
function canManageAccounts(rank) {
  return rank === 'lider';
}

// Poate vedea lista de comenzi/cereri-rulotă în așteptare pentru toată
// organizația (fără drept de decizie decât dacă e și lider).
function canViewPending(rank) {
  return rank === 'lider' || rank === 'divizie';
}

// Poate aproba/respinge comenzi sau cereri de rulotă. Strict lider.
function canDecideOrders(rank) {
  return rank === 'lider';
}

// Poate edita stocurile (echipament + rulotă). Strict lider.
function canEditStock(rank) {
  return rank === 'lider';
}

// Poate crea/șterge acțiuni. Strict lider.
function canManageOps(rank) {
  return rank === 'lider';
}

// Poate acorda strike-uri (avertismente) membrilor — lider + the division,
// pentru că monitorizarea disciplinei e exact rolul lui "the division".
function canIssueStrikes(rank) {
  return rank === 'lider' || rank === 'divizie';
}

// Poate șterge/anula un strike deja acordat (corectare eroare). Strict
// lider, ca să nu se poată ascunde urme de disciplină fără control.
function canRemoveStrike(rank) {
  return rank === 'lider';
}

module.exports = {
  ORDER_CATALOG,
  STRIKE_THRESHOLD,
  RANKS,
  isLider,
  canViewMembersTab,
  canManageRanks,
  canManageAccounts,
  canViewPending,
  canDecideOrders,
  canEditStock,
  canManageOps,
  canIssueStrikes,
  canRemoveStrike
};
