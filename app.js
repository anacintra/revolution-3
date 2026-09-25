
const DATA=window.REV3_DATA;
const LS='revolution3_state_v1', ANNO='revolution3_annotations_v1';
const letters=['A','B','C','D','E'];
let route='home', sessionTimer=null;
let anno={active:false,tool:'pen',color:'#1769e0',visible:true,drawing:false,current:null,redo:{}};
const app=document.getElementById('app'), modal=document.getElementById('modal'), modalCard=document.getElementById('modalCard');

function blankState(){
  return {version:3,profile:{modality:'AC',theme:'light',activeExamId:DATA.defaultExamId||Object.keys(DATA.exams)[0]},
    attempts:[],qstats:{},errors:{},flags:{},currentSession:null,lastBackup:null};
}
function composite(examId,n){return `${examId}:${n}`}
function migrateAnnotations(raw){
  const out={};
  Object.entries(raw||{}).forEach(([k,v])=>out[k.includes(':')?k:composite('fuvest-2026-v1',k)]=v);
  return out;
}
function migrateState(raw){
  const s=Object.assign(blankState(),raw||{});
  if(!s.profile)s.profile={};
  s.profile.modality=s.profile.modality||'AC';
  s.profile.activeExamId=s.profile.activeExamId||DATA.defaultExamId||Object.keys(DATA.exams)[0];
  if((raw?.version||1)<2){
    const eid='fuvest-2026-v1';
    const remap=obj=>{
      const out={};
      Object.entries(obj||{}).forEach(([k,v])=>out[k.includes(':')?k:composite(eid,k)]=v);
      return out;
    };
    s.qstats=remap(raw?.qstats);
    s.errors=remap(raw?.errors);
    s.flags=remap(raw?.flags);
    s.attempts=(raw?.attempts||[]).map(a=>Object.assign({examId:eid},a));
    if(raw?.currentSession)s.currentSession=Object.assign({examId:eid},raw.currentSession);
  }
  s.version=2;
  return s;
}
let S=(()=>{try{return migrateState(JSON.parse(localStorage.getItem(LS))||{})}catch(e){return blankState()}})();
let A=(()=>{try{return migrateAnnotations(JSON.parse(localStorage.getItem(ANNO))||{})}catch(e){return{}}})();
save(); saveAnno();

function save(){localStorage.setItem(LS,JSON.stringify(S))}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmt(sec){sec=Math.max(0,Math.floor(sec));let h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return[h,m,s].map(x=>String(x).padStart(2,'0')).join(':')}
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1700)}
function exam(id){return DATA.exams[id||S.profile.activeExamId]||DATA.exams[DATA.defaultExamId]}
function activeExam(){return exam()}
function q(n,eid){return exam(eid).questions[n-1]}
function stats(n,eid){const k=composite(eid||S.profile.activeExamId,n);return S.qstats[k]||(S.qstats[k]={correct:0,wrong:0,sure:0,between:0,guessed:0,seen:0,last:null})}
function cutoff(eid){const e=exam(eid);return e.cutoffs[S.profile.modality]||e.cutoffs.AC}
function examLabel(eid){return exam(eid).exam.title}
function bottomNav(active){return `<nav class="bottom-nav">${[['home','⌂','Início'],['exam','▣','Provas'],['errors','↻','Erros'],['analytics','▥','Desempenho'],['settings','⚙','Ajustes']].map(x=>`<button class="nav-btn ${active===x[0]?'active':''}" data-route="${x[0]}"><span>${x[1]}</span>${x[2]}</button>`).join('')}</nav>`}
function shell(content,active='home'){app.innerHTML=`<div class="app-shell"><header class="topbar"><div class="brand"><div class="logo">R</div><div>REVOLUTION<small>2.0 • FUVEST</small></div></div><div class="top-actions"><button class="icon-btn" id="themeBtn" title="Tema">◐</button></div></header><main class="page">${content}</main>${bottomNav(active)}</div>`;bindShell()}
function bindShell(){document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>go(b.dataset.route));const t=document.getElementById('themeBtn');if(t)t.onclick=()=>toast('Tema escuro entra numa próxima versão visual.')}
function go(r){route=r;clearInterval(sessionTimer);if(r==='home')home();else if(r==='exam')examHub();else if(r==='errors')errorsHub();else if(r==='analytics')analytics();else settingsHub()}

function attemptFor(eid){return S.attempts.filter(a=>a.examId===eid)}
function errorEntries(eid){return Object.entries(S.errors).filter(([k,v])=>k.startsWith(eid+':'))}
function flagEntries(eid){return Object.entries(S.flags).filter(([k,v])=>k.startsWith(eid+':'))}
function aggregate(eid){let seen=0,correct=0,wrong=0,guessed=0;Object.entries(S.qstats).forEach(([k,s])=>{if(eid&&!k.startsWith(eid+':'))return;seen+=s.seen||0;correct+=s.correct||0;wrong+=s.wrong||0;guessed+=s.guessed||0});return{seen,correct,wrong,guessed}}
function subjectPerf(eid){const out={};exam(eid).questions.forEach(x=>{let s=stats(x.n,eid);let o=out[x.subject]||(out[x.subject]={seen:0,correct:0,wrong:0,total:0});o.total++;o.seen+=s.seen;o.correct+=s.correct;o.wrong+=s.wrong});return out}
function weakSubjects(eid){return Object.entries(subjectPerf(eid)).filter(([k,v])=>v.correct+v.wrong>0).map(([k,v])=>({name:k,pct:Math.round(100*v.correct/Math.max(1,v.correct+v.wrong)),wrong:v.wrong})).sort((a,b)=>a.pct-b.pct)}

function home(){
  const eid=S.profile.activeExamId,e=exam(eid),last=attemptFor(eid).at(-1),weak=weakSubjects(eid),errCount=errorEntries(eid).length,flagCount=flagEntries(eid).length;
  const today=[];
  if(errCount)today.push(`Refazer ${Math.min(errCount,15)} questão${errCount===1?'':'ões'} do caderno de erros`);
  if(weak[0])today.push(`Treinar ${weak[0].name} — ${weak[0].pct}% de acerto acumulado`);
  today.push(`Fazer uma sessão rápida de 20 questões da ${e.exam.title}`);
  if(flagCount)today.push(`Revisar ${flagCount} questão${flagCount===1?'':'ões'} marcada${flagCount===1?'':'s'}`);
  const totalQs=Object.values(DATA.exams).reduce((a,x)=>a+x.exam.questions,0);
  shell(`<section class="hero"><div class="eyebrow">Sua preparação para a USP</div><h1>Revolution 3</h1><p>Agora com provas de anos diferentes, mantendo o mesmo padrão: texto nativo e imagem somente quando ela faz parte da resolução.</p><div class="hero-stats"><div class="hero-chip"><b>${Object.keys(DATA.exams).length}</b> provas disponíveis</div><div class="hero-chip"><b>${totalQs}</b> questões cadastradas</div><div class="hero-chip"><b>${S.attempts.length}</b> tentativa${S.attempts.length===1?'':'s'} salva${S.attempts.length===1?'':'s'}</div></div></section>
  <div class="section-title"><div><h2>Prova ativa</h2><p>Escolha o ano para treinar agora.</p></div></div>
  <div class="card"><select class="select" id="homeExam">${Object.entries(DATA.exams).sort((a,b)=>b[1].exam.year-a[1].exam.year).map(([id,x])=>`<option value="${id}" ${id===eid?'selected':''}>${x.exam.title} • ${x.exam.subtitle}</option>`).join('')}</select><div style="margin-top:10px;font-size:11px;color:var(--muted)">${e.exam.questions} questões • ${e.exam.durationMinutes/60} horas • corte histórico de Medicina (${cutoff(eid).label}): <b>${cutoff(eid).score}/90</b></div></div>
  <div class="section-title"><div><h2>Começar</h2><p>${e.exam.title} • escolha como estudar.</p></div></div>
  <div class="grid"><div class="card mode-card"><div class="mode-icon">⚡</div><h3>Treinar</h3><p>Correção imediata, confiança da resposta, comentário e caderno automático de erros.</p><button class="btn primary wide" data-start="training">Treinar questão por questão</button></div><div class="card mode-card"><div class="mode-icon">⏱</div><h3>Prova real</h3><p>90 questões, 5 horas e nenhum gabarito antes de finalizar. Mapa e marcações liberados.</p><button class="btn primary wide" data-start="exam">Simular ${e.exam.title}</button></div><div class="card mode-card"><div class="mode-icon">🎯</div><h3>Sessão inteligente</h3><p>20 questões priorizando erros, chutes e matérias com menor desempenho.</p><button class="btn secondary wide" id="smartBtn">Gerar 20 questões</button></div></div>
  <div class="section-title"><div><h2>Hoje</h2><p>Um caminho simples para não estudar no automático.</p></div></div><div class="card today-list">${today.slice(0,4).map((t,i)=>`<div class="today-item"><div class="today-num">${i+1}</div><div><b>${esc(t)}</b><small>${i===0&&errCount?'Comece pelo que já te fez perder ponto.':'Recomendação baseada no seu uso do Revolution.'}</small></div></div>`).join('')}</div>
  <div class="section-title"><div><h2>Seu momento • ${e.exam.year}</h2><p>O dashboard cresce conforme você resolve questões.</p></div></div><div class="grid"><div class="card metric"><b>${last?last.score+'/90':'—'}</b><small>Último simulado deste ano</small></div><div class="card metric"><b>${errCount}</b><small>Erros desta prova</small></div><div class="card metric"><b>${flagCount}</b><small>Marcadas desta prova</small></div></div>`, 'home');
  document.getElementById('homeExam').onchange=e=>{S.profile.activeExamId=e.target.value;save();home()};
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>startSession(b.dataset.start,null,eid));
  document.getElementById('smartBtn').onclick=()=>startSmart(eid);
}

function examHub(){
  const current=S.currentSession&&!S.currentSession.completed?S.currentSession:null;
  const cards=Object.entries(DATA.exams).sort((a,b)=>b[1].exam.year-a[1].exam.year).map(([id,e])=>{
    const c=e.cutoffs[S.profile.modality]||e.cutoffs.AC;
    const resume=current&&current.examId===id?`<button class="btn primary" data-resume="${id}">Continuar sessão em andamento</button>`:'';
    const note=e.exam.year===2026?'gabarito oficial retificado • questão 3 anulada':'gabarito oficial publicado em 17/11/2024';
    return `<div class="card" style="margin-bottom:12px"><div class="eyebrow" style="color:#6454d6">PROVA DISPONÍVEL</div><h2 style="margin:6px 0">${e.exam.title} • V1</h2><p style="color:var(--muted);font-size:13px">${e.exam.questions} questões • 5 horas • ${note}.</p><div class="badge">Medicina • ${c.label} • corte histórico ${c.score}</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${resume}<button class="btn primary" data-exam-start="${id}">Iniciar prova real</button><button class="btn secondary" data-train-start="${id}">Treinar esta prova</button></div></div>`
  }).join('');
  const attempts=[...S.attempts].reverse();
  shell(`<div class="section-title"><div><h2>Provas FUVEST</h2><p>Escolha o ano. O histórico de cada prova fica separado.</p></div></div>${cards}<div class="section-title"><div><h2>Histórico</h2><p>Uma nova tentativa nunca apaga a anterior.</p></div></div><div class="card">${attempts.length?attempts.map(a=>{const ex=exam(a.examId);return`<div class="history-item"><div><b>${ex.exam.title} • ${a.mode==='exam'?'Prova real':'Treino'} • ${new Date(a.finishedAt).toLocaleDateString('pt-BR')}</b><small style="display:block;color:var(--muted)">${a.percent}% • ${fmt(a.timeUsed)}</small></div><div style="text-align:right"><b>${a.score}/${a.denom||90}</b><br><span class="badge">${a.mode==='exam'?(a.score>=a.cutoff?'atingiu corte':'abaixo do corte'):'treino'}</span></div></div>`}).join(''):'<p style="color:var(--muted);font-size:12px">Nenhuma prova finalizada ainda.</p>'}</div>`,'exam');
  document.querySelectorAll('[data-exam-start]').forEach(b=>b.onclick=()=>{S.profile.activeExamId=b.dataset.examStart;save();startSession('exam',null,b.dataset.examStart)});
  document.querySelectorAll('[data-train-start]').forEach(b=>b.onclick=()=>{S.profile.activeExamId=b.dataset.trainStart;save();startSession('training',null,b.dataset.trainStart)});
  document.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>renderSession());
}

function makeSession(mode,qnums,eid){const e=exam(eid);return{id:'s'+Date.now(),examId:e.exam.id,mode,qnums:qnums||e.questions.map(x=>x.n),idx:0,answers:{},confidence:{},revealed:{},flags:{},startedAt:Date.now(),lastTick:Date.now(),elapsed:0,completed:false}}
function startSession(mode,qnums,eid){S.profile.activeExamId=eid||S.profile.activeExamId;S.currentSession=makeSession(mode,qnums,S.profile.activeExamId);save();renderSession()}
function startSmart(eid){let priorities=[];exam(eid).questions.forEach(x=>{let s=stats(x.n,eid),k=composite(eid,x.n),score=(S.errors[k]?100:0)+(s.guessed||0)*10+(s.wrong||0)*6-(s.correct||0)*2+Math.random()*2;priorities.push([score,x.n])});priorities.sort((a,b)=>b[0]-a[0]);startSession('smart',priorities.slice(0,20).map(x=>x[1]),eid)}

function renderSession(){
  const sess=S.currentSession;if(!sess||sess.completed){go('home');return}
  const e=exam(sess.examId);
  app.innerHTML=`<div class="session"><header class="session-top"><div class="session-meta"><button class="back-btn" id="exitSession">←</button><div class="session-title"><b>${sess.mode==='exam'?'Prova Real':sess.mode==='training'?'Modo Treino':sess.mode==='errors'?'Revisão de Erros':'Sessão Inteligente'}</b><small>${e.exam.title} • ${sess.qnums.length} questões</small></div></div><div class="timer" id="timer">00:00:00</div></header><main class="session-body" id="sessionBody"></main></div>`;
  document.getElementById('exitSession').onclick=()=>{save();go('home')};startTimer();renderQuestion();
}
function startTimer(){clearInterval(sessionTimer);sessionTimer=setInterval(()=>{const s=S.currentSession;if(!s||s.completed)return;const e=exam(s.examId),now=Date.now();s.elapsed+=(now-(s.lastTick||now))/1000;s.lastTick=now;if(s.mode==='exam'&&s.elapsed>=e.exam.durationMinutes*60){s.elapsed=e.exam.durationMinutes*60;save();finishSession()}else{updateTimer();if(Math.floor(s.elapsed)%10===0)save()}},1000);updateTimer()}
function updateTimer(){const s=S.currentSession,el=document.getElementById('timer');if(!el||!s)return;const e=exam(s.examId);el.textContent=s.mode==='exam'?fmt(e.exam.durationMinutes*60-s.elapsed):fmt(s.elapsed)}

function renderQuestion(){
  const s=S.currentSession,e=exam(s.examId),n=s.qnums[s.idx],qq=q(n,s.examId),chosen=s.answers[n]||null,revealed=!!s.revealed[n],training=s.mode!=='exam',flagged=!!(s.flags[n]||S.flags[composite(s.examId,n)]);
  const locked=qq.annulled||(training&&revealed);
  const cls=l=>revealed?(qq.annulled?'':l===qq.answer?'correct':l===chosen?'wrong':''):(l===chosen?'selected':'');
  const ctx=qq.context?.text?`<div class="context"><span class="badge">Texto-base ${qq.context.range}</span><br><br>${esc(qq.context.text)}</div>`:'';
  const visual=qq.visual?`<div class="visual-wrap"><img src="./${qq.visual}" alt="Apoio visual da questão ${n}"><div class="visual-label">Imagem exibida apenas porque faz parte da resolução da questão</div></div>`:'';
  const feedback=qq.annulled?feedbackHtml(qq,chosen):(training&&revealed?feedbackHtml(qq,chosen):'');
  const answeredCount=Object.keys(s.answers).length;
  document.getElementById('sessionBody').innerHTML=`<div class="session-tools"><div class="session-tools-left"><button class="mini ${flagged?'on':''}" id="flagBtn">${flagged?'🚩 Marcada':'⚑ Marcar'}</button><button class="mini" id="mapBtn">▦ Mapa</button></div><div class="session-tools-right"><span class="mini">${answeredCount}/${s.qnums.length} respondidas</span></div></div>
  <div class="question-card"><div class="anno-toolbar"><button class="anno-toggle" id="annoToggle">✏️ Anotar</button><button class="anno-tool on" data-tool="pen">Caneta</button><button class="anno-tool" data-tool="highlighter">Marca-texto</button><button class="anno-tool" data-tool="eraser">Borracha</button><span class="anno-sep"></span><button class="color c-blue on" data-color="#1769e0"></button><button class="color c-red" data-color="#e43d45"></button><button class="color c-green" data-color="#2cbb6f"></button><button class="color c-yellow" data-color="#f3c82c"></button><span class="anno-sep"></span><button class="anno-tool" id="undoAnno">↶</button><button class="anno-tool" id="redoAnno">↷</button><button class="anno-tool" id="eyeAnno">👁</button><button class="anno-tool danger" id="clearAnno">🗑</button></div>
  <div class="annotate-area" id="annotateArea"><canvas class="anno-canvas" id="annoCanvas"></canvas><div class="q-head"><span class="subject-pill">${esc(qq.subject)} • ${esc(qq.topic)}</span><span class="q-counter">Questão ${n} • ${s.idx+1}/${s.qnums.length}</span></div>${ctx}<div class="question-text">${esc(qq.stem)}</div>${visual}<div class="options">${qq.options.map((o,i)=>{const l=letters[i];return`<button class="option ${cls(l)}" data-answer="${l}" ${locked?'disabled':''}><span class="option-letter">${l}</span><span>${o?esc(o):`Alternativa visual ${l}`}</span></button>`}).join('')}</div>${feedback}</div>
  <div class="session-nav"><button class="btn ghost" id="prevQ" ${s.idx===0?'disabled':''}>← Anterior</button><span class="session-progress">${e.exam.title}</span><button class="btn primary next-btn" id="nextQ">${s.idx===s.qnums.length-1?'Finalizar →':'Próxima →'}</button></div></div>`;
  bindQuestion(qq); initAnnotations(n,s.examId);
}
function feedbackHtml(qq,chosen){
  if(qq.annulled)return `<div class="feedback ann"><h4>Questão anulada</h4><p>${esc(qq.comment)}</p></div>`;
  const ok=chosen===qq.answer;
  return `<div class="feedback ${ok?'good':'bad'}"><h4>${ok?'✓ Você acertou':'✕ A correta é '+qq.answer}</h4><p>${esc(qq.comment)}</p><div class="confidence"><b>Como você respondeu?</b><div class="confidence-btns">${[['sure','Tinha certeza'],['between','Entre duas'],['guessed','Chutei']].map(x=>`<button class="conf-btn ${S.currentSession.confidence[qq.n]===x[0]?'on':''}" data-confidence="${x[0]}">${x[1]}</button>`).join('')}</div></div></div>`;
}
function bindQuestion(qq){
  const s=S.currentSession;
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{
    if(qq.annulled||anno.active)return;
    const l=b.dataset.answer;
    if(s.mode==='exam'){s.answers[qq.n]=l;save();renderQuestion();return}
    if(s.revealed[qq.n])return;
    s.answers[qq.n]=l;s.revealed[qq.n]=true;recordOutcome(qq,l);save();renderQuestion();
  });
  document.querySelectorAll('[data-confidence]').forEach(b=>b.onclick=()=>{s.confidence[qq.n]=b.dataset.confidence;recordConfidence(qq.n,b.dataset.confidence,s.examId);save();renderQuestion()});
  document.getElementById('flagBtn').onclick=()=>{const k=composite(s.examId,qq.n);s.flags[qq.n]=!s.flags[qq.n];if(s.flags[qq.n])S.flags[k]=true;else delete S.flags[k];save();renderQuestion()};
  document.getElementById('mapBtn').onclick=openMap;
  document.getElementById('prevQ').onclick=()=>{if(s.idx>0){s.idx--;save();renderQuestion()}};
  document.getElementById('nextQ').onclick=()=>{
    if(s.idx<s.qnums.length-1){s.idx++;save();renderQuestion()}
    else if(s.mode==='exam'&&!confirm('Finalizar a prova e revelar o resultado?'))return;
    else finishSession();
  };
}
function recordOutcome(qq,chosen){
  const eid=S.currentSession.examId,k=composite(eid,qq.n),st=stats(qq.n,eid);st.seen++;st.last=Date.now();
  if(qq.annulled)return;
  if(chosen===qq.answer){st.correct++;delete S.errors[k]}else{st.wrong++;S.errors[k]={examId:eid,n:qq.n,reason:'Resposta incorreta',at:Date.now()}}
}
function recordConfidence(n,c,eid){
  const st=stats(n,eid);if(c==='sure')st.sure++;if(c==='between')st.between++;if(c==='guessed'){st.guessed++;const k=composite(eid,n);S.errors[k]={examId:eid,n,reason:'Respondida no chute',at:Date.now()}}
}
function openMap(){
  const s=S.currentSession;
  modal.classList.remove('hidden');
  modalCard.innerHTML=`<div class="modal-head"><h3>Mapa da prova</h3><button class="close" id="closeModal">×</button></div><div class="map-legend"><span>● respondida</span><span>🚩 marcada</span><span>contorno = atual</span></div><div class="map-grid">${s.qnums.map((n,i)=>{let cl=[];if(s.answers[n])cl.push('answered');if(s.flags[n]||S.flags[composite(s.examId,n)])cl.push('flagged');if(i===s.idx)cl.push('current');return`<button class="map-q ${cl.join(' ')}" data-map="${i}">${n}</button>`}).join('')}</div>`;
  document.getElementById('closeModal').onclick=()=>modal.classList.add('hidden');
  document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{s.idx=+b.dataset.map;modal.classList.add('hidden');save();renderQuestion()});
}

function finishSession(){
  clearInterval(sessionTimer);
  const s=S.currentSession,e=exam(s.examId);
  let score=0,denom=s.qnums.length,bySub={};
  s.qnums.forEach(n=>{
    const qq=q(n,s.examId),ch=s.answers[n]||null,o=bySub[qq.subject]||(bySub[qq.subject]={correct:0,total:0});o.total++;
    if(qq.annulled){score++;o.correct++;return}
    if(ch===qq.answer){score++;o.correct++}
    if(s.mode==='exam')recordOutcome(qq,ch);
  });
  const c=e.cutoffs[S.profile.modality]||e.cutoffs.AC;
  const a={id:s.id,examId:s.examId,mode:s.mode,finishedAt:Date.now(),score,denom,percent:Math.round(score/denom*1000)/10,timeUsed:s.elapsed,cutoff:c.score,modality:S.profile.modality,confidence:s.confidence,bySub};
  S.attempts.push(a);s.completed=true;S.currentSession=null;save();renderResult(a);
}
function renderResult(a){
  const e=exam(a.examId),historical=a.mode==='exam'&&a.denom===e.exam.questions,pass=a.score>=a.cutoff;
  const errorCount=errorEntries(a.examId).length;
  app.innerHTML=`<div class="app-shell"><header class="topbar"><div class="brand"><div class="logo">R</div><div>REVOLUTION<small>RESULTADO • ${e.exam.title}</small></div></div><button class="icon-btn" id="homeRes">⌂</button></header><main class="page"><div class="result-hero ${pass?'pass':'fail'}"><div class="eyebrow" style="color:inherit">${historical?`COMPARAÇÃO HISTÓRICA • MEDICINA ${e.exam.title}`:'RESULTADO DA SESSÃO'}</div><h2>${historical?(pass?'PASSARIA PARA A 2ª FASE':'NÃO ATINGIRIA O CORTE'):'Sessão concluída'}</h2><div class="score">${a.score}<small> / ${a.denom}</small></div>${historical?`<p><b>Corte ${e.cutoffs[a.modality].label}: ${a.cutoff}/90.</b> ${pass?`Você ficou ${a.score-a.cutoff} ponto${a.score-a.cutoff===1?'':'s'} acima ou exatamente no corte.`:`Faltaram ${a.cutoff-a.score} ponto${a.cutoff-a.score===1?'':'s'} para o corte histórico.`}</p>`:''}</div><div class="result-grid"><div class="card result-stat"><b>${a.percent}%</b><small>Aproveitamento</small></div><div class="card result-stat"><b>${fmt(a.timeUsed)}</b><small>Tempo</small></div><div class="card result-stat"><b>${errorCount}</b><small>Erros deste ano</small></div><div class="card result-stat"><b>${Object.values(a.confidence||{}).filter(x=>x==='guessed').length}</b><small>Respostas no chute</small></div></div><div class="section-title"><div><h2>Por disciplina</h2><p>Onde você ganhou e perdeu pontos.</p></div></div><div class="card">${Object.entries(a.bySub).sort((x,y)=>x[0].localeCompare(y[0])).map(([name,v])=>{let pct=Math.round(v.correct/v.total*100);return`<div class="subject-row"><b>${esc(name)}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${v.correct}/${v.total}</span></div>`}).join('')}</div><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" id="trainErrors">Treinar o que me fez perder pontos</button><button class="btn ghost" id="goHome">Voltar ao início</button></div><div class="source-note" style="margin-top:16px">“Passaria” compara sua pontuação com a nota de corte oficial de Medicina da edição selecionada e da modalidade escolhida. Não é previsão de outra edição.</div></main></div>`;
  document.getElementById('homeRes').onclick=document.getElementById('goHome').onclick=()=>go('home');
  document.getElementById('trainErrors').onclick=()=>{let qs=errorEntries(a.examId).map(([k,v])=>v.n||+k.split(':').at(-1));if(!qs.length)return toast('Nenhum erro pendente.');startSession('errors',qs,a.examId)};
}

function errorsHub(){
  const groups=Object.keys(DATA.exams).map(eid=>[eid,errorEntries(eid)]).filter(x=>x[1].length);
  let content='<div class="section-title"><div><h2>Caderno de erros</h2><p>Erros e chutes ficam separados por edição da prova.</p></div></div>';
  if(!groups.length){
    content+='<div class="card"><p style="color:var(--muted);font-size:12px">Seu caderno está vazio.</p></div>';
  }else{
    groups.forEach(([eid,items])=>{
      content+=`<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 style="margin:0">${exam(eid).exam.title}</h3><button class="btn primary" data-redo-exam="${eid}">Refazer ${items.length}</button></div>`;
      items.forEach(([k,v])=>{
        const n=v.n||+k.split(':').at(-1),qq=q(n,eid);
        content+=`<div class="error-item"><div><span class="badge">Q${n}</span> <b>${esc(qq.subject)}</b><small style="display:block;color:var(--muted);margin-top:4px">${esc(qq.topic)} • ${esc(v.reason)}</small></div><button class="btn ghost" data-one="${eid}|${n}">Treinar</button></div>`;
      });
      content+='</div>';
    });
  }
  shell(content,'errors');
  document.querySelectorAll('[data-redo-exam]').forEach(b=>{const eid=b.dataset.redoExam;b.onclick=()=>startSession('errors',errorEntries(eid).map(([k,v])=>v.n||+k.split(':').at(-1)),eid)});
  document.querySelectorAll('[data-one]').forEach(b=>b.onclick=()=>{const [eid,n]=b.dataset.one.split('|');startSession('errors',[+n],eid)});
}
function analytics(){
  const eid=S.profile.activeExamId,e=exam(eid),perf=subjectPerf(eid),weak=weakSubjects(eid),ag=aggregate(eid);
  shell(`<div class="section-title"><div><h2>Desempenho</h2><p>Escolha a edição para analisar.</p></div></div><div class="card"><select class="select" id="analyticsExam">${Object.entries(DATA.exams).sort((a,b)=>b[1].exam.year-a[1].exam.year).map(([id,x])=>`<option value="${id}" ${id===eid?'selected':''}>${x.exam.title}</option>`).join('')}</select></div><div class="grid" style="margin-top:12px"><div class="card metric"><b>${attemptFor(eid).length}</b><small>Sessões concluídas</small></div><div class="card metric"><b>${ag.guessed}</b><small>Respostas marcadas como chute</small></div><div class="card metric"><b>${weak[0]?.name||'—'}</b><small>Matéria mais frágil</small></div></div><div class="section-title"><div><h2>Por disciplina • ${e.exam.year}</h2><p>A classificação é auxiliar para estudo.</p></div></div><div class="card">${Object.entries(perf).map(([name,v])=>{let den=v.correct+v.wrong,pct=den?Math.round(v.correct/den*100):0;return`<div class="subject-row"><b>${esc(name)}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${den?pct+'%':'—'}</span></div>`}).join('')}</div>`,'analytics');
  document.getElementById('analyticsExam').onchange=e=>{S.profile.activeExamId=e.target.value;save();analytics()};
}
function settingsHub(){
  const e=activeExam();
  shell(`<div class="section-title"><div><h2>Ajustes</h2><p>Dados locais, corte e backup.</p></div></div><div class="card"><label style="font-size:11px;font-weight:900">Modalidade • Medicina</label><select class="select" id="setMod" style="margin-top:7px">${Object.entries(e.cutoffs).map(([k,v])=>`<option value="${k}" ${S.profile.modality===k?'selected':''}>${v.label}</option>`).join('')}</select><label style="font-size:11px;font-weight:900;display:block;margin-top:14px">Prova ativa</label><select class="select" id="setExam" style="margin-top:7px">${Object.entries(DATA.exams).sort((a,b)=>b[1].exam.year-a[1].exam.year).map(([id,x])=>`<option value="${id}" ${id===S.profile.activeExamId?'selected':''}>${x.exam.title}</option>`).join('')}</select><div style="display:flex;gap:8px;margin-top:15px;flex-wrap:wrap"><button class="btn primary" id="exportBtn">Exportar backup</button><label class="btn ghost" style="display:inline-block">Importar backup<input type="file" id="importFile" accept="application/json" hidden></label><button class="btn danger" id="resetBtn">Zerar meus dados</button></div></div><div class="section-title"><div><h2>Fontes</h2></div></div><div class="source-note"><b>FUVEST 2026:</b> prova V1 enviada nesta conversa; gabarito oficial retificado; Medicina: AC 80, EP 72, PPI 60.<br><br><b>FUVEST 2025:</b> prova V1 enviada nesta conversa; gabarito oficial publicado em 17/11/2024; Medicina: AC 79, EP 71, PPI 60.<br><br><b>Imagens:</b> aparecem somente quando o elemento visual é necessário ou relevante para resolver a questão. <b>Disciplina/tópico:</b> classificação auxiliar para estudo e analytics, não taxonomia oficial da FUVEST.</div>`,'settings');
  document.getElementById('setMod').onchange=x=>{S.profile.modality=x.target.value;save();toast('Modalidade salva')};
  document.getElementById('setExam').onchange=x=>{S.profile.activeExamId=x.target.value;save();settingsHub()};
  document.getElementById('exportBtn').onclick=exportBackup;document.getElementById('importFile').onchange=importBackup;
  document.getElementById('resetBtn').onclick=()=>{if(confirm('Zerar todo o progresso do Revolution 3 neste aparelho?')){localStorage.removeItem(LS);localStorage.removeItem(ANNO);S=blankState();A={};go('home')}};
}
function exportBackup(){const blob=new Blob([JSON.stringify({schema:2,exportedAt:new Date().toISOString(),state:S,annotations:A},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='revolution3-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u);S.lastBackup=Date.now();save()}
function importBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.state)throw 0;S=migrateState(d.state);A=migrateAnnotations(d.annotations||{});save();saveAnno();toast('Backup importado');go('home')}catch(x){alert('Backup inválido.')}};r.readAsText(f)}

// annotations
function saveAnno(){localStorage.setItem(ANNO,JSON.stringify(A))}
function bucket(n,eid){const k=composite(eid,n);return A[k]||(A[k]={strokes:[]})}
function styleStroke(s){return s.tool==='highlighter'?{w:22,a:.28,c:'source-over'}:s.tool==='eraser'?{w:30,a:1,c:'destination-out'}:{w:3.1,a:1,c:'source-over'}}
function drawStroke(ctx,s,w,h){if(!s.points?.length)return;let st=styleStroke(s);ctx.save();ctx.globalCompositeOperation=st.c;ctx.globalAlpha=st.a;ctx.strokeStyle=s.color;ctx.lineWidth=st.w;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h));if(s.points.length===1){let p=s.points[0];ctx.lineTo(p.x*w+.1,p.y*h+.1)}ctx.stroke();ctx.restore()}
function redrawAnno(n,eid){let c=document.getElementById('annoCanvas'),area=document.getElementById('annotateArea');if(!c||!area)return;let dpr=Math.max(1,devicePixelRatio||1),w=area.clientWidth,h=area.scrollHeight;c.style.width=w+'px';c.style.height=h+'px';c.width=w*dpr;c.height=h*dpr;let ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!anno.visible)return;bucket(n,eid).strokes.forEach(s=>drawStroke(ctx,s,w,h))}
function initAnnotations(n,eid){
  anno.active=false;anno.visible=true;anno.drawing=false;anno.tool='pen';anno.color='#1769e0';
  let c=document.getElementById('annoCanvas'),area=document.getElementById('annotateArea'),toggle=document.getElementById('annoToggle');requestAnimationFrame(()=>redrawAnno(n,eid));setTimeout(()=>redrawAnno(n,eid),150);document.querySelectorAll('.visual-wrap img').forEach(im=>{if(!im.complete)im.onload=()=>redrawAnno(n,eid)});
  function pnt(e){let r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
  c.onpointerdown=e=>{if(!anno.active)return;e.preventDefault();anno.drawing=true;anno.current={tool:anno.tool,color:anno.color,points:[pnt(e)]};anno.redo[composite(eid,n)]=[]};
  c.onpointermove=e=>{if(!anno.drawing)return;e.preventDefault();anno.current.points.push(pnt(e));redrawAnno(n,eid);drawStroke(c.getContext('2d'),anno.current,c.clientWidth,c.clientHeight)};
  c.onpointerup=c.onpointercancel=e=>{if(!anno.drawing)return;anno.drawing=false;bucket(n,eid).strokes.push(anno.current);anno.current=null;saveAnno();redrawAnno(n,eid)};
  toggle.onclick=()=>{anno.active=!anno.active;c.classList.toggle('active',anno.active);toggle.classList.toggle('on',anno.active);toggle.textContent=anno.active?'✓ Concluir':'✏️ Anotar'};
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{anno.tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('on',x===b))});
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{anno.color=b.dataset.color;document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('on',x===b))});
  document.getElementById('undoAnno').onclick=()=>{let b=bucket(n,eid),rk=composite(eid,n);if(!b.strokes.length)return;(anno.redo[rk]||(anno.redo[rk]=[])).push(b.strokes.pop());saveAnno();redrawAnno(n,eid)};
  document.getElementById('redoAnno').onclick=()=>{let rk=composite(eid,n),r=anno.redo[rk]||[];if(!r.length)return;bucket(n,eid).strokes.push(r.pop());saveAnno();redrawAnno(n,eid)};
  document.getElementById('eyeAnno').onclick=()=>{anno.visible=!anno.visible;redrawAnno(n,eid)};
  document.getElementById('clearAnno').onclick=()=>{if(confirm('Apagar as anotações desta questão?')){bucket(n,eid).strokes=[];anno.redo[composite(eid,n)]=[];saveAnno();redrawAnno(n,eid)}};
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
home();
