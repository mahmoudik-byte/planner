// ============================================================
// Ежедневник — основная логика
// ============================================================

// Проверка конфигурации
(function checkConfig() {
  const c = window.SUPABASE_CONFIG || {};
  const bad = !c.url || !c.anonKey
    || c.url.includes('ВАШ') || c.anonKey.includes('ВАШ')
    || !/^[\x00-\x7F]*$/.test(c.url) || !/^[\x00-\x7F]*$/.test(c.anonKey);
  if (bad) {
    document.body.innerHTML = `
      <div style="max-width:520px;margin:60px auto;padding:24px;font-family:system-ui;color:#e8e8e8;background:#1a1d24;border-radius:12px;border:1px solid #2a2f3a;line-height:1.6">
        <h2 style="color:#ef4444;margin-bottom:12px">Не настроен Supabase</h2>
        <p>Откройте <code style="background:#242832;padding:2px 6px;border-radius:4px">config.js</code> и подставьте реальные значения:</p>
        <ol style="margin:12px 0 12px 20px">
          <li>Зарегистрируйтесь на <a href="https://supabase.com" target="_blank" style="color:#4f8cff">supabase.com</a></li>
          <li>Создайте новый проект</li>
          <li><b>Settings → API</b> → скопируйте <b>Project URL</b> и <b>anon public key</b></li>
          <li>Вставьте в <code style="background:#242832;padding:2px 6px;border-radius:4px">config.js</code> вместо заглушек</li>
          <li>В <b>SQL Editor</b> выполните содержимое <code style="background:#242832;padding:2px 6px;border-radius:4px">schema.sql</code></li>
          <li>Обновите страницу</li>
        </ol>
        <p style="color:#8b8f99;font-size:14px">Подробнее — в <code>README.md</code>.</p>
      </div>`;
    throw new Error('Supabase config not set');
  }
})();

const { createClient } = supabase;
const sb = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

const state = {
  user: null,
  workspaceId: null,
  currentView: 'today',
  modalKind: 'task',
  lists: [],            // [{id, name, icon, color, ...}]
  currentListId: null,  // null = «Все списки»
  editingListId: null   // когда открыта модалка редактирования списка
};

// ===== Утилиты =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d = new Date()) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function localDateStr(d) {
  // YYYY-MM-DD в локальной таймзоне (не сдвигает в UTC)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('ru', { day: '2-digit', month: 'short' });
}
function fmtDateTime(d) {
  const date = new Date(d);
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  if (date >= today && date < addDays(today, 1)) return 'сегодня ' + fmtTime(d);
  if (date >= tomorrow && date < addDays(tomorrow, 1)) return 'завтра ' + fmtTime(d);
  return fmtDate(d) + ' ' + fmtTime(d);
}

// ===== Auth =====
async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    await ensureWorkspace();
    showApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
async function showApp() {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadLists();
  updateListChip();
  render();
}

async function loadLists() {
  const { data, error } = await sb
    .from('lists')
    .select('*')
    .eq('workspace_id', state.workspaceId)
    .eq('archived', false)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.error('loadLists', error); state.lists = []; return; }
  state.lists = data || [];
}

function currentList() {
  return state.lists.find(l => l.id === state.currentListId);
}

function updateListChip() {
  const l = currentList();
  $('#list-chip-icon').textContent = l ? l.icon : '📋';
  $('#list-chip-name').textContent = l ? l.name : 'Все списки';
}

async function ensureWorkspace() {
  // Найти первый workspace юзера
  const { data: members, error: memErr } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', state.user.id)
    .limit(1);
  if (memErr) console.error('members error', memErr);

  if (members && members.length > 0) {
    state.workspaceId = members[0].workspace_id;
    return;
  }

  // Нет — создаём атомарно через серверную функцию
  const { data: newId, error } = await sb.rpc('init_workspace', { ws_name: 'Мой ежедневник' });
  if (error) {
    console.error('init_workspace error', error);
    alert('Не удалось создать workspace: ' + error.message + '\nПроверьте, выполнен ли schema_patch_1.sql в Supabase.');
    return;
  }
  state.workspaceId = newId;
}

$('#btn-login').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $('#auth-error').textContent = error.message; return; }
  $('#auth-error').textContent = '';
  await checkAuth();
});

$('#btn-register').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const { error } = await sb.auth.signUp({ email, password });
  if (error) { $('#auth-error').textContent = error.message; return; }
  $('#auth-error').textContent = 'Готово. Войдите.';
});

$('#btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  state.user = null;
  state.workspaceId = null;
  showAuth();
});

// ===== Tabs =====
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  state.currentView = t.dataset.view;
  render();
}));

// ===== Picker списков =====
$('#list-chip').addEventListener('click', openPicker);
$('#list-picker .picker-backdrop').addEventListener('click', closePicker);

function openPicker() {
  // Перерисовать список
  const wrap = $('#picker-lists');
  wrap.innerHTML = state.lists.map(l => `
    <button class="picker-item ${state.currentListId === l.id ? 'active' : ''}" data-list-id="${l.id}">
      <span class="picker-icon">${escapeHtml(l.icon || '📋')}</span>
      <span class="picker-name">${escapeHtml(l.name)}</span>
      <button class="picker-edit" data-action="edit" data-id="${l.id}" title="Редактировать">⋯</button>
    </button>
  `).join('');
  $('#list-picker').classList.remove('hidden');

  $$('#list-picker .picker-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'edit') {
        e.stopPropagation();
        closePicker();
        openListModal(e.target.dataset.id);
        return;
      }
      if (btn.dataset.action === 'new-list') {
        closePicker();
        openListModal(null);
        return;
      }
      state.currentListId = btn.dataset.listId || null;
      updateListChip();
      closePicker();
      render();
    });
  });
}
function closePicker() { $('#list-picker').classList.add('hidden'); }

// ===== Модалка списка (создание/редактирование) =====
$('#lm-cancel').addEventListener('click', () => $('#list-modal').classList.add('hidden'));
$('#lm-save').addEventListener('click', saveList);
$('#lm-delete').addEventListener('click', deleteList);
$$('.emoji-btn').forEach(b => b.addEventListener('click', () => {
  $('#lm-icon').value = b.textContent;
}));

function openListModal(listId) {
  state.editingListId = listId;
  const l = listId ? state.lists.find(x => x.id === listId) : null;
  $('#list-modal-title').textContent = l ? 'Редактировать список' : 'Новый список';
  $('#lm-name').value = l ? l.name : '';
  $('#lm-icon').value = l ? (l.icon || '') : '';
  $('#lm-color').value = l ? (l.color || '#4f8cff') : '#4f8cff';
  $('#lm-delete').classList.toggle('hidden', !l);
  $('#list-modal').classList.remove('hidden');
  setTimeout(() => $('#lm-name').focus(), 50);
}

async function saveList() {
  const name = $('#lm-name').value.trim();
  if (!name) { $('#lm-name').focus(); return; }
  const payload = {
    name,
    icon: $('#lm-icon').value.trim() || '📋',
    color: $('#lm-color').value || '#4f8cff'
  };
  if (state.editingListId) {
    await sb.from('lists').update(payload).eq('id', state.editingListId);
  } else {
    payload.workspace_id = state.workspaceId;
    payload.author_id = state.user.id;
    payload.position = state.lists.length;
    const { data } = await sb.from('lists').insert(payload).select().single();
    if (data) state.currentListId = data.id;
  }
  $('#list-modal').classList.add('hidden');
  await loadLists();
  updateListChip();
  render();
}

async function deleteList() {
  if (!state.editingListId) return;
  if (!confirm('Удалить список? Задачи в нём останутся (станут «без списка»).')) return;
  await sb.from('lists').delete().eq('id', state.editingListId);
  if (state.currentListId === state.editingListId) state.currentListId = null;
  $('#list-modal').classList.add('hidden');
  await loadLists();
  updateListChip();
  render();
}

// ===== Modal =====
$('#btn-add').addEventListener('click', () => openModal());
$('#m-cancel').addEventListener('click', closeModal);
$('#m-save').addEventListener('click', saveItem);
$$('.mtab').forEach(b => b.addEventListener('click', () => {
  $$('.mtab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.modalKind = b.dataset.kind;
  $('#modal-title').textContent = ({task:'Новая задача', note:'Новая мысль', goal:'Новая цель'})[state.modalKind];
}));

function openModal() {
  // Если открыта вкладка «Списки» — открываем модалку нового списка вместо задачи
  if (state.currentView === 'lists') { openListModal(null); return; }

  // Дефолт kind зависит от вкладки
  const kindForView = {
    now: 'task', today: 'task', tomorrow: 'task', week: 'task',
    notes: 'note', goals: 'goal'
  };
  state.modalKind = kindForView[state.currentView] || 'task';
  $$('.mtab').forEach(b => b.classList.toggle('active', b.dataset.kind === state.modalKind));
  $('#modal-title').textContent = ({task:'Новая задача', note:'Новая мысль', goal:'Новая цель'})[state.modalKind];

  // Дефолтная дата = сегодня для today/now, завтра для tomorrow
  const today = startOfDay();
  let defaultDate = today;
  if (state.currentView === 'tomorrow') defaultDate = addDays(today, 1);
  $('#m-date').value = localDateStr(defaultDate);
  $('#m-time').value = '';
  $('#m-text').value = '';
  $('#m-repeat').value = '';
  $('#m-priority').value = '0';

  // Селектор списков
  const sel = $('#m-list');
  sel.innerHTML = '<option value="">(без списка)</option>' +
    state.lists.map(l => `<option value="${l.id}">${escapeHtml(l.icon || '📋')} ${escapeHtml(l.name)}</option>`).join('');
  sel.value = state.currentListId || '';

  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#m-text').focus(), 50);
}
function closeModal() { $('#modal').classList.add('hidden'); }

async function saveItem() {
  const text = $('#m-text').value.trim();
  if (!text) return;

  if (state.modalKind === 'note') {
    await sb.from('notes').insert({
      workspace_id: state.workspaceId,
      author_id: state.user.id,
      text
    });
  } else if (state.modalKind === 'goal') {
    await sb.from('goals').insert({
      workspace_id: state.workspaceId,
      author_id: state.user.id,
      title: text
    });
  } else {
    const date = $('#m-date').value;
    const time = $('#m-time').value;
    let scheduled_at = null;
    if (date) {
      scheduled_at = new Date(date + 'T' + (time || '09:00') + ':00').toISOString();
    }
    await sb.from('tasks').insert({
      workspace_id: state.workspaceId,
      author_id: state.user.id,
      text,
      scheduled_at,
      repeat: $('#m-repeat').value || null,
      priority: parseInt($('#m-priority').value, 10) || 0,
      list_id: $('#m-list').value || null
    });
  }
  closeModal();
  render();
}

// ===== Render =====
async function render() {
  const c = $('#view-content');
  c.innerHTML = '<div class="empty">Загрузка...</div>';
  if (state.currentView === 'now') return renderTasksRange(c, new Date(), addHours(new Date(), 1), 'В ближайший час');
  if (state.currentView === 'today') return renderTasksRange(c, startOfDay(), endOfDay(), 'Сегодня');
  if (state.currentView === 'tomorrow') return renderTasksRange(c, addDays(startOfDay(), 1), addDays(endOfDay(), 1), 'Завтра');
  if (state.currentView === 'week') return renderWeek(c);
  if (state.currentView === 'notes') return renderNotes(c);
  if (state.currentView === 'goals') return renderGoals(c);
  if (state.currentView === 'lists') return renderLists(c);
}
function addHours(d, h) { const x = new Date(d); x.setHours(x.getHours()+h); return x; }

function applyListFilter(query) {
  // Если выбран конкретный список — фильтруем по нему
  if (state.currentListId) return query.eq('list_id', state.currentListId);
  return query;
}

async function fetchTasks(from, to) {
  let q = sb.from('tasks').select('*')
    .eq('workspace_id', state.workspaceId)
    .gte('scheduled_at', from.toISOString())
    .lte('scheduled_at', to.toISOString())
    .order('scheduled_at', { ascending: true });
  q = applyListFilter(q);
  const { data, error } = await q;
  if (error) console.error(error);
  return data || [];
}

async function fetchTasksNoDate() {
  let q = sb.from('tasks').select('*')
    .eq('workspace_id', state.workspaceId)
    .is('scheduled_at', null)
    .eq('done', false)
    .order('created_at', { ascending: false });
  q = applyListFilter(q);
  const { data } = await q;
  return data || [];
}

async function renderTasksRange(c, from, to, title) {
  const [scheduled, undated] = await Promise.all([fetchTasks(from, to), fetchTasksNoDate()]);
  let html = `<h3 class="section-title">${title}</h3>`;
  if (scheduled.length === 0 && undated.length === 0) {
    html += '<div class="empty">Пусто. Нажмите + чтобы добавить.</div>';
  } else {
    html += scheduled.map(taskCard).join('');
    if (state.currentView !== 'now' && undated.length > 0) {
      html += '<h3 class="section-title">Без даты</h3>';
      html += undated.map(taskCard).join('');
    }
  }
  c.innerHTML = html;
  bindCards(c);
}

async function renderWeek(c) {
  const from = startOfDay();
  const to = addDays(endOfDay(), 6);
  const tasks = await fetchTasks(from, to);
  if (tasks.length === 0) { c.innerHTML = '<div class="empty">На неделю задач нет.</div>'; return; }
  // Группируем по дню
  const byDay = {};
  for (const t of tasks) {
    const key = startOfDay(t.scheduled_at).toISOString();
    (byDay[key] ||= []).push(t);
  }
  let html = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    const items = byDay[day.toISOString()] || [];
    if (items.length === 0) continue;
    const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : day.toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
    html += `<h3 class="section-title">${label}</h3>`;
    html += items.map(taskCard).join('');
  }
  c.innerHTML = html || '<div class="empty">На неделю задач нет.</div>';
  bindCards(c);
}

async function renderNotes(c) {
  const { data } = await sb
    .from('notes')
    .select('*')
    .eq('workspace_id', state.workspaceId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!data || data.length === 0) { c.innerHTML = '<div class="empty">Мыслей пока нет.</div>'; return; }
  c.innerHTML = data.map(n => `
    <div class="card note-card" data-id="${n.id}" data-kind="note">
      <div class="card-body">
        <div class="card-meta">${fmtDateTime(n.created_at)}</div>
        <div class="card-text">${escapeHtml(n.text)}</div>
      </div>
      <button class="card-del" title="Удалить">×</button>
    </div>
  `).join('');
  bindCards(c);
}

async function renderGoals(c) {
  const { data } = await sb
    .from('goals')
    .select('*')
    .eq('workspace_id', state.workspaceId)
    .order('done', { ascending: true })
    .order('created_at', { ascending: false });
  if (!data || data.length === 0) { c.innerHTML = '<div class="empty">Целей пока нет.</div>'; return; }
  c.innerHTML = data.map(g => `
    <div class="card ${g.done ? 'done' : ''}" data-id="${g.id}" data-kind="goal">
      <div class="checkbox ${g.done ? 'checked' : ''}"></div>
      <div class="card-body">
        <div class="card-text">${escapeHtml(g.title)}</div>
        ${g.description ? `<div class="card-meta">${escapeHtml(g.description)}</div>` : ''}
      </div>
      <button class="card-del" title="Удалить">×</button>
    </div>
  `).join('');
  bindCards(c);
}

function taskCard(t) {
  const meta = [];
  if (t.scheduled_at) meta.push(`<span class="time">${fmtTime(t.scheduled_at)}</span>`);
  if (t.repeat) meta.push(`↻ ${({daily:'ежедневно',weekly:'еженедельно',monthly:'ежемесячно'})[t.repeat]}`);
  // Бэйдж списка показываем, только если не выбран конкретный список
  if (!state.currentListId && t.list_id) {
    const l = state.lists.find(x => x.id === t.list_id);
    if (l) meta.push(`<span class="card-list-badge">${escapeHtml(l.icon||'📋')} ${escapeHtml(l.name)}</span>`);
  }
  return `
    <div class="card ${t.done ? 'done' : ''} prio-${t.priority||0}" data-id="${t.id}" data-kind="task">
      <div class="checkbox ${t.done ? 'checked' : ''}"></div>
      <div class="card-body">
        <div class="card-text">${escapeHtml(t.text)}</div>
        ${meta.length ? `<div class="card-meta">${meta.join(' · ')}</div>` : ''}
      </div>
      <button class="card-del" title="Удалить">×</button>
    </div>
  `;
}

async function renderLists(c) {
  // Сводка задач по спискам
  const counts = {};
  if (state.lists.length > 0) {
    const ids = state.lists.map(l => l.id);
    const { data } = await sb.from('tasks')
      .select('list_id')
      .eq('workspace_id', state.workspaceId)
      .eq('done', false)
      .in('list_id', ids);
    for (const r of (data || [])) counts[r.list_id] = (counts[r.list_id]||0) + 1;
  }
  const cards = state.lists.map(l => `
    <div class="list-card" data-list-id="${l.id}" style="border-left-color:${escapeHtml(l.color||'#4f8cff')}">
      <button class="list-card-edit" data-action="edit" data-id="${l.id}">⋯</button>
      <div class="list-card-icon">${escapeHtml(l.icon || '📋')}</div>
      <div class="list-card-name">${escapeHtml(l.name)}</div>
      <div class="list-card-count">${counts[l.id]||0} активных</div>
    </div>
  `).join('');
  c.innerHTML = `
    <h3 class="section-title">Списки</h3>
    <div class="list-grid">
      ${cards}
      <div class="list-card list-card-add" data-action="new">＋</div>
    </div>
  `;
  // Биндим
  c.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'edit') {
        e.stopPropagation();
        openListModal(e.target.dataset.id);
        return;
      }
      if (card.dataset.action === 'new') {
        openListModal(null);
        return;
      }
      state.currentListId = card.dataset.listId;
      updateListChip();
      // Переключаем на «Сегодня» для удобства
      state.currentView = 'today';
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'today'));
      render();
    });
  });
}

function bindCards(root) {
  root.querySelectorAll('.checkbox').forEach(cb => {
    cb.addEventListener('click', async (e) => {
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const kind = card.dataset.kind;
      const done = !card.classList.contains('done');
      const table = kind === 'goal' ? 'goals' : 'tasks';
      await sb.from(table).update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id);
      render();
    });
  });
  root.querySelectorAll('.card-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Удалить?')) return;
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const table = ({task:'tasks', note:'notes', goal:'goals'})[card.dataset.kind];
      await sb.from(table).delete().eq('id', id);
      render();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== Старт =====
checkAuth();
