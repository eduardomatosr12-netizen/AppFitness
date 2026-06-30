/* ================================================================
   SUPABASE — Insira suas credenciais abaixo
   ================================================================ */
const SUPABASE_URL = 'https://epshnbflnfdsrrqecjgt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wwgwZ-rdm3cJ3ZZWWO_E0w_5nwXU6UU';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================================================
   INÍCIO — aguarda o DOM e o carregamento do Supabase via CDN
   ================================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  /* ===== CONFIG ===== */
  const STORAGE_KEY = 'atrilha_local';
  const DEFAULT_METRICS = [
    { id: 'agua', label: '💧 Água', value: 0, unit: 'ml', step: 200, max: 4000, icon: '💧' },
    { id: 'estudo', label: '📚 Estudo', value: 0, unit: 'min', step: 5, max: 300, icon: '📚' },
    { id: 'passos', label: '👣 Passos', value: 0, unit: '', step: 500, max: 30000, icon: '👣' },
  ];
  const STREAK_PHRASES = [
    '"O segredo é começar."',
    '"Você é mais forte do que pensa."',
    '"Um dia de cada vez."',
    '"Pequenas vitórias, grandes resultados."',
    '"Disciplina é liberdade."',
    '"O agora é o que importa."',
    '"Persista, o futuro agradece."',
    '"Faça hoje o que você quer ser amanhã."',
  ];

  /* ===== STATE ===== */
  const state = {
    tasks: [],
    metrics: JSON.parse(JSON.stringify(DEFAULT_METRICS)),
    streak: 0,
    round: 1,
    timer: { remaining: 0, total: 0, running: false },
    goals: [],
  };

  let timerInterval = null;
  let audioAlarm = null;
  let fallbackInterval = null;

  /* ===== DOM ===== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const progressFill = $('#progress-fill');
  const progressPct = $('#progress-percent');
  const roundNum = $('#round-num');
  const streakCount = $('#streak-count');
  const streakPhrase = $('#streak-phrase');
  const taskCountBadge = $('#task-count-badge');

  const timerDisplay = $('#timer-display');
  const timerMin = $('#timer-minutos');
  const timerSeg = $('#timer-segundos');
  const timerStart = $('#timer-start');
  const timerPause = $('#timer-pause');
  const timerReset = $('#timer-reset');

  const taskInput = $('#input-tarefa');
  const btnAddTask = $('#btn-add-tarefa');
  const taskList = $('#lista-tarefas');

  const metricsGrid = $('#metrics-grid');

  const goalNameInput = $('#input-nome-meta');
  const goalTargetInput = $('#input-total-meta');
  const btnAddGoal = $('#btn-add-meta');
  const goalsContainer = $('#lista-metas');

  const alarmOverlay = $('#alarm-overlay');
  const alarmDismiss = $('#alarm-dismiss');

  /* =================================================================
     SUPABASE — TAREFAS (tabela: tarefas)
     ================================================================= */
  async function loadTasks() {
    const { data, error } = await sb
      .from('tarefas')
      .select('*')
      .order('id', { ascending: true });
    if (error) { console.error('loadTasks:', error.message); return; }
    state.tasks = data.map(r => ({ id: r.id, text: r.texto, done: r.concluida }));
  }

  async function addTask(text) {
    const t = text.trim();
    if (!t) return false;
    const { data, error } = await sb
      .from('tarefas')
      .insert({ texto: t, concluida: false })
      .select();
    if (error) { console.error('addTask:', error.message); return false; }
    state.tasks.push({ id: data[0].id, text: data[0].texto, done: data[0].concluida });
    renderTasks();
    updateStreakAndProgress();
    return true;
  }

  async function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    const { error } = await sb.from('tarefas').update({ concluida: newDone }).eq('id', id);
    if (error) { console.error('toggleTask:', error.message); return; }
    task.done = newDone;
    renderTasks();
    updateStreakAndProgress();
  }

  async function deleteTask(id) {
    const { error } = await sb.from('tarefas').delete().eq('id', id);
    if (error) { console.error('deleteTask:', error.message); return; }
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderTasks();
    updateStreakAndProgress();
  }

  /* =================================================================
     SUPABASE — METAS (tabela: metas)
     ================================================================= */
  async function loadGoals() {
    const { data, error } = await sb
      .from('metas')
      .select('*')
      .order('id', { ascending: true });
    if (error) { console.error('loadGoals:', error.message); return; }
    state.goals = data.map(r => ({ id: r.id, name: r.nome, current: r.atual, target: r.total }));
  }

  async function addGoal(name, target) {
    const n = name.trim();
    const tot = parseInt(target);
    if (!n || !tot || tot <= 0) return false;
    const { data, error } = await sb
      .from('metas')
      .insert({ nome: n, atual: 0, total: tot })
      .select();
    if (error) { console.error('addGoal:', error.message); return false; }
    state.goals.push({ id: data[0].id, name: data[0].nome, current: data[0].atual, target: data[0].total });
    renderGoals();
    return true;
  }

  async function incrementGoal(id) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal || goal.current >= goal.target) return;
    const next = goal.current + 1;
    const { error } = await sb.from('metas').update({ atual: next }).eq('id', id);
    if (error) { console.error('incrementGoal:', error.message); return; }
    goal.current = next;
    renderGoals();
  }

  async function deleteGoal(id) {
    const { error } = await sb.from('metas').delete().eq('id', id);
    if (error) { console.error('deleteGoal:', error.message); return; }
    state.goals = state.goals.filter(g => g.id !== id);
    renderGoals();
  }

  /* =================================================================
     RENDER — TAREFAS
     ================================================================= */
  function renderTasks() {
    taskList.innerHTML = '';

    if (state.tasks.length === 0) {
      taskList.innerHTML = '<div class="empty-state">Nenhuma tarefa ainda.<br>Adicione sua primeira meta!</div>';
      taskCountBadge.textContent = '0';
      updateProgressBar();
      return;
    }

    state.tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item' + (task.done ? ' completed' : '');
      li.dataset.id = task.id;

      li.innerHTML = `
        <div class="checkbox-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0c0d12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span class="task-text">${esc(task.text)}</span>
        <button class="task-delete" data-action="delete-task" aria-label="Remover">&times;</button>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-task"]')) return;
        toggleTask(task.id);
      });

      li.querySelector('.task-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task.id);
      });

      taskList.appendChild(li);
    });

    const pending = state.tasks.filter(t => !t.done).length;
    taskCountBadge.textContent = pending;
    updateProgressBar();
  }

  /* =================================================================
     RENDER — METAS DIÁRIAS
     ================================================================= */
  function renderMetrics() {
    metricsGrid.innerHTML = '';
    state.metrics.forEach(m => {
      const card = document.createElement('div');
      card.className = 'metric-card';
      card.innerHTML = `
        <div class="metric-label">${m.icon || ''} ${m.label}</div>
        <div class="metric-value">${m.value}</div>
        <div class="metric-unit">${m.unit || '&nbsp;'}</div>
        <div class="metric-actions">
          <button data-id="${m.id}" data-dir="-1">−</button>
          <button data-id="${m.id}" data-dir="1">+</button>
        </div>
      `;
      card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const delta = parseInt(btn.dataset.dir) * m.step;
          m.value = Math.max(0, Math.min(m.max || Infinity, m.value + delta));
          renderMetrics();
          updateProgressBar();
          saveLocal();
        });
      });
      metricsGrid.appendChild(card);
    });
  }

  /* =================================================================
     PROGRESSO + STREAK
     ================================================================= */
  function calcProgress() {
    const total = state.tasks.length;
    if (total === 0) return 0;
    const done = state.tasks.filter(t => t.done).length;
    let mFactor = 0;
    state.metrics.forEach(m => {
      if (m.max && m.max > 0) mFactor += Math.min(m.value / m.max, 1);
    });
    const mCount = state.metrics.filter(m => m.max > 0).length || 1;
    mFactor /= mCount;
    return Math.min(Math.round(done / total * 60 + mFactor * 40), 100);
  }

  function updateProgressBar() {
    const pct = calcProgress();
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
  }

  function updateStreakAndProgress() {
    const done = state.tasks.filter(t => t.done).length;
    const total = state.tasks.length;
    if (total > 0 && done === total) {
      state.streak = Math.max(state.streak, 1);
    }
    streakCount.textContent = state.streak;
    const idx = state.streak % STREAK_PHRASES.length;
    streakPhrase.textContent = STREAK_PHRASES[idx];
    updateProgressBar();
  }

  /* =================================================================
     RENDER — METAS DE LONGO PRAZO
     ================================================================= */
  function renderGoals() {
    goalsContainer.innerHTML = '';

    if (state.goals.length === 0) {
      goalsContainer.innerHTML = '<div class="empty-state">Nenhuma meta criada ainda.<br>Crie sua primeira meta abaixo!</div>';
      return;
    }

    state.goals.forEach(g => {
      const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
      const rem = Math.max(g.target - g.current, 0);
      const msg = g.current >= g.target
        ? '🎉 Parabéns! Você atingiu sua meta de ' + g.target + '!'
        : 'Faltam ' + rem + ' para sua meta!';

      const card = document.createElement('div');
      card.className = 'goal-card';
      card.dataset.id = g.id;

      card.innerHTML = `
        <div class="goal-card-header">
          <span class="goal-card-name">${esc(g.name)}</span>
          <span class="goal-card-badge">${g.current} / ${g.target}</span>
        </div>
        <div class="goal-card-bar-wrapper">
          <div class="goal-card-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-card-message">${msg}</div>
        <div class="goal-card-actions">
          <button class="goal-card-btn-primary" data-action="inc-goal" data-id="${g.id}">+1</button>
          <button class="goal-card-btn-delete" data-action="del-goal" data-id="${g.id}" aria-label="Excluir">🗑</button>
        </div>
      `;

      goalsContainer.appendChild(card);
    });
  }

  /* Delegado de clique nos cartões de meta */
  function handleGoalClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'inc-goal') incrementGoal(id);
    if (btn.dataset.action === 'del-goal') deleteGoal(id);
  }

  /* =================================================================
     TIMER DE FOCO (localStorage)
     ================================================================= */
  function fmt(sec) {
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function readTimer() {
    return (parseInt(timerMin.value) || 0) * 60 + Math.min(parseInt(timerSeg.value) || 0, 59);
  }

  function hasTimer() { return readTimer() > 0; }

  function flashErr() {
    timerMin.classList.add('input-error');
    timerSeg.classList.add('input-error');
    setTimeout(() => {
      timerMin.classList.remove('input-error');
      timerSeg.classList.remove('input-error');
    }, 500);
  }

  function renderTimer() {
    timerDisplay.textContent = fmt(state.timer.remaining);
    const run = state.timer.running;
    timerMin.disabled = run;
    timerSeg.disabled = run;
    timerStart.disabled = run || !hasTimer();
    timerPause.disabled = !run;
    timerReset.disabled = false;
    timerDisplay.classList.toggle('running', run);
    timerDisplay.classList.remove('finished');
  }

  function startTimer() {
    if (state.timer.running) return;
    if (!hasTimer()) { flashErr(); return; }
    if (state.timer.remaining <= 0) {
      state.timer.total = readTimer();
      state.timer.remaining = state.timer.total;
    }
    if (!audioAlarm) {
      audioAlarm = new Audio('https://google.com');
      audioAlarm.loop = true;
      audioAlarm.preload = 'auto';
      audioAlarm.addEventListener('error', () => { audioAlarm = null; });
    }
    state.timer.running = true;
    renderTimer();
    timerInterval = setInterval(tick, 1000);
  }

  function pauseTimer() {
    if (!state.timer.running) return;
    state.timer.running = false;
    clearInterval(timerInterval);
    timerInterval = null;
    renderTimer();
    saveLocal();
  }

  function resetTimer() {
    if (state.timer.running) {
      state.timer.running = false;
      clearInterval(timerInterval);
      timerInterval = null;
    }
    state.timer.remaining = 0;
    state.timer.total = 0;
    timerMin.value = '0';
    timerSeg.value = '0';
    renderTimer();
    saveLocal();
  }

  function tick() {
    if (!state.timer.running) return;
    state.timer.remaining--;
    if (state.timer.remaining <= 0) {
      state.timer.remaining = 0;
      state.timer.running = false;
      clearInterval(timerInterval);
      timerInterval = null;
      renderTimer();
      finishTimer();
      saveLocal();
      return;
    }
    renderTimer();
  }

  /* ===== ALARME ===== */
  function showAlarm() {
    alarmOverlay.classList.add('active');
    if (audioAlarm) {
      audioAlarm.currentTime = 0;
      audioAlarm.play().catch(() => beepLoop());
    } else {
      beepLoop();
    }
  }

  function beepLoop() {
    function beep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch (_) {}
    }
    beep();
    fallbackInterval = setInterval(beep, 600);
  }

  function dismissAlarm() {
    alarmOverlay.classList.remove('active');
    if (audioAlarm) { audioAlarm.pause(); audioAlarm.currentTime = 0; }
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    resetTimer();
  }

  function finishTimer() {
    timerDisplay.classList.add('finished');
    timerDisplay.textContent = '00:00';
    showAlarm();
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification('Foco Concluído! 🎯', { body: 'Muito bem! Você completou o seu tempo na Trilha.' });
        setTimeout(() => n.close(), 8000);
      } catch (_) {}
    }
  }

  /* =================================================================
     LOCALSTORAGE (timer, métricas, streak, round)
     ================================================================= */
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        metrics: state.metrics.map(m => ({ id: m.id, value: m.value })),
        streak: state.streak,
        round: state.round,
        timer: { remaining: state.timer.remaining, total: state.timer.total },
      }));
    } catch (_) {}
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.metrics) d.metrics.forEach(s => { const m = state.metrics.find(x => x.id === s.id); if (m) m.value = s.value || 0; });
      if (typeof d.streak === 'number') state.streak = d.streak;
      if (typeof d.round === 'number') state.round = d.round;
      if (d.timer) { state.timer.remaining = d.timer.remaining || 0; state.timer.total = d.timer.total || 0; }
    } catch (_) {}
  }

  /* ===== HELPERS ===== */
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* =================================================================
     INIT
     ================================================================= */
  // 1. Restaura dados locais
  loadLocal();

  // 2. Carrega dados do banco
  await Promise.all([loadTasks(), loadGoals()]);

  // 3. Verifica reset diário
  const lastDateKey = 'atrilha_lastdate';
  const today = new Date().toDateString();
  try {
    const lastDate = localStorage.getItem(lastDateKey);
    if (lastDate !== today) {
      state.metrics.forEach(m => { m.value = 0; });
      localStorage.setItem(lastDateKey, today);
    }
  } catch (_) {}

  // 4. Renderiza
  renderTasks();
  renderMetrics();
  updateProgressBar();
  updateStreakAndProgress();
  renderGoals();
  if (state.timer.total > 0) {
    timerMin.value = Math.floor(state.timer.total / 60);
    timerSeg.value = state.timer.total % 60;
  }
  renderTimer();
  roundNum.textContent = state.round || 1;

  /* ===== EVENTOS ===== */
  // Timer
  timerStart.addEventListener('click', startTimer);
  timerPause.addEventListener('click', pauseTimer);
  timerReset.addEventListener('click', resetTimer);
  timerMin.addEventListener('input', renderTimer);
  timerSeg.addEventListener('input', renderTimer);

  // Alarme
  alarmDismiss.addEventListener('click', dismissAlarm);

  // Notificação
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Tarefas
  btnAddTask.addEventListener('click', async () => {
    if (await addTask(taskInput.value)) taskInput.value = '';
    taskInput.focus();
  });
  taskInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (await addTask(taskInput.value)) taskInput.value = '';
    }
  });

  // Metas
  goalsContainer.addEventListener('click', handleGoalClick);
  btnAddGoal.addEventListener('click', async () => {
    if (await addGoal(goalNameInput.value, goalTargetInput.value)) {
      goalNameInput.value = '';
      goalTargetInput.value = '';
    }
    goalNameInput.focus();
  });
  goalTargetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btnAddGoal.click(); }
  });

  // Persiste estado local antes de sair
  window.addEventListener('beforeunload', saveLocal);
});
