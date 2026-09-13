(function(){
  // ================= matrix rain background =================
  var canvas = document.getElementById('matrix');
  var mctx = canvas.getContext('2d');
  var mChars = 'アイウエオカキクケコサシスセソ0123456789$#%&';
  var mFontSize = 14, mColumns = 0, mDrops = [];
  function mResize(){
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    mColumns = Math.max(1, Math.floor(canvas.width / mFontSize));
    mDrops = new Array(mColumns).fill(0).map(function(){ return Math.random()*-40; });
  }
  window.addEventListener('resize', mResize);
  setTimeout(mResize, 50);
  function mDraw(){
    mctx.fillStyle = 'rgba(2,4,3,0.09)';
    mctx.fillRect(0,0,canvas.width,canvas.height);
    mctx.fillStyle = '#4bf5a0';
    mctx.font = mFontSize + 'px monospace';
    for(var i=0;i<mDrops.length;i++){
      var ch = mChars[Math.floor(Math.random()*mChars.length)];
      mctx.fillText(ch, i*mFontSize, mDrops[i]*mFontSize);
      if(mDrops[i]*mFontSize > canvas.height && Math.random() > 0.975){ mDrops[i] = 0; }
      mDrops[i]++;
    }
  }
  setInterval(mDraw, 60);

  // ================= titlebar live stats =================
  var t0 = Date.now();
  function pad(n){ return n<10 ? '0'+n : ''+n; }
  setInterval(function(){
    var s = Math.floor((Date.now()-t0)/1000);
    document.getElementById('stat-uptime').textContent = pad(Math.floor(s/60))+':'+pad(s%60);
  }, 1000);
  function pingTick(){ document.getElementById('stat-ping').textContent = 18 + Math.floor(Math.random()*26); }
  pingTick();
  setInterval(pingTick, 2200);

  // ================= API helper =================
  function getToken(){ return localStorage.getItem('bzone_token'); }
  function setToken(t){ if(t) localStorage.setItem('bzone_token', t); else localStorage.removeItem('bzone_token'); }

  async function api(path, opts){
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var token = getToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;

    var res;
    try{
      res = await fetch(path, Object.assign({}, opts, { headers: headers }));
    }catch(e){
      var netErr = new Error('nu se poate contacta serverul — verifică conexiunea sau dacă backend-ul rulează.');
      netErr.network = true;
      throw netErr;
    }
    var data = null;
    try{ data = await res.json(); }catch(e){ data = null; }
    if(!res.ok){
      // token invalid/expirat sau cont blocat între timp — forțează
      // deconectarea în loc să lase interfața într-o stare inconsistentă.
      if(res.status === 401 || (res.status === 403 && data && /blocat/i.test(data.error || ''))){
        setToken(null);
        setTimeout(function(){ location.reload(); }, 50);
      }
      var err = new Error((data && data.error) || ('eroare server (' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  var api_get = function(p){ return api(p, { method:'GET' }); };
  var api_post = function(p,b){ return api(p, { method:'POST', body: JSON.stringify(b||{}) }); };
  var api_put = function(p,b){ return api(p, { method:'PUT', body: JSON.stringify(b||{}) }); };
  var api_del = function(p){ return api(p, { method:'DELETE' }); };

  var socket = (typeof io === 'function') ? io() : null;

  var currentUser = null;
  var currentRank = 'membru';

  var RANKS = {
    lider:       { label:'LIDER',        weight:5 },
    divizie:     { label:'THE DIVISION', weight:4 },
    colider:     { label:'COLIDER',      weight:3 },
    coordonator: { label:'COORDONATOR',  weight:2 },
    membru:      { label:'MEMBRU',       weight:1 }
  };

  var ORDER_CATALOG = [];

  function fmtMoney(n){ return '$' + n.toLocaleString('en-US'); }

  // ---- model de permisiuni ----
  // Doar liderul poate: edita stocuri, crea/șterge acțiuni, aproba/respinge
  // comenzi și cereri de rulotă, schimba grade, șterge/bloca conturi.
  // "THE DIVISION" vede tot ce vede liderul (tab membri, comenzi/rulotă/
  // acțiuni în așteptare) dar nu poate acționa pe niciuna dintre ele.
  function isLider(){ return currentRank === 'lider'; }
  function isDivision(){ return currentRank === 'divizie'; }
  function canSeeMembersTab(){ return isLider() || isDivision(); }
  function canManageRanks(){ return isLider(); }
  function canManageAccounts(){ return isLider(); }
  function canViewPending(){ return isLider() || isDivision(); }
  function canDecideOrders(){ return isLider(); }
  function canManageOps(){ return isLider(); }
  function canEditStock(){ return isLider(); }
  function canIssueStrikes(){ return isLider() || isDivision(); }
  function canRemoveStrike(){ return isLider(); }

  function updateRankPill(){
    var pill = document.getElementById('tb-rank');
    if(!currentUser){ pill.style.display='none'; return; }
    pill.style.display = 'inline-block';
    pill.className = 'rank-pill ' + currentRank;
    pill.textContent = RANKS[currentRank].label;
  }

  // ================= boot sequence (typed) =================
  var bootLines = [
    {text:'initializing b_zone uplink...', cls:''},
    {text:'mounting encrypted volume [OK]', cls:'ok'},
    {text:'loading node registry... 214 entries', cls:''},
    {text:'handshake cu relay 4... [OK]', cls:'ok'},
    {text:'verificare integritate firmware... [OK]', cls:'ok'},
    {text:'avertisment: accesul neautorizat este monitorizat', cls:'warn'},
    {text:'aștept credențiale operator...', cls:''}
  ];

  var log = document.getElementById('boot-log');
  var lineIdx = 0;

  function typeLine(text, cls, cb){
    var div = document.createElement('div');
    div.className = 'ln';
    log.appendChild(div);
    var span = document.createElement('span');
    if(cls) span.className = cls;
    div.appendChild(span);
    var cursor = document.createElement('span');
    cursor.className = 'typecursor';
    div.appendChild(cursor);

    var i = 0;
    var speed = 14 + Math.random()*10;
    (function step(){
      if(i <= text.length){
        span.textContent = text.slice(0, i);
        i++;
        setTimeout(step, speed);
      } else {
        cursor.remove();
        if(cb) cb();
      }
    })();
  }

  async function tryResumeSession(){
    if(!getToken()) return false;
    try{
      var data = await api_get('/api/auth/me');
      afterAuth(data.user.email, data.user.rank);
      return true;
    }catch(e){
      setToken(null);
      return false;
    }
  }

  function runBoot(){
    if(lineIdx >= bootLines.length){
      tryResumeSession().then(function(resumed){
        if(!resumed){
          document.getElementById('auth-wrap').classList.add('show');
          document.getElementById('login-email').focus();
        }
      });
      return;
    }
    var l = bootLines[lineIdx];
    lineIdx++;
    typeLine(l.text, l.cls, function(){
      setTimeout(runBoot, l.cls === 'warn' ? 260 : 160);
    });
  }
  setTimeout(runBoot, 300);

  // ================= auth tabs =================
  var tabLogin = document.getElementById('tab-login');
  var tabRegister = document.getElementById('tab-register');
  var formLogin = document.getElementById('form-login');
  var formRegister = document.getElementById('form-register');

  tabLogin.addEventListener('click', function(){
    tabLogin.classList.add('active'); tabRegister.classList.remove('active');
    formLogin.style.display = 'block'; formRegister.style.display = 'none';
  });
  tabRegister.addEventListener('click', function(){
    tabRegister.classList.add('active'); tabLogin.classList.remove('active');
    formRegister.style.display = 'block'; formLogin.style.display = 'none';
  });

  function setMsg(id, text, ok){
    var el = document.getElementById(id);
    el.textContent = text;
    el.className = 'auth-msg ' + (ok ? 'ok' : 'err');
  }

  function afterAuth(email, rank){
    currentUser = email;
    currentRank = rank || 'membru';
    var ew = document.getElementById('auth-wrap');
    if(ew){
      ew.style.opacity = 0;
      setTimeout(function(){
        ew.remove();
        var postLines = [
          {text:'autentificare reușită pentru ' + email + ' [' + RANKS[currentRank].label + ']', cls:'ok'},
          {text:'sesiune criptată stabilită. bine ai revenit.', cls:'ok'}
        ];
        var idx = 0;
        (function step(){
          if(idx >= postLines.length){
            document.getElementById('enter-wrap').classList.add('show');
            document.getElementById('tb-state').textContent = email;
            updateRankPill();
            return;
          }
          var l = postLines[idx]; idx++;
          typeLine(l.text, l.cls, function(){ setTimeout(step, 220); });
        })();
      }, 260);
    } else {
      document.getElementById('tb-state').textContent = email;
      updateRankPill();
    }
  }

  formRegister.addEventListener('submit', async function(e){
    e.preventDefault();
    var email = document.getElementById('reg-email').value.trim().toLowerCase();
    var pass = document.getElementById('reg-pass').value;
    var pass2 = document.getElementById('reg-pass2').value;
    var btn = document.getElementById('reg-submit');

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setMsg('reg-msg', 'email invalid.', false); return; }
    if(pass.length < 6){ setMsg('reg-msg', 'parola trebuie să aibă minim 6 caractere.', false); return; }
    if(pass !== pass2){ setMsg('reg-msg', 'parolele nu coincid.', false); return; }

    btn.disabled = true; setMsg('reg-msg', 'se verifică...', true);
    try{
      var data = await api_post('/api/auth/register', { email: email, password: pass });
      setToken(data.token);
      setMsg('reg-msg', 'cont creat ca ' + RANKS[data.user.rank].label + '. autentificare...', true);
      setTimeout(function(){ afterAuth(data.user.email, data.user.rank); }, 500);
    }catch(err){
      btn.disabled = false;
      setMsg('reg-msg', err.message, false);
    }
  });

  formLogin.addEventListener('submit', async function(e){
    e.preventDefault();
    var email = document.getElementById('login-email').value.trim().toLowerCase();
    var pass = document.getElementById('login-pass').value;
    var btn = document.getElementById('login-submit');

    btn.disabled = true; setMsg('login-msg', 'se verifică...', true);
    try{
      var data = await api_post('/api/auth/login', { email: email, password: pass });
      setToken(data.token);
      setMsg('login-msg', 'acces autorizat...', true);
      setTimeout(function(){ afterAuth(data.user.email, data.user.rank); }, 500);
    }catch(err){
      btn.disabled = false;
      setMsg('login-msg', err.message, false);
    }
  });

  document.getElementById('enter-btn').addEventListener('click', function(){
    var boot = document.getElementById('boot');
    if(boot && boot.parentNode) boot.parentNode.removeChild(boot);
    var app = document.getElementById('app');
    app.classList.add('show');
    render();
  });

  // ================= crafting data (static, no persistence needed) =================
  var DATA = {
    arme: {
      label:'ARME', glyph:'▣',
      items:{
        tec9:{
          name:'TEC-9', glyph:'▣', desc:'SMG compactă, cadență mare, rază mică.',
          steps:[
            {label:'PASUL 1 — COMPONENTE', mats:[{name:'Oțel',amt:1},{name:'Plastic',amt:1},{name:'Arc',amt:1},{name:'Șrapnel metalic',amt:2}], yields:{name:'Piese',amt:2}},
            {label:'PASUL 2 — ASAMBLARE', mats:[{name:'Piese (pt. 2 țevi SMG)',amt:2},{name:'Corp pistol',amt:1},{name:'Kit bonus',amt:1}], yields:{name:'TEC-9',amt:1}}
          ]
        },
        heavy:{
          name:'HEAVY REVOLVER', glyph:'◆', desc:'Revolver greu, daună mare, cadență lentă.',
          steps:[
            {label:'PASUL 1 — COMPONENTE', mats:[{name:'Oțel',amt:1},{name:'Plastic',amt:1},{name:'Arc',amt:1},{name:'Șrapnel metalic',amt:2}], yields:{name:'Piese armă',amt:2}},
            {label:'PASUL 2 — ASAMBLARE', mats:[{name:'Țeavă pistol',amt:1},{name:'Corp',amt:1},{name:'Piese armă',amt:3}], yields:{name:'Heavy Revolver',amt:1}}
          ]
        }
      },
      soon:['More coming soon']
    },
    gloante:{
      label:'GLOANTE', glyph:'●',
      items:{
        mm9pbm:{
          name:'9MM / PBM', glyph:'●', desc:'Muniție standard pentru arme de calibru mic.',
          steps:[
            {label:'PASUL 1 — CASINGURI', mats:[{name:'Cupru',amt:1}], yields:{name:'Casinguri',amt:30}},
            {label:'PASUL 2 — PRAF DE PUȘCĂ', mats:[{name:'Sulf',amt:1},{name:'Cărbuni',amt:1}], yields:{name:'Praf de pușcă',amt:1}},
            {label:'PASUL 3 — ÎNCĂRCARE', mats:[{name:'Casinguri',amt:30},{name:'Praf de pușcă',amt:1},{name:'Plumb',amt:1}], yields:{name:'9mm / PBM',amt:30}}
          ]
        }
      },
      soon:['More coming soon']
    }
  };

  var view = document.getElementById('view');
  var crumbs = document.getElementById('crumbs');
  var state = { section:null, cat:null, item:null, qty:1, selectedOrder: null };
  var chatPoller = null;

  function stopChatPoller(){ if(chatPoller){ clearInterval(chatPoller); chatPoller = null; } }

  var SECTION_LABELS = { chat:'deep_web', grade:'grade', comenzi:'comenzi', actiuni:'actiuni', rulota:'rulota', conturi:'conturi', strikes:'strikes' };

  function setCrumbs(){
    var parts = [{label:'root', go:function(){ stopChatPoller(); state.section=null; state.cat=null; state.item=null; render(); }}];
    if(state.section && SECTION_LABELS[state.section]){
      parts.push({label:SECTION_LABELS[state.section], go:null});
    } else if(state.cat){
      parts.push({label:DATA[state.cat].label.toLowerCase(), go:function(){ stopChatPoller(); state.item=null; render(); }});
      if(state.item) parts.push({label:DATA[state.cat].items[state.item].name.toLowerCase().replace(/\s+/g,'_'), go:null});
    }
    crumbs.innerHTML = '';

    var prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = (currentUser || 'guest_operator') + '@bzone:~$ cd';
    crumbs.appendChild(prompt);

    parts.forEach(function(p){
      var sep = document.createElement('span'); sep.className='sep'; sep.textContent='/';
      crumbs.appendChild(sep);
      var s = document.createElement('span');
      s.textContent = p.label;
      if(p.go){ s.className='seg'; s.addEventListener('click', p.go); }
      else { s.className='cur'; }
      crumbs.appendChild(s);
    });

    var cursor = document.createElement('span');
    cursor.className = 'blink';
    crumbs.appendChild(cursor);

    var logout = document.createElement('span');
    logout.className = 'logout';
    logout.textContent = '⏻ deconectare';
    logout.addEventListener('click', function(){ setToken(null); location.reload(); });
    crumbs.appendChild(logout);
  }

  function render(){
    setCrumbs();
    updateRankPill();
    view.innerHTML = '';
    if(state.section === 'chat'){ renderChat(); }
    else if(state.section === 'grade'){ renderRanks(); }
    else if(state.section === 'comenzi'){ renderOrders(); }
    else if(state.section === 'actiuni'){ renderActions(); }
    else if(state.section === 'rulota'){ renderRulota(); }
    else if(state.section === 'conturi'){ renderAccounts(); }
    else if(state.section === 'strikes'){ renderStrikes(); }
    else if(!state.cat){ renderMenu(); }
    else if(!state.item){ renderCategory(state.cat); }
    else { renderRecipe(state.cat, state.item); }
  }

  function echo(text){
    var e = document.createElement('div');
    e.className = 'cmd-echo';
    e.innerHTML = text;
    view.appendChild(e);
  }

  function errorBanner(container, err){
    var b = document.createElement('div');
    b.className = 'banner' + (err.network ? ' warn' : '');
    b.textContent = err.message || 'eroare necunoscută.';
    container.appendChild(b);
  }

  function card(title, desc, locked, tagText, glyph, tagClass){
    var c = document.createElement('div');
    c.className = 'card' + (locked ? ' locked':'');
    var g = document.createElement('span'); g.className='glyph'; g.textContent = glyph || '▣';
    var h = document.createElement('h3'); h.textContent = title;
    var p = document.createElement('p'); p.textContent = desc;
    c.appendChild(g); c.appendChild(h); c.appendChild(p);
    if(tagText){
      var t = document.createElement('span'); t.className = 'tag' + (tagClass ? ' '+tagClass:''); t.textContent = tagText;
      c.appendChild(t);
    }
    return c;
  }

  function renderMenu(){
    echo('&gt; <b>ls</b> /root');
    var grid = document.createElement('div');
    grid.className = 'grid fade-in';

    var arme = card('ARME', 'Arme de foc disponibile pentru craft.', false, 'disponibil', DATA.arme.glyph);
    arme.addEventListener('click', function(){ state.cat='arme'; render(); });
    grid.appendChild(arme);

    var gloante = card('GLOANTE', 'Muniție pentru arme.', false, 'disponibil', DATA.gloante.glyph);
    gloante.addEventListener('click', function(){ state.cat='gloante'; render(); });
    grid.appendChild(gloante);

    var chat = card('DEEP WEB', 'Canal privat — vorbește cu ceilalți operatori conectați, în timp real.', false, 'live', '◈');
    chat.addEventListener('click', function(){ state.section='chat'; render(); });
    grid.appendChild(chat);

    if(canSeeMembersTab()){
      var grade = card('GRADE', 'Ierarhia organizației — vizibil doar pentru LIDER și THE DIVISION.', false, RANKS[currentRank].label, '★', 'amber');
      grade.addEventListener('click', function(){ state.section='grade'; render(); });
      grid.appendChild(grade);
    }

    var comenzi = card('COMENZI', 'Plasează cereri de echipament pentru aprobare.', false, 'disponibil', '⌘');
    comenzi.addEventListener('click', function(){ state.section='comenzi'; render(); });
    grid.appendChild(comenzi);

    var actiuni = card('ACȚIUNI', 'Evenimente create de conducere — apasă particip.', false, 'live', '⚡', 'cyan');
    actiuni.addEventListener('click', function(){ state.section='actiuni'; render(); });
    grid.appendChild(actiuni);

    var rulota = card('RULOTĂ', 'Cereri de livrare, cu stoc gestionat de conducere.', false, 'disponibil', '✈', 'cyan');
    rulota.addEventListener('click', function(){ state.section='rulota'; render(); });
    grid.appendChild(rulota);

    if(canManageAccounts()){
      var conturi = card('CONTURI', 'Șterge sau blochează conturi înregistrate — strict pentru LIDER.', false, 'lider only', '⛔', 'amber');
      conturi.addEventListener('click', function(){ state.section='conturi'; render(); });
      grid.appendChild(conturi);
    }

    if(canIssueStrikes()){
      var strikes = card('STRIKES', 'Avertismente pentru membri — 3 strike-uri = blocare automată.', false, 'lider + division', '⚠', 'violet');
      strikes.addEventListener('click', function(){ state.section='strikes'; render(); });
      grid.appendChild(strikes);
    }

    view.appendChild(grid);
  }

  function renderCategory(cat){
    var d = DATA[cat];
    echo('&gt; <b>ls</b> /' + d.label.toLowerCase());
    var grid = document.createElement('div');
    grid.className = 'grid fade-in';

    Object.keys(d.items).forEach(function(key){
      var it = d.items[key];
      var c = card(it.name, it.desc, false, 'disponibil', it.glyph);
      c.addEventListener('click', function(){ state.item = key; state.qty = 1; render(); });
      grid.appendChild(c);
    });

    d.soon.forEach(function(label){
      grid.appendChild(card(label, 'Se adaugă în curând la rotație.', true, 'coming soon', '…'));
    });

    view.appendChild(grid);
  }

  function renderRecipe(cat, itemKey){
    var item = DATA[cat].items[itemKey];
    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    echo('&gt; <b>cat</b> reteta.log');

    var head = document.createElement('div');
    head.className = 'recipe-head';
    head.innerHTML = '<div><h2>'+item.name+'</h2><div class="sub">'+item.desc+'</div></div>';

    var qtyBox = document.createElement('div');
    qtyBox.className = 'qty-box';
    qtyBox.innerHTML =
      '<label>CANTITATE CRAFT</label>' +
      '<button id="qty-minus" type="button" aria-label="scade">−</button>' +
      '<input id="qty-input" type="number" min="1" max="99" value="'+state.qty+'">' +
      '<button id="qty-plus" type="button" aria-label="crește">+</button>';
    head.appendChild(qtyBox);
    wrap.appendChild(head);

    var rail = document.createElement('div');
    rail.className = 'steps-rail';
    wrap.appendChild(rail);

    var totalsBox = document.createElement('div');
    totalsBox.className = 'totals';
    wrap.appendChild(totalsBox);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la ' + DATA[cat].label + ')';
    back.addEventListener('click', function(){ state.item=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function draw(){
      rail.innerHTML = '';
      var totals = {};

      item.steps.forEach(function(step){
        var s = document.createElement('div');
        s.className = 'step';
        var lbl = document.createElement('div'); lbl.className='step-label'; lbl.textContent = step.label;
        s.appendChild(lbl);

        var ul = document.createElement('ul'); ul.className='mat-list';
        step.mats.forEach(function(m){
          var val = m.amt * state.qty;
          totals[m.name] = (totals[m.name] || 0) + val;
          var li = document.createElement('li');
          li.innerHTML = '<span>'+m.name+'</span><span class="amt">×'+val+'</span>';
          ul.appendChild(li);
        });
        s.appendChild(ul);

        var y = document.createElement('div'); y.className='yields';
        y.innerHTML = '<span>rezultat</span><b>'+ (step.yields.amt * state.qty) +' &times; '+step.yields.name+'</b>';
        s.appendChild(y);

        rail.appendChild(s);
      });

      totalsBox.innerHTML = '';
      var tl = document.createElement('div'); tl.className='t-label'; tl.textContent = 'TOTAL MATERIALE NECESARE';
      totalsBox.appendChild(tl);
      var tul = document.createElement('ul');
      Object.keys(totals).forEach(function(name){
        var li = document.createElement('li');
        li.innerHTML = '<span>'+name+'</span><span class="amt">×'+totals[name]+'</span>';
        tul.appendChild(li);
      });
      totalsBox.appendChild(tul);
    }
    draw();

    var qtyInput = qtyBox.querySelector('#qty-input');
    qtyBox.querySelector('#qty-minus').addEventListener('click', function(){
      state.qty = Math.max(1, state.qty - 1); qtyInput.value = state.qty; draw();
    });
    qtyBox.querySelector('#qty-plus').addEventListener('click', function(){
      state.qty = Math.min(99, state.qty + 1); qtyInput.value = state.qty; draw();
    });
    qtyInput.addEventListener('input', function(){
      var v = parseInt(qtyInput.value, 10);
      if(isNaN(v) || v < 1) v = 1;
      if(v > 99) v = 99;
      state.qty = v; draw();
    });
  }

  // ================= chat =================
  function renderChat(){
    echo('&gt; <b>connect</b> deep_web/canal_privat &nbsp;<span style="color:var(--text-dim)">(vizibil tuturor operatorilor conectați la server, live)</span>');

    var wrap = document.createElement('div');
    wrap.className = 'fade-in chat-wrap';

    var chatLog = document.createElement('div');
    chatLog.className = 'chat-log';
    chatLog.innerHTML = '<div class="chat-empty">se încarcă mesajele...</div>';
    wrap.appendChild(chatLog);

    var row = document.createElement('div');
    row.className = 'chat-input-row';
    row.innerHTML =
      '<input id="chat-input" type="text" placeholder="scrie un mesaj..." maxlength="500" autocomplete="off">' +
      '<button id="chat-send" type="button">&gt; TRIMITE</button>';
    wrap.appendChild(row);

    var status = document.createElement('div');
    status.className = 'chat-status';
    status.textContent = 'conectat ca ' + currentUser;
    wrap.appendChild(status);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){ stopChatPoller(); if(socket) socket.off('chat:message', onSocketMsg); state.section=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtTime(ts){ var d = new Date(ts); return pad(d.getHours())+':'+pad(d.getMinutes()); }

    var shownIds = {};

    function paint(msgs){
      var wasNearBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 30;
      chatLog.innerHTML = '';
      shownIds = {};
      if(msgs.length === 0){
        chatLog.innerHTML = '<div class="chat-empty">niciun mesaj încă. fii primul.</div>';
      } else {
        msgs.slice(-100).forEach(function(m){
          shownIds[m.id] = true;
          var mDiv = document.createElement('div');
          mDiv.className = 'msg';
          var whoCls = m.user === currentUser ? 'who me' : 'who';
          mDiv.innerHTML =
            '<span class="badge '+m.rank+'">'+RANKS[m.rank].label+'</span>' +
            '<span class="'+whoCls+'">'+m.user+'</span>' +
            '<span class="when">'+fmtTime(m.ts)+'</span>' +
            '<div class="body"></div>';
          mDiv.querySelector('.body').textContent = m.text;
          chatLog.appendChild(mDiv);
        });
      }
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function appendOne(m){
      if(shownIds[m.id]) return;
      shownIds[m.id] = true;
      var wasNearBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 30;
      var empty = chatLog.querySelector('.chat-empty');
      if(empty) empty.remove();
      var mDiv = document.createElement('div');
      mDiv.className = 'msg';
      var whoCls = m.user === currentUser ? 'who me' : 'who';
      mDiv.innerHTML =
        '<span class="badge '+m.rank+'">'+RANKS[m.rank].label+'</span>' +
        '<span class="'+whoCls+'">'+m.user+'</span>' +
        '<span class="when">'+fmtTime(m.ts)+'</span>' +
        '<div class="body"></div>';
      mDiv.querySelector('.body').textContent = m.text;
      chatLog.appendChild(mDiv);
      if(wasNearBottom){ chatLog.scrollTop = chatLog.scrollHeight; }
    }

    async function refresh(){
      try{
        var data = await api_get('/api/chat');
        paint(data.messages);
      }catch(err){
        chatLog.innerHTML = '';
        errorBanner(chatLog, err);
      }
    }
    refresh();

    stopChatPoller();
    chatPoller = setInterval(refresh, 8000); // fallback dacă live update prin socket eșuează

    function onSocketMsg(m){ appendOne(m); }
    if(socket) socket.on('chat:message', onSocketMsg);

    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');

    async function send(){
      var text = input.value.trim();
      if(!text) return;
      sendBtn.disabled = true;
      var prevVal = text;
      input.value = '';
      try{
        await api_post('/api/chat', { text: text });
        status.textContent = 'conectat ca ' + currentUser;
        status.className = 'chat-status';
      }catch(err){
        input.value = prevVal;
        status.textContent = err.message;
        status.className = 'chat-status err';
      }finally{
        sendBtn.disabled = false;
      }
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); send(); }
    });
  }

  // ================= grade (ranks) =================
  function renderRanks(){
    echo('&gt; <b>cat</b> /grade/ierarhie.log');

    if(!canSeeMembersTab()){
      var denied = document.createElement('div');
      denied.className = 'fade-in';
      denied.innerHTML = '<div class="banner">acces interzis — tabul de membri e vizibil doar pentru LIDER și THE DIVISION.</div>';
      var backD = document.createElement('div');
      backD.className = 'back-link';
      backD.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
      backD.addEventListener('click', function(){ state.section=null; render(); });
      denied.appendChild(backD);
      view.appendChild(denied);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    var tableLabel = document.createElement('div');
    tableLabel.className = 'section-label';
    tableLabel.textContent = 'IERARHIE OPERATORI' + (canManageRanks() ? ' — editabil' : ' — vizualizare');
    wrap.appendChild(tableLabel);

    var table = document.createElement('div');
    table.className = 'rank-table';
    table.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(table);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){ state.section=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    async function load(){
      var data;
      try{
        data = await api_get('/api/ranks');
      }catch(err){
        table.innerHTML = '';
        errorBanner(table, err);
        return;
      }
      var meEntry = data.ranks.find(function(r){ return r.email === currentUser; });
      if(meEntry){ currentRank = meEntry.rank; updateRankPill(); }

      table.innerHTML = '';
      if(data.ranks.length === 0){
        table.innerHTML = '<div class="empty-note">niciun operator înregistrat.</div>';
        return;
      }

      data.ranks.forEach(function(entry){
        var row = document.createElement('div');
        row.className = 'rank-row';

        var who = document.createElement('span');
        who.className = 'who' + (entry.email === currentUser ? ' me' : '');
        who.textContent = entry.email;
        row.appendChild(who);

        var canEdit = canManageRanks();
        var options = ['membru','coordonator','colider','divizie','lider'];

        if(canEdit){
          var sel = document.createElement('select');
          options.forEach(function(r){
            var opt = document.createElement('option');
            opt.value = r; opt.textContent = RANKS[r].label;
            if(r === entry.rank) opt.selected = true;
            sel.appendChild(opt);
          });
          row.appendChild(sel);

          var saveBtn = document.createElement('button');
          saveBtn.className = 'save-rank';
          saveBtn.type = 'button';
          saveBtn.textContent = 'salvează';
          saveBtn.addEventListener('click', async function(){
            saveBtn.disabled = true;
            try{
              await api_put('/api/ranks/' + encodeURIComponent(entry.email), { rank: sel.value });
            }catch(err){
              alert(err.message);
            }
            await load();
          });
          row.appendChild(saveBtn);
        } else {
          var badge = document.createElement('span');
          badge.className = 'rank-badge ' + entry.rank;
          badge.textContent = RANKS[entry.rank].label;
          row.appendChild(badge);
        }

        table.appendChild(row);
      });
    }
    load();
  }

  // ================= conturi (ștergere / blocare) — strict lider =================
  function renderAccounts(){
    echo('&gt; <b>cat</b> /conturi/registru.log');

    if(!canManageAccounts()){
      var denied = document.createElement('div');
      denied.className = 'fade-in';
      denied.innerHTML = '<div class="banner">acces interzis — tabul de conturi e vizibil doar pentru LIDER.</div>';
      var backD = document.createElement('div');
      backD.className = 'back-link';
      backD.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
      backD.addEventListener('click', function(){ state.section=null; render(); });
      denied.appendChild(backD);
      view.appendChild(denied);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    var warnLabel = document.createElement('div');
    warnLabel.className = 'section-label amber-red';
    warnLabel.textContent = 'GESTIONARE CONTURI — acțiuni ireversibile';
    wrap.appendChild(warnLabel);

    var table = document.createElement('div');
    table.className = 'acc-table';
    table.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(table);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){ state.section=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtDate(ts){ var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear(); }

    async function load(){
      var data;
      try{
        data = await api_get('/api/accounts');
      }catch(err){
        table.innerHTML = ''; errorBanner(table, err);
        return;
      }
      table.innerHTML = '';
      if(data.accounts.length === 0){
        table.innerHTML = '<div class="empty-note">niciun cont înregistrat.</div>';
        return;
      }
      data.accounts.forEach(function(acc){
        var row = document.createElement('div');
        row.className = 'acc-row' + (acc.blocked ? ' blocked' : '');

        var info = document.createElement('div');
        info.className = 'acc-info';
        info.innerHTML =
          '<span class="acc-email' + (acc.email === currentUser ? ' me' : '') + '">'+acc.email+'</span>' +
          '<span class="rank-badge ' + acc.rank + '">'+RANKS[acc.rank].label+'</span>' +
          '<span class="acc-date">creat '+fmtDate(acc.created_at)+'</span>' +
          (acc.blocked ? '<span class="acc-flag">BLOCAT</span>' : '');
        row.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'acc-actions';

        var note = document.createElement('span'); note.className='err-note';

        if(acc.email !== currentUser){
          var blockBtn = document.createElement('button');
          blockBtn.className = acc.blocked ? 'unblock' : 'block';
          blockBtn.textContent = acc.blocked ? 'deblochează' : 'blochează';
          blockBtn.addEventListener('click', async function(){
            blockBtn.disabled = true;
            try{
              await api_post('/api/accounts/' + encodeURIComponent(acc.email) + '/block', { blocked: !acc.blocked });
              await load();
            }catch(err){
              note.textContent = err.message;
              blockBtn.disabled = false;
            }
          });
          actions.appendChild(blockBtn);

          var delBtn = document.createElement('button');
          delBtn.className = 'del';
          delBtn.textContent = 'șterge cont';
          delBtn.addEventListener('click', async function(){
            if(!confirm('sigur ștergi definitiv contul ' + acc.email + '? acțiunea nu poate fi anulată.')) return;
            delBtn.disabled = true;
            try{
              await api_del('/api/accounts/' + encodeURIComponent(acc.email));
              await load();
            }catch(err){
              note.textContent = err.message;
              delBtn.disabled = false;
            }
          });
          actions.appendChild(delBtn);
        } else {
          var meNote = document.createElement('span');
          meNote.className = 'acc-me-note';
          meNote.textContent = '(contul tău)';
          actions.appendChild(meNote);
        }

        actions.appendChild(note);
        row.appendChild(actions);
        table.appendChild(row);
      });
    }
    load();
  }

  // ================= strikes (avertismente) — lider + the division =================
  function renderStrikes(){
    echo('&gt; <b>cat</b> /strikes/disciplina.log');

    if(!canIssueStrikes()){
      var denied = document.createElement('div');
      denied.className = 'fade-in';
      denied.innerHTML = '<div class="banner">acces interzis — tabul de strike-uri e vizibil doar pentru LIDER și THE DIVISION.</div>';
      var backD = document.createElement('div');
      backD.className = 'back-link';
      backD.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
      backD.addEventListener('click', function(){ state.section=null; render(); });
      denied.appendChild(backD);
      view.appendChild(denied);
      return;
    }

    var STRIKE_THRESHOLD = 3;

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    var formLabel = document.createElement('div');
    formLabel.className = 'section-label violet';
    formLabel.textContent = 'ACORDĂ UN STRIKE';
    wrap.appendChild(formLabel);

    var formBox = document.createElement('div');
    formBox.className = 'strike-form';
    formBox.innerHTML =
      '<div class="field"><label>MEMBRU</label><select id="strike-target"><option value="">se încarcă...</option></select></div>' +
      '<div class="field"><label>MOTIV</label><textarea id="strike-reason" rows="2" maxlength="300" placeholder="ex: lipsă nejustificată de la acțiune"></textarea></div>' +
      '<div class="chat-status" id="strike-msg"></div>' +
      '<button id="strike-submit" type="button">&gt; ACORDĂ STRIKE</button>';
    wrap.appendChild(formBox);

    var listLabel = document.createElement('div');
    listLabel.className = 'section-label violet';
    listLabel.textContent = 'ISTORIC STRIKE-URI PE MEMBRU';
    wrap.appendChild(listLabel);

    var table = document.createElement('div');
    table.className = 'strike-table';
    table.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(table);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){
      if(socket) socket.off('strikes:changed', onStrikesChanged);
      state.section=null; render();
    });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtTime(ts){ var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }

    var members = [];

    async function loadTargets(){
      var sel = document.getElementById('strike-target');
      try{
        var data = await api_get('/api/ranks');
        members = data.ranks.filter(function(m){ return m.rank !== 'lider' && m.email !== currentUser; });
        sel.innerHTML = '';
        if(members.length === 0){
          sel.innerHTML = '<option value="">niciun membru disponibil</option>';
          return;
        }
        members.forEach(function(m){
          var opt = document.createElement('option');
          opt.value = m.email;
          opt.textContent = m.email + ' — ' + RANKS[m.rank].label;
          sel.appendChild(opt);
        });
      }catch(err){
        sel.innerHTML = '<option value="">eroare la încărcare</option>';
      }
    }

    async function load(){
      var data;
      try{
        data = await api_get('/api/strikes');
      }catch(err){
        table.innerHTML = ''; errorBanner(table, err);
        return;
      }
      var byUser = {};
      data.strikes.forEach(function(s){
        (byUser[s.user_email] = byUser[s.user_email] || []).push(s);
      });

      table.innerHTML = '';
      var emails = Object.keys(byUser).sort();
      if(emails.length === 0){
        table.innerHTML = '<div class="empty-note">niciun strike acordat până acum.</div>';
        return;
      }

      emails.forEach(function(email){
        var strikesForUser = byUser[email];
        var count = strikesForUser.length;
        var group = document.createElement('div');
        group.className = 'strike-group';

        var head = document.createElement('div');
        head.className = 'strike-head';
        var countCls = count >= STRIKE_THRESHOLD ? 'sev-high' : (count === STRIKE_THRESHOLD - 1 ? 'sev-mid' : 'sev-low');
        head.innerHTML =
          '<span class="strike-who">'+email+'</span>' +
          '<span class="strike-count '+countCls+'">'+count+' / '+STRIKE_THRESHOLD+'</span>' +
          (count >= STRIKE_THRESHOLD ? '<span class="acc-flag">CONT BLOCAT AUTOMAT</span>' : '');
        group.appendChild(head);

        strikesForUser.sort(function(a,b){ return b.ts - a.ts; }).forEach(function(s){
          var row = document.createElement('div');
          row.className = 'strike-row';
          var info = document.createElement('div');
          info.className = 'strike-info';
          info.innerHTML =
            '<span class="strike-reason"></span>' +
            '<span class="strike-meta">acordat de '+s.issued_by+' · '+fmtTime(s.ts)+'</span>';
          info.querySelector('.strike-reason').textContent = s.reason;
          row.appendChild(info);

          if(canRemoveStrike()){
            var del = document.createElement('button');
            del.className = 'strike-del';
            del.textContent = 'anulează';
            del.addEventListener('click', async function(){
              if(!confirm('anulezi acest strike acordat lui ' + email + '?')) return;
              del.disabled = true;
              try{
                await api_del('/api/strikes/' + s.id);
                await load();
              }catch(err){
                alert(err.message);
                del.disabled = false;
              }
            });
            row.appendChild(del);
          }

          group.appendChild(row);
        });

        table.appendChild(group);
      });
    }

    function onStrikesChanged(){ load(); }
    if(socket) socket.on('strikes:changed', onStrikesChanged);

    loadTargets();
    load();

    var submitBtn = document.getElementById('strike-submit');
    submitBtn.addEventListener('click', async function(){
      var msg = document.getElementById('strike-msg');
      var target = document.getElementById('strike-target').value;
      var reasonInput = document.getElementById('strike-reason');
      var reason = reasonInput.value.trim();
      if(!target){ msg.textContent = 'alege un membru.'; msg.className = 'chat-status err'; return; }
      if(!reason){ msg.textContent = 'motivul e obligatoriu.'; msg.className = 'chat-status err'; return; }

      submitBtn.disabled = true;
      msg.textContent = 'se trimite...'; msg.className = 'chat-status';
      try{
        var data = await api_post('/api/strikes', { email: target, reason: reason });
        reasonInput.value = '';
        if(data.autoBlocked){
          msg.textContent = 'strike acordat (' + data.total + '/' + data.threshold + ') — pragul a fost atins, contul a fost blocat automat.';
        } else {
          msg.textContent = 'strike acordat (' + data.total + '/' + data.threshold + ').';
        }
        msg.className = 'chat-status ok';
        await load();
      }catch(err){
        msg.textContent = err.message; msg.className = 'chat-status err';
      }finally{
        submitBtn.disabled = false;
      }
    });
  }

  // ================= comenzi + stoc =================
  function renderOrders(){
    echo('&gt; <b>cat</b> /comenzi/catalog.log');

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    var stockLabel = document.createElement('div');
    stockLabel.className = 'section-label';
    stockLabel.textContent = 'STOC DISPONIBIL' + (canEditStock() ? ' — editabil de lider' : '');
    wrap.appendChild(stockLabel);

    var stockBox = document.createElement('div');
    stockBox.className = 'stock-box';
    stockBox.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(stockBox);

    var formLabel = document.createElement('div');
    formLabel.className = 'section-label';
    formLabel.textContent = 'PLASEAZĂ O COMANDĂ';
    wrap.appendChild(formLabel);

    var formBox = document.createElement('div');
    formBox.className = 'order-form';

    var optGrid = document.createElement('div');
    optGrid.className = 'order-grid';
    formBox.appendChild(optGrid);

    var orow = document.createElement('div');
    orow.className = 'order-row';
    orow.innerHTML =
      '<label>CANTITATE</label>' +
      '<input type="number" id="order-qty" min="1" value="1">' +
      '<button class="order-submit" id="order-submit" type="button">&gt; TRIMITE COMANDĂ</button>';
    formBox.appendChild(orow);

    var formMsg = document.createElement('div');
    formMsg.className = 'chat-status';
    formBox.appendChild(formMsg);

    wrap.appendChild(formBox);

    var myLabel = document.createElement('div');
    myLabel.className = 'section-label';
    myLabel.textContent = 'COMENZILE MELE';
    wrap.appendChild(myLabel);

    var myList = document.createElement('div');
    myList.className = 'order-list';
    myList.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(myList);

    var pendingLabel, pendingList;
    if(canViewPending()){
      pendingLabel = document.createElement('div');
      pendingLabel.className = 'section-label';
      pendingLabel.textContent = 'COMENZI ÎN AȘTEPTARE — TOATĂ ORGANIZAȚIA' + (isDivision() ? ' (vizualizare)' : '');
      wrap.appendChild(pendingLabel);

      pendingList = document.createElement('div');
      pendingList.className = 'order-list';
      pendingList.innerHTML = '<div class="empty-note">se încarcă...</div>';
      wrap.appendChild(pendingList);
    }

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){ state.section=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtTime(ts){ var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
    function statusLabel(s){ if(s==='aprobat') return 'APROBAT'; if(s==='respins') return 'RESPINS'; return 'ÎN AȘTEPTARE'; }

    var currentStock = {};

    function drawStock(){
      stockBox.innerHTML = '';
      ORDER_CATALOG.forEach(function(item){
        var row = document.createElement('div');
        row.className = 'stock-row';
        var name = document.createElement('span'); name.className='name'; name.textContent = item.name;
        row.appendChild(name);
        if(canEditStock()){
          var input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.value = currentStock[item.id];
          row.appendChild(input);
          var saveBtn = document.createElement('button');
          saveBtn.type = 'button'; saveBtn.textContent = 'salvează';
          saveBtn.addEventListener('click', async function(){
            var v = parseInt(input.value, 10);
            if(isNaN(v) || v < 0) v = 0;
            saveBtn.disabled = true;
            try{
              var data = await api_put('/api/orders/stock/' + item.id, { qty: v });
              currentStock = data.stock;
            }catch(err){ alert(err.message); }
            saveBtn.disabled = false;
            drawStock(); drawOptions();
          });
          row.appendChild(saveBtn);
        } else {
          var cur = document.createElement('span'); cur.className='cur'; cur.textContent = currentStock[item.id] + ' buc.';
          row.appendChild(cur);
        }
        stockBox.appendChild(row);
      });
    }

    function drawOptions(){
      optGrid.innerHTML = '';
      if(!state.selectedOrder && ORDER_CATALOG.length) state.selectedOrder = ORDER_CATALOG[0].id;
      ORDER_CATALOG.forEach(function(item){
        var stock = currentStock[item.id] || 0;
        var opt = document.createElement('div');
        opt.className = 'order-opt' + (state.selectedOrder === item.id ? ' sel' : '') + (stock <= 0 ? ' disabled' : '');
        opt.innerHTML =
          '<div class="glyph">'+item.glyph+'</div>' +
          '<div class="name">'+item.name+'</div>' +
          '<div class="price">'+fmtMoney(item.price)+'</div>' +
          '<div class="avail">stoc: '+stock+'</div>';
        if(stock > 0){
          opt.addEventListener('click', function(){
            state.selectedOrder = item.id;
            drawOptions();
          });
        }
        optGrid.appendChild(opt);
      });
      var qtyInput = document.getElementById('order-qty');
      var selStock = currentStock[state.selectedOrder] || 0;
      qtyInput.max = Math.max(1, selStock);
    }

    async function refreshLists(){
      try{
        var mineData = await api_get('/api/orders/mine');
        var mine = mineData.orders;
        myList.innerHTML = '';
        if(mine.length === 0){
          myList.innerHTML = '<div class="empty-note">nu ai plasat nicio comandă încă.</div>';
        } else {
          mine.forEach(function(o){
            var row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML =
              '<span class="what">'+o.item_name+' ×'+o.qty+'</span>' +
              '<span class="price">'+fmtMoney(o.price * o.qty)+'</span>' +
              '<span class="when">'+fmtTime(o.ts)+'</span>' +
              '<span class="order-status '+o.status+'">'+statusLabel(o.status)+'</span>';
            myList.appendChild(row);
          });
        }
      }catch(err){
        myList.innerHTML = ''; errorBanner(myList, err);
      }

      if(pendingList){
        try{
          var pendingData = await api_get('/api/orders/pending');
          var pending = pendingData.orders;
          pendingList.innerHTML = '';
          if(pending.length === 0){
            pendingList.innerHTML = '<div class="empty-note">nicio comandă în așteptare.</div>';
          } else {
            pending.forEach(function(o){
              var row = document.createElement('div');
              row.className = 'order-item';
              row.innerHTML =
                '<span class="who">'+o.user_email+'</span>' +
                '<span class="what">'+o.item_name+' ×'+o.qty+'</span>' +
                '<span class="price">'+fmtMoney(o.price * o.qty)+'</span>' +
                '<span class="when">'+fmtTime(o.ts)+'</span>';
              if(canDecideOrders()){
                var actions = document.createElement('div');
                actions.className = 'order-actions';
                var note = document.createElement('span'); note.className='err-note';
                var acc = document.createElement('button'); acc.className='accept'; acc.textContent='acceptă';
                var rej = document.createElement('button'); rej.className='reject'; rej.textContent='respinge';
                acc.addEventListener('click', function(){ decide(o.id, 'aprobat', note); });
                rej.addEventListener('click', function(){ decide(o.id, 'respins', note); });
                actions.appendChild(note); actions.appendChild(acc); actions.appendChild(rej);
                row.appendChild(actions);
              }
              pendingList.appendChild(row);
            });
          }
        }catch(err){
          pendingList.innerHTML = ''; errorBanner(pendingList, err);
        }
      }
    }

    async function decide(orderId, decision, noteEl){
      try{
        var data = await api_post('/api/orders/' + orderId + '/decide', { decision: decision });
        currentStock = data.stock;
        drawStock(); drawOptions();
      }catch(err){
        if(noteEl) noteEl.textContent = err.message;
        return;
      }
      await refreshLists();
    }

    (async function init(){
      try{
        var catData = await api_get('/api/orders/catalog');
        ORDER_CATALOG = catData.catalog;
        var stockData = await api_get('/api/orders/stock');
        currentStock = stockData.stock;
      }catch(err){
        stockBox.innerHTML = ''; errorBanner(stockBox, err);
        return;
      }
      drawStock();
      drawOptions();
      await refreshLists();
    })();

    var submitBtn = document.getElementById('order-submit');
    submitBtn.addEventListener('click', async function(){
      var item = ORDER_CATALOG.find(function(i){ return i.id === state.selectedOrder; });
      if(!item) return;
      var qtyInput = document.getElementById('order-qty');
      var qty = parseInt(qtyInput.value, 10);
      if(isNaN(qty) || qty < 1) qty = 1;

      submitBtn.disabled = true;
      formMsg.textContent = 'se trimite...';
      formMsg.className = 'chat-status';
      try{
        await api_post('/api/orders', { itemId: item.id, qty: qty });
        formMsg.textContent = 'comandă trimisă — în așteptarea aprobării.';
        formMsg.className = 'chat-status ok';
        var stockData = await api_get('/api/orders/stock');
        currentStock = stockData.stock;
        drawStock(); drawOptions();
        await refreshLists();
      }catch(err){
        formMsg.textContent = err.message;
        formMsg.className = 'chat-status err';
      }finally{
        submitBtn.disabled = false;
      }
    });
  }

  // ================= actiuni (events) =================
  function renderActions(){
    echo('&gt; <b>cat</b> /actiuni/board.log');

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    if(canManageOps()){
      var newLabel = document.createElement('div');
      newLabel.className = 'section-label cy';
      newLabel.textContent = 'CREEAZĂ O ACȚIUNE NOUĂ';
      wrap.appendChild(newLabel);

      var form = document.createElement('div');
      form.className = 'new-action-form';
      form.innerHTML =
        '<div class="field"><label>TITLU</label><input id="act-title" type="text" maxlength="80" placeholder="ex: Jaf la depozit"></div>' +
        '<div class="field"><label>ORĂ / DATĂ (opțional)</label><input id="act-time" type="text" maxlength="40" placeholder="ex: azi 22:00"></div>' +
        '<div class="field"><label>DETALII</label><textarea id="act-desc" rows="3" maxlength="400" placeholder="descriere, loc de întâlnire, cerințe..."></textarea></div>' +
        '<div class="chat-status" id="act-msg"></div>' +
        '<button id="act-submit" type="button">&gt; PUBLICĂ ACȚIUNEA</button>';
      wrap.appendChild(form);
    }

    var listLabel = document.createElement('div');
    listLabel.className = 'section-label cy';
    listLabel.textContent = 'ACȚIUNI ACTIVE';
    wrap.appendChild(listLabel);

    var list = document.createElement('div');
    list.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(list);

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){
      if(socket){ socket.off('actions:new', onActionsChanged); socket.off('actions:update', onActionsChanged); socket.off('actions:delete', onActionsChanged); }
      state.section=null; render();
    });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtTime(ts){ var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }

    async function refresh(){
      var data;
      try{
        data = await api_get('/api/actions');
      }catch(err){
        list.innerHTML = ''; errorBanner(list, err);
        return;
      }
      var actionsList = data.actions;
      list.innerHTML = '';
      if(actionsList.length === 0){
        list.innerHTML = '<div class="empty-note">nicio acțiune publicată încă.</div>';
        return;
      }
      actionsList.forEach(function(a){
        var c = document.createElement('div');
        c.className = 'action-card';
        var joined = a.participants.indexOf(currentUser) !== -1;
        c.innerHTML =
          '<div class="a-top"><div><div class="a-title">'+a.title+'</div>' +
          (a.time_label ? '<div class="a-time">'+a.time_label+'</div>' : '') + '</div></div>' +
          '<div class="a-desc"></div>' +
          '<div class="a-meta">publicat de '+a.created_by+' · '+fmtTime(a.ts)+'</div>' +
          '<div class="a-participants"><b>'+a.participants.length+'</b> participanți'+(a.participants.length ? ': '+a.participants.join(', ') : '')+'</div>' +
          '<div class="a-bottom"></div>';
        c.querySelector('.a-desc').textContent = a.description || '';
        var bottom = c.querySelector('.a-bottom');
        var joinBtn = document.createElement('button');
        joinBtn.className = 'join-btn' + (joined ? ' joined' : '');
        joinBtn.textContent = joined ? '✓ PARTICIP' : '+ PARTICIP';
        joinBtn.addEventListener('click', async function(){
          joinBtn.disabled = true;
          try{ await api_post('/api/actions/' + a.id + '/join'); }catch(err){ alert(err.message); }
          await refresh();
        });
        bottom.appendChild(joinBtn);

        if(canManageOps()){
          var del = document.createElement('button');
          del.className = 'del-btn';
          del.textContent = 'șterge';
          del.addEventListener('click', async function(){
            try{ await api_del('/api/actions/' + a.id); }catch(err){ alert(err.message); }
            await refresh();
          });
          bottom.appendChild(del);
        }
        list.appendChild(c);
      });
    }
    refresh();

    function onActionsChanged(){ refresh(); }
    if(socket){
      socket.on('actions:new', onActionsChanged);
      socket.on('actions:update', onActionsChanged);
      socket.on('actions:delete', onActionsChanged);
    }

    if(canManageOps()){
      var submitBtn = document.getElementById('act-submit');
      var msg = document.getElementById('act-msg');
      submitBtn.addEventListener('click', async function(){
        var title = document.getElementById('act-title').value.trim();
        var time = document.getElementById('act-time').value.trim();
        var desc = document.getElementById('act-desc').value.trim();
        if(!title){ msg.textContent = 'titlul e obligatoriu.'; msg.className = 'chat-status err'; return; }
        submitBtn.disabled = true;
        try{
          await api_post('/api/actions', { title: title, time: time, desc: desc });
          document.getElementById('act-title').value = '';
          document.getElementById('act-time').value = '';
          document.getElementById('act-desc').value = '';
          msg.textContent = 'acțiune publicată.'; msg.className = 'chat-status ok';
          await refresh();
        }catch(err){
          msg.textContent = err.message; msg.className = 'chat-status err';
        }finally{
          submitBtn.disabled = false;
        }
      });
    }
  }

  // ================= rulotă (delivery requests) =================
  function renderRulota(){
    echo('&gt; <b>cat</b> /rulota/livrari.log');

    var wrap = document.createElement('div');
    wrap.className = 'fade-in';

    var stockLabel = document.createElement('div');
    stockLabel.className = 'section-label cy';
    stockLabel.textContent = 'STOC LIVRĂRI DISPONIBILE' + (canEditStock() ? ' — editabil' : '');
    wrap.appendChild(stockLabel);

    var stockBox = document.createElement('div');
    stockBox.className = 'stock-box';
    stockBox.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(stockBox);

    var formLabel = document.createElement('div');
    formLabel.className = 'section-label cy';
    formLabel.textContent = 'TRIMITE O CERERE DE LIVRARE';
    wrap.appendChild(formLabel);

    var formBox = document.createElement('div');
    formBox.className = 'order-form';
    formBox.innerHTML =
      '<div class="order-row" style="margin-bottom:14px;">' +
      '<label>CANTITATE</label><input type="number" id="rul-qty" min="1" value="1">' +
      '<input type="text" id="rul-note" placeholder="notă (opțional)" maxlength="120" style="flex:1;">' +
      '<button class="order-submit" id="rul-submit" type="button">&gt; TRIMITE CEREREA</button>' +
      '</div>' +
      '<div class="chat-status" id="rul-msg"></div>';
    wrap.appendChild(formBox);

    var myLabel = document.createElement('div');
    myLabel.className = 'section-label cy';
    myLabel.textContent = 'CERERILE MELE';
    wrap.appendChild(myLabel);

    var myList = document.createElement('div');
    myList.className = 'order-list';
    myList.innerHTML = '<div class="empty-note">se încarcă...</div>';
    wrap.appendChild(myList);

    var pendingLabel, pendingList;
    if(canViewPending()){
      pendingLabel = document.createElement('div');
      pendingLabel.className = 'section-label cy';
      pendingLabel.textContent = 'CERERI ÎN AȘTEPTARE' + (isDivision() ? ' (vizualizare)' : '');
      wrap.appendChild(pendingLabel);

      pendingList = document.createElement('div');
      pendingList.className = 'order-list';
      pendingList.innerHTML = '<div class="empty-note">se încarcă...</div>';
      wrap.appendChild(pendingList);
    }

    var back = document.createElement('div');
    back.className = 'back-link';
    back.innerHTML = '<span>$</span> cd .. &nbsp;(înapoi la root)';
    back.addEventListener('click', function(){ state.section=null; render(); });
    wrap.appendChild(back);

    view.appendChild(wrap);

    function fmtTime(ts){ var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
    function statusLabel(s){ if(s==='aprobat') return 'APROBAT'; if(s==='respins') return 'RESPINS'; return 'ÎN AȘTEPTARE'; }

    var stockVal = 0;

    function drawStock(){
      stockBox.innerHTML = '';
      var row = document.createElement('div');
      row.className = 'stock-row';
      var name = document.createElement('span'); name.className='name'; name.textContent = 'Unități disponibile pentru livrare';
      row.appendChild(name);
      if(canEditStock()){
        var input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.value = stockVal;
        row.appendChild(input);
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button'; saveBtn.textContent = 'salvează';
        saveBtn.addEventListener('click', async function(){
          var v = parseInt(input.value, 10);
          if(isNaN(v) || v < 0) v = 0;
          saveBtn.disabled = true;
          try{
            await api_put('/api/rulota/stock', { qty: v });
            stockVal = v;
          }catch(err){ alert(err.message); }
          saveBtn.disabled = false;
          drawStock();
        });
        row.appendChild(saveBtn);
      } else {
        var cur = document.createElement('span'); cur.className='cur'; cur.textContent = stockVal + ' buc.';
        row.appendChild(cur);
      }
      stockBox.appendChild(row);
    }

    async function refreshLists(){
      try{
        var mineData = await api_get('/api/rulota/mine');
        var mine = mineData.requests;
        myList.innerHTML = '';
        if(mine.length === 0){
          myList.innerHTML = '<div class="empty-note">nu ai trimis nicio cerere încă.</div>';
        } else {
          mine.forEach(function(r){
            var row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML =
              '<span class="what">×'+r.qty+(r.note ? ' — '+r.note : '')+'</span>' +
              '<span class="when">'+fmtTime(r.ts)+'</span>' +
              '<span class="order-status '+r.status+'">'+statusLabel(r.status)+'</span>';
            myList.appendChild(row);
          });
        }
      }catch(err){
        myList.innerHTML = ''; errorBanner(myList, err);
      }

      if(pendingList){
        try{
          var pendingData = await api_get('/api/rulota/pending');
          var pending = pendingData.requests;
          pendingList.innerHTML = '';
          if(pending.length === 0){
            pendingList.innerHTML = '<div class="empty-note">nicio cerere în așteptare.</div>';
          } else {
            pending.forEach(function(r){
              var row = document.createElement('div');
              row.className = 'order-item';
              row.innerHTML =
                '<span class="who">'+r.user_email+'</span>' +
                '<span class="what">×'+r.qty+(r.note ? ' — '+r.note : '')+'</span>' +
                '<span class="when">'+fmtTime(r.ts)+'</span>';
              if(canDecideOrders()){
                var actions = document.createElement('div');
                actions.className = 'order-actions';
                var note = document.createElement('span'); note.className='err-note';
                var acc = document.createElement('button'); acc.className='accept'; acc.textContent='acceptă';
                var rej = document.createElement('button'); rej.className='reject'; rej.textContent='respinge';
                acc.addEventListener('click', function(){ decide(r.id, 'aprobat', note); });
                rej.addEventListener('click', function(){ decide(r.id, 'respins', note); });
                actions.appendChild(note); actions.appendChild(acc); actions.appendChild(rej);
                row.appendChild(actions);
              }
              pendingList.appendChild(row);
            });
          }
        }catch(err){
          pendingList.innerHTML = ''; errorBanner(pendingList, err);
        }
      }
    }

    async function decide(reqId, decision, noteEl){
      try{
        var data = await api_post('/api/rulota/' + reqId + '/decide', { decision: decision });
        stockVal = data.stockQty;
        drawStock();
      }catch(err){
        if(noteEl) noteEl.textContent = err.message;
        return;
      }
      await refreshLists();
    }

    (async function init(){
      try{
        var stockData = await api_get('/api/rulota/stock');
        stockVal = stockData.qty;
      }catch(err){
        stockBox.innerHTML = ''; errorBanner(stockBox, err);
        return;
      }
      drawStock();
      await refreshLists();
    })();

    var submitBtn = document.getElementById('rul-submit');
    submitBtn.addEventListener('click', async function(){
      var msg = document.getElementById('rul-msg');
      var qtyInput = document.getElementById('rul-qty');
      var noteInput = document.getElementById('rul-note');
      var qty = parseInt(qtyInput.value, 10);
      if(isNaN(qty) || qty < 1) qty = 1;

      submitBtn.disabled = true;
      msg.textContent = 'se trimite...'; msg.className = 'chat-status';
      try{
        await api_post('/api/rulota', { qty: qty, note: noteInput.value.trim() });
        msg.textContent = 'cerere trimisă — în așteptarea aprobării.'; msg.className = 'chat-status ok';
        noteInput.value = '';
        await refreshLists();
      }catch(err){
        msg.textContent = err.message; msg.className = 'chat-status err';
      }finally{
        submitBtn.disabled = false;
      }
    });
  }
})();
