const firebaseConfig = {
    apiKey: "AIzaSyDAozYqHIjJe-ptzkVIfqLMC2XTyMG0GaI", authDomain: "meucronogramaenem.firebaseapp.com",
    projectId: "meucronogramaenem", storageBucket: "meucronogramaenem.firebasestorage.app",
    messagingSenderId: "933774063012", appId: "1:933774063012:web:5f3556ea2c0f1885a4bd31"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentTasks = [], selectedDate = null, activeTask = null, editingTaskId = null;
let uploadedImageBase64 = "", tempRedacaoPhoto = "", activeTaskFilter = 'all';

// =====================================================================
// A CHAVE DE API AGORA É CONFIGURADA NAS CONFIGURAÇÕES DO SITE
// Ela fica salva apenas no seu navegador (localStorage)
// =====================================================================
let GEMINI_API_KEY = localStorage.getItem('gemini_api_key') || "";

function showAlert(msg) {
    document.getElementById('alert-message').innerText = msg;
    document.getElementById('modal-alert').style.display = 'flex';
}

function toggleTaskFilter(type) {
    if (activeTaskFilter === type) activeTaskFilter = 'all'; else activeTaskFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.style.opacity = '0.3');
    if (activeTaskFilter !== 'all') document.getElementById('filter-' + type).style.opacity = '1';
    else document.querySelectorAll('.filter-btn').forEach(btn => btn.style.opacity = '1');
    renderTaskList();
}

const subjectColors = {
    "Matemática": "#ef4444", "Biologia": "#22c55e", "Física": "#38bdf8", "Química": "#f59e0b",
    "Redação": "#a855f7", "Linguagens": "#ec4899", "Humanas": "#8b5cf6", "História": "#f97316",
    "Geografia": "#14b8a6", "Filosofia": "#6366f1", "Sociologia": "#4f46e5",
    "1º Dia (Ling/Humanas)": "#d946ef", "2º Dia (Mat/Natureza)": "#84cc16",
    "Questões": "#fbbf24", "Geral": "#fbbf24"
};
function getColor(materia) { return subjectColors[materia] || '#94a3b8'; }

const defaultTopics = {
    "Matemática": ["Matemática Básica", "Estatística", "Geometria Plana", "Geometria Espacial", "Funções"],
    "Biologia": ["Ecologia", "Citologia", "Genética", "Fisiologia Humana", "Botânica", "Evolução"],
    "Física": ["Mecânica", "Eletrodinâmica", "Termologia", "Ondulatória", "Óptica"],
    "Química": ["Físico-Química", "Química Geral", "Química Orgânica", "Estequiometria", "Eletroquímica"],
    "História": ["Idade Contemporânea", "História do Brasil", "Era Vargas", "Guerra Fria"],
    "Geografia": ["Geografia Agrária", "Meio Ambiente", "Geopolítica", "Geografia Urbana"],
    "Filosofia": ["Ética e Moral", "Filosofia Antiga", "Socráticos"],
    "Sociologia": ["Sociologia do Trabalho", "Cultura e Ideologia", "Movimentos Sociais"],
    "Linguagens": ["Interpretação de Texto", "Figuras de Linguagem", "Vanguardas Europeias"]
};

function updateTopicDatalist() {
    const materia = document.getElementById('task-materia').value;
    const datalist = document.getElementById('topic-suggestions'); datalist.innerHTML = '';
    let custom = JSON.parse(localStorage.getItem('user_custom_topics')) || {};
    let defaults = defaultTopics[materia] || []; let userT = custom[materia] || [];
    [...new Set([...defaults, ...userT])].forEach(t => { let opt = document.createElement('option'); opt.value = t; datalist.appendChild(opt); });
}

function saveCustomTopic(materia, topic) {
    if (!topic) return; let custom = JSON.parse(localStorage.getItem('user_custom_topics')) || {};
    if (!custom[materia]) custom[materia] = [];
    if (!custom[materia].includes(topic)) { custom[materia].push(topic); localStorage.setItem('user_custom_topics', JSON.stringify(custom)); }
}

async function resetPlatform() {
    if (!confirm("Eita! Isso vai apagar TODO o seu histórico. Tem certeza?")) return;
    try {
        const snapshot = await db.collection("tasks").where("userId", "==", auth.currentUser.uid).get();
        const batch = db.batch(); snapshot.docs.forEach(doc => { batch.delete(doc.ref); }); await batch.commit();
        localStorage.clear();
        showAlert("Tudo zerado! Bora focar na meta.");
        document.getElementById('user-pic').src = auth.currentUser.photoURL || 'https://via.placeholder.com/70';
        loadEdits(); closeModal('modal-settings');
    } catch (e) { showAlert("Erro ao zerar: " + e.message); }
}

function updateCountdown() {
    const anoTexto = document.getElementById('edit-ano').innerText;
    const match = anoTexto.match(/\d{4}/);
    const targetYear = match ? parseInt(match[0]) : 2026;
    const targetDate = new Date(`${targetYear}-11-01T00:00:00`).getTime();
    const now = new Date().getTime();
    const diff = targetDate - now;
    let days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) days = 0;
    document.getElementById('countdown-days').innerText = days + " dias";
}

async function loadEdits() {
    if (auth.currentUser) {
        const doc = await db.collection("users").doc(auth.currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.meta) document.getElementById('edit-meta').innerText = data.meta;
            if (data.ano) document.getElementById('edit-ano').innerText = data.ano;
        } else {
            const meta = localStorage.getItem('enem_meta'), ano = localStorage.getItem('enem_ano');
            if (meta) document.getElementById('edit-meta').innerText = meta;
            if (ano) document.getElementById('edit-ano').innerText = ano;
        }
    }
    updateCountdown();
}

async function saveEdits() {
    const meta = document.getElementById('edit-meta').innerText;
    const ano = document.getElementById('edit-ano').innerText;
    localStorage.setItem('enem_meta', meta);
    localStorage.setItem('enem_ano', ano);
    if (auth.currentUser) {
        await db.collection("users").doc(auth.currentUser.uid).set({ meta, ano }, { merge: true });
    }
    updateCountdown();
}

function handleFileUpload(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function (e) { uploadedImageBase64 = e.target.result; document.getElementById('set-photo').value = "Imagem carregada"; document.getElementById('set-photo').disabled = true; }; reader.readAsDataURL(file); }
function handleRedacaoPhotoUpload(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function (e) { tempRedacaoPhoto = e.target.result; }; reader.readAsDataURL(file); }

function openSettings() {
    uploadedImageBase64 = ""; document.getElementById('set-name').value = auth.currentUser.displayName || '';
    const localPhoto = localStorage.getItem('custom_profile_pic');
    if (localPhoto && localPhoto.startsWith('data:image')) { document.getElementById('set-photo').value = "Imagem carregada"; document.getElementById('set-photo').disabled = true; }
    else { document.getElementById('set-photo').value = localPhoto || auth.currentUser.photoURL || ''; document.getElementById('set-photo').disabled = false; }
    
    // Carregar chave do Gemini
    document.getElementById('set-gemini-key').value = localStorage.getItem('gemini_api_key') || '';
    
    document.getElementById('modal-settings').style.display = 'flex';
}

async function saveSettings() {
    const name = document.getElementById('set-name').value; 
    let photo = document.getElementById('set-photo').value;
    const geminiKey = document.getElementById('set-gemini-key').value;
    try {
        if (uploadedImageBase64) localStorage.setItem('custom_profile_pic', uploadedImageBase64); else if (photo !== "Imagem carregada") localStorage.setItem('custom_profile_pic', photo);
        
        // Salvar chave do Gemini
        localStorage.setItem('gemini_api_key', geminiKey.trim());
        GEMINI_API_KEY = geminiKey.trim();

        await auth.currentUser.updateProfile({ displayName: name });
        document.getElementById('user-name').innerText = name.split(' ')[0];
        document.getElementById('user-pic').src = localStorage.getItem('custom_profile_pic') || auth.currentUser.photoURL || 'https://via.placeholder.com/70';
        closeModal('modal-settings');
        showAlert("Perfil atualizado com sucesso!");
    } catch (e) { showAlert("Erro ao atualizar: " + e.message); }
}

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthSelect = document.getElementById('cal-month'), yearSelect = document.getElementById('cal-year');
months.forEach((m, i) => { let opt = document.createElement('option'); opt.value = i; opt.innerText = m; monthSelect.appendChild(opt); });
for (let y = 2025; y <= 2027; y++) { let opt = document.createElement('option'); opt.value = y; opt.innerText = y; yearSelect.appendChild(opt); }
const now = new Date(); monthSelect.value = now.getMonth(); yearSelect.value = now.getFullYear();

function loginGoogle() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
function logout() { closeModal('modal-settings'); auth.signOut(); }

function checkNotifications() {
    let lastNotif = localStorage.getItem('last_review_notif'), nowTime = new Date().getTime(), oneWeek = 7 * 24 * 60 * 60 * 1000, needsNotif = false;
    let hasUnreviewedErrors = currentTasks.some(t => t.status === 'done' && t.errors > 0 && !t.reviewed);
    if (hasUnreviewedErrors) { if (!lastNotif || (nowTime - parseInt(lastNotif)) > oneWeek) { if (Math.random() < 0.3) { needsNotif = true; localStorage.setItem('last_review_notif', nowTime.toString()); } } } else { localStorage.setItem('has_unread_notif', 'false'); }
    if (needsNotif || localStorage.getItem('has_unread_notif') === 'true') { document.getElementById('notif-badge').style.display = 'block'; localStorage.setItem('has_unread_notif', 'true'); } else { document.getElementById('notif-badge').style.display = 'none'; }
}
function openNotifications() { document.getElementById('notif-badge').style.display = 'none'; localStorage.setItem('has_unread_notif', 'false'); document.getElementById('modal-notif').style.display = 'flex'; }

auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('login-screen').style.display = 'none'; document.getElementById('app').style.display = 'flex';
        document.getElementById('user-name').innerText = user.displayName ? user.displayName.split(' ')[0] : 'Estudante';
        document.getElementById('user-pic').src = localStorage.getItem('custom_profile_pic') || user.photoURL || 'https://via.placeholder.com/70';
        loadEdits();
        loadTasks();
        restoreTimers();
    } else { document.getElementById('login-screen').style.display = 'flex'; document.getElementById('app').style.display = 'none'; }
});

function showPage(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active'); if (btn && btn.classList.contains('nav-link')) btn.classList.add('active');
    if (id === 'desempenho' || id === 'redacao' || id === 'conquistas') { initCharts(); renderConquistas(); }
}

function toggleChart(type) {
    const selectVal = document.getElementById(`${type}-chart-type`).value;
    if (selectVal === 'pie') { document.getElementById(`${type}-pie-container`).style.display = 'block'; document.getElementById(`${type}-bar-container`).style.display = 'none'; }
    else { document.getElementById(`${type}-pie-container`).style.display = 'none'; document.getElementById(`${type}-bar-container`).style.display = 'block'; }
}

function toggleList(target) {
    const incDiv = document.getElementById('tasks-incomplete-container'), donDiv = document.getElementById('tasks-done-container');
    if (target === 'incomplete') { incDiv.style.display = incDiv.style.display === 'none' ? 'block' : 'none'; donDiv.style.display = 'none'; }
    else { donDiv.style.display = donDiv.style.display === 'none' ? 'block' : 'none'; incDiv.style.display = 'none'; }
}

function toggleTaskFields() {
    const type = document.getElementById('task-type').value; const container = document.getElementById('dynamic-fields'); let html = '';
    const matSelect = `<select id="task-materia" onchange="updateTopicDatalist()"><option value="Matemática">Matemática</option><option value="Biologia">Biologia</option><option value="Física">Física</option><option value="Química">Química</option><option value="História">História</option><option value="Geografia">Geografia</option><option value="Filosofia">Filosofia</option><option value="Sociologia">Sociologia</option><option value="Linguagens">Linguagens</option></select>`;
    if (type === 'aula') html = matSelect + `<input type="text" id="task-content" list="topic-suggestions" placeholder="Conteúdo da Aula">`;
    else if (type === 'questoes') html = matSelect + `<input type="text" id="task-content" list="topic-suggestions" placeholder="Assunto das questões"><input type="number" id="task-qnt" placeholder="Quantidade de questões">`;
    else if (type === 'simulado') html = `<select id="task-materia"><option value="1º Dia (Ling/Humanas)">1º Dia (Ling/Humanas)</option><option value="2º Dia (Mat/Natureza)">2º Dia (Mat/Natureza)</option><option value="Questões">Questões (Simulado Geral)</option></select><input type="text" id="task-content" placeholder="Nome do Simulado (Ex: SAS, Bernoulli, Enem 2023)"><input type="number" id="task-qnt" placeholder="Quantidade de questões do simulado">`;
    else if (type === 'redacao') { html = `<input type="hidden" id="task-materia" value="Redação"><input type="text" id="task-content" placeholder="Tema da Redação"><label style="font-size:0.85rem; color:var(--dim); margin-top:10px; display:block;">Qual a sua meta de pontuação?</label><input type="number" id="task-meta-redacao" placeholder="Ex: 900" max="1000">`; }
    container.innerHTML = html; if (type === 'aula' || type === 'questoes') updateTopicDatalist();
}

function openNewTaskModal() {
    editingTaskId = null; document.getElementById('modal-date-label').innerText = `Agendar: ${selectedDate.split('-').reverse().join('/')}`;
    document.getElementById('task-type').value = 'aula'; toggleTaskFields();
    document.getElementById('task-start-time').value = '08:00'; document.getElementById('task-end-time').value = '09:00';
    document.getElementById('repeat-container').style.display = 'flex'; document.getElementById('delete-task-container').style.display = 'none';
    closeModal('modal-daily'); document.getElementById('modal-task').style.display = 'flex';
}

function renderCalendar() {
    const month = parseInt(monthSelect.value), year = parseInt(yearSelect.value), body = document.getElementById('calendar-body');
    body.innerHTML = '<div class="day-label">Dom</div><div class="day-label">Seg</div><div class="day-label">Ter</div><div class="day-label">Qua</div><div class="day-label">Qui</div><div class="day-label">Sex</div><div class="day-label">Sáb</div>';
    const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate(), todayStr = new Date().toISOString().split('T')[0];
    for (let i = 0; i < firstDay; i++) body.innerHTML += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTasks = currentTasks.filter(t => t.date === dateStr).sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
        const dayDiv = document.createElement('div'); dayDiv.className = `day-box ${todayStr === dateStr ? 'today' : ''}`;
        dayDiv.onclick = () => { selectedDate = dateStr; document.getElementById('daily-date-label').innerText = `Dia ${dateStr.split('-').reverse().join('/')}`; renderDailyTasks(dateStr); document.getElementById('modal-daily').style.display = 'flex'; };
        let html = `<span class="day-num">${d}</span>`;
        dayTasks.forEach(t => {
            let isRedacaoMedal = (t.type === 'redacao' && t.status === 'done' && t.metaRedacao && t.score >= t.metaRedacao) ? ' 🏆' : '';
            html += `<div class="tag ${t.type}" style="${t.status === 'done' ? 'opacity:0.6; text-decoration:line-through;' : ''}">${t.startTime ? t.startTime + ' - ' : ''}${t.materia}${isRedacaoMedal}</div>`;
        });
        dayDiv.innerHTML = html; body.appendChild(dayDiv);
    }
}

function renderDailyTasks(dateStr) {
    const list = document.getElementById('daily-tasks-list'); const dayTasks = currentTasks.filter(t => t.date === dateStr).sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    if (dayTasks.length === 0) { list.innerHTML = '<p style="color:var(--dim); text-align:center; padding: 20px 0;">Você está livre hoje! Nenhuma tarefa agendada.</p>'; return; }
    let html = '';
    dayTasks.forEach(t => {
        let cor = getColor(t.materia);
        let titleText = `${t.materia} (${t.type.toUpperCase()})`;
        if (t.type === 'simulado' && t.content) titleText += ` - ${t.content}`;
        else if (t.content) titleText += ` - ${t.content}`;
        html += `<div class="daily-task-item" style="border-left-color: ${cor}">
                    <div class="time">${t.startTime} às ${t.endTime}</div>
                    <div class="title">${titleText}</div>
                    <div style="margin-top: 5px;"><button class="btn-edit" onclick="openEditModal('${t.id}')">✏️ Editar</button></div>
                 </div>`;
    }); list.innerHTML = html;
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function handleSaveTask() {
    const type = document.getElementById('task-type').value, materia = document.getElementById('task-materia').value, contentElem = document.getElementById('task-content'), qntElem = document.getElementById('task-qnt'), startTime = document.getElementById('task-start-time').value, endTime = document.getElementById('task-end-time').value, metaRedacaoElem = document.getElementById('task-meta-redacao');
    let plannedTime = 0;
    if (startTime && endTime) {
        plannedTime = (new Date(`1970-01-01T${endTime}:00`) - new Date(`1970-01-01T${startTime}:00`)) / 60000;
        if (plannedTime <= 0) return showAlert("O horário final precisa ser maior que o de início.");
    }
    let contentVal = contentElem ? contentElem.value : '';
    if ((type === 'aula' || type === 'questoes') && contentVal) saveCustomTopic(materia, contentVal);

    const taskData = {
        userId: auth.currentUser.uid,
        type,
        materia,
        status: 'pending',
        content: contentVal,
        qnt: qntElem ? parseInt(qntElem.value) : 0,
        startTime,
        endTime,
        plannedTime,
        reviewed: false
    };
    if (type === 'redacao' && metaRedacaoElem && !editingTaskId) { taskData.metaRedacao = parseInt(metaRedacaoElem.value) || 0; }
    if (editingTaskId) {
        const oldTask = currentTasks.find(t => t.id === editingTaskId);
        if (oldTask && oldTask.reviewed !== undefined) taskData.reviewed = oldTask.reviewed;
        if (oldTask && oldTask.type === 'redacao' && oldTask.metaRedacao) taskData.metaRedacao = oldTask.metaRedacao;
        taskData.date = selectedDate;
        await db.collection("tasks").doc(editingTaskId).update(taskData);
        closeModal('modal-task');
        loadTasks();
        document.getElementById('modal-success').style.display = 'flex';
        return;
    }
    taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    const repeat = document.getElementById('task-repeat').checked, baseDate = new Date(selectedDate + 'T12:00:00');
    for (let i = 0; i < (repeat ? 3 : 1); i++) {
        const d = new Date(baseDate); d.setDate(d.getDate() + (i * 7));
        taskData.date = d.toISOString().split('T')[0]; await db.collection("tasks").add(taskData);
    }
    closeModal('modal-task');
    loadTasks();
    document.getElementById('modal-success').style.display = 'flex';
}

function openEditModal(id) {
    const task = currentTasks.find(t => t.id === id); if (!task) return;
    editingTaskId = task.id; selectedDate = task.date;
    document.getElementById('modal-date-label').innerText = `Editar: ${task.date.split('-').reverse().join('/')}`;
    document.getElementById('task-type').value = task.type; toggleTaskFields();
    document.getElementById('task-materia').value = task.materia;
    if (document.getElementById('task-content')) document.getElementById('task-content').value = task.content || '';
    if (document.getElementById('task-qnt')) document.getElementById('task-qnt').value = task.qnt || '';
    if (document.getElementById('task-meta-redacao')) {
        document.getElementById('task-meta-redacao').value = task.metaRedacao || '';
        document.getElementById('task-meta-redacao').disabled = true;
    }
    document.getElementById('task-start-time').value = task.startTime || '00:00'; document.getElementById('task-end-time').value = task.endTime || '00:00';
    document.getElementById('repeat-container').style.display = 'none'; document.getElementById('delete-task-container').style.display = 'block';
    closeModal('modal-daily'); document.getElementById('modal-task').style.display = 'flex';
}

function loadTasks() {
    db.collection("tasks").where("userId", "==", auth.currentUser.uid).onSnapshot(snap => {
        currentTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(); renderTaskList(); renderReviewSection(); checkNotifications(); renderConquistas();
        if (document.getElementById('desempenho').classList.contains('active')) initCharts();
    });
}

function renderCard(t, statusClass, statusText) {
    let details = `${t.startTime || '?'} às ${t.endTime || '?'} (${t.plannedTime || 0} min)`;
    if (t.type === 'aula') details += ` | ${t.content}`;
    else if (t.type === 'simulado') details += ` | Simulado: ${t.content || 'Geral'} - Meta: ${t.qnt}Q`;
    else if (t.type === 'questoes') details += ` | ${t.content || ''} - Meta: ${t.qnt}Q`;
    else if (t.type === 'redacao') details += ` | Tema: ${t.content}`;

    const card = document.createElement('div'); card.className = `task-card ${statusClass}`;
    let photoBtn = (t.type === 'redacao' && t.photo) ? `<button class="btn-edit" style="color:var(--primary); border-color:var(--primary);" onclick="openPhotoModal('${t.photo}')">📷 Ver Foto</button>` : '';
    let diffHtml = t.difficulty ? `<span class="difficulty-badge diff-${t.difficulty}">${t.difficulty}</span>` : '';
    let scoreHtml = '';
    if (t.score !== undefined) {
        if (t.type === 'redacao' && t.metaRedacao) {
            let scoreColor = 'var(--purple)', scoreText = `Nota: ${t.score} (Meta: ${t.metaRedacao})`;
            if (t.score < t.metaRedacao) scoreColor = 'var(--danger)';
            else if (t.score > t.metaRedacao) scoreColor = 'var(--success)';
            scoreHtml = `<div style="color:${scoreColor}; font-weight:bold; margin-top:5px;">🎯 ${scoreText}</div>`;
        } else { scoreHtml = `<div style="color:var(--purple); font-weight:bold; margin-top:5px;">Nota: ${t.score}</div>`; }
    }
    let editBtnHtml = `<button class="btn-edit" onclick="openEditModal('${t.id}')">✏️ Editar</button>`;
    if (t.type === 'redacao' && statusClass === 'done') editBtnHtml = '';

    card.innerHTML = `
        <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px; flex-wrap:wrap;">
                <span class="badge-type ${t.type}">${t.type}</span> ${diffHtml}
                <strong style="color:var(--text); font-size:1.1rem; margin-left:5px;">${t.date.split('-').reverse().join('/')} - ${t.materia}</strong>
            </div>
            <div style="color:var(--dim); margin:5px 0; font-size:0.9rem;">${details}</div>
            ${scoreHtml}
            <span style="font-size: 0.8rem; font-weight: bold; margin-top:5px; display:inline-block; color: ${t.status === 'done' ? 'var(--success)' : (statusClass === 'incomplete' ? 'var(--danger)' : 'var(--dim)')}">${statusText}</span>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
            ${photoBtn} ${editBtnHtml}
            ${t.status === 'pending' ? `<button onclick="openDoneModal('${t.id}')" style="background:var(--success); border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold; color:#000;">Avaliar</button>` : ''}
        </div>
    `;
    return card;
}

function renderTaskList() {
    const listPending = document.getElementById('tasks-pending-list'), listIncomplete = document.getElementById('tasks-incomplete-list'), listDone = document.getElementById('tasks-done-list'), redacaoList = document.getElementById('redacao-list');
    listPending.innerHTML = ""; listIncomplete.innerHTML = ""; listDone.innerHTML = ""; redacaoList.innerHTML = "";
    const today = new Date().toISOString().split('T')[0]; let redacaoArr = [];
    currentTasks.forEach(t => {
        let statusClass = t.status === 'done' ? 'done' : (t.date < today ? 'incomplete' : '');
        let statusText = t.status === 'done' ? 'CONCLUÍDO' : (t.date < today ? 'ATRASADA' : 'PENDENTE');
        let card = renderCard(t, statusClass, statusText);
        if (t.type === 'redacao') { t._statusWeight = statusClass === 'done' ? 1 : (statusClass === 'incomplete' ? 3 : 2); redacaoArr.push({ task: t, card: card }); }
        else {
            if (activeTaskFilter !== 'all' && t.type !== activeTaskFilter) return;
            if (statusClass === 'done') listDone.appendChild(card); else if (statusClass === 'incomplete') listIncomplete.appendChild(card); else listPending.appendChild(card);
        }
    });
    redacaoArr.sort((a, b) => { if (a.task._statusWeight !== b.task._statusWeight) return a.task._statusWeight - b.task._statusWeight; return b.task.date.localeCompare(a.task.date); }).forEach(item => redacaoList.appendChild(item.card));
}

function openPhotoModal(imgSrc) { document.getElementById('view-photo-img').src = imgSrc; document.getElementById('modal-photo-view').style.display = 'flex'; }
function openImprovementModal() { document.getElementById('modal-improvement').style.display = 'flex'; }

function openDifficultyDetails(diff) {
    const list = document.getElementById('diff-modal-list');
    const title = document.getElementById('diff-modal-title');
    title.innerText = `Histórico: Nível ${diff.charAt(0).toUpperCase() + diff.slice(1)}`;
    const filtered = currentTasks.filter(t => t.status === 'done' && t.difficulty === diff);
    list.innerHTML = filtered.length === 0 ? '<p style="color:var(--dim); text-align:center;">Nenhuma questão registrada.</p>' : '';
    filtered.forEach(t => {
        list.innerHTML += `<div style="background:var(--card); padding:15px; border-radius:8px; margin-bottom:10px; border-left:4px solid ${getColor(t.materia)};">
                <div style="font-weight:bold;">${t.date.split('-').reverse().join('/')} - ${t.materia}</div>
                <div style="color:var(--success);">Acertos: ${t.hits || 0} | Erros: ${t.errors || 0}</div>
            </div>`;
    });
    document.getElementById('modal-diff-details').style.display = 'flex';
}

function renderReviewSection() {
    const reviewList = document.getElementById('review-list'), improveList = document.getElementById('improve-list');
    let reviewHtml = ''; let matStats = {}; let reviewedCount = 0; let pendingCount = 0;
    currentTasks.forEach(t => {
        let matLida = t.materia === "Geral" ? "Questões" : t.materia;
        if (t.status === 'done' && (t.type === 'questoes' || t.type === 'simulado')) {
            if (!matStats[matLida]) matStats[matLida] = { hits: 0, total: 0 };
            let hits = t.hits || 0, errors = t.errors || 0; matStats[matLida].hits += hits; matStats[matLida].total += (hits + errors);
            if (errors > 0) {
                if (t.reviewed) reviewedCount++; else {
                    pendingCount++;
                    reviewHtml += `<div style="background:var(--bg); padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--danger);">
                                    <div><strong>${matLida}</strong> - ${t.errors} erros<div style="font-size:0.8rem; color:var(--dim);">${t.date.split('-').reverse().join('/')}</div></div>
                                    <button onclick="markAsReviewed('${t.id}')" class="btn-edit">Revisado</button>
                                   </div>`;
                }
            }
        }
    });
    reviewList.innerHTML = reviewHtml || '<div style="text-align:center; padding: 20px 0; color:var(--dim);">Tudo limpo! 🎉</div>';
    document.getElementById('imp-reviewed-count').innerText = reviewedCount;
    document.getElementById('imp-pending-count').innerText = pendingCount;
}

async function markAsReviewed(id) { await db.collection("tasks").doc(id).update({ reviewed: true }); }
async function deleteTaskFromModal() { if (!editingTaskId) return; if (confirm("Apagar tarefa?")) await db.collection("tasks").doc(editingTaskId).delete(); closeModal('modal-task'); }

function openDoneModal(id) {
    activeTask = currentTasks.find(t => t.id === id); tempRedacaoPhoto = "";
    document.getElementById('done-task-info').innerText = `${activeTask.materia} (${activeTask.type.toUpperCase()})`;
    const container = document.getElementById('done-dynamic-fields');
    document.getElementById('difficulty-selection').style.display = (activeTask.type === 'questoes' || activeTask.type === 'simulado') ? 'block' : 'none';
    let html = '';
    if (activeTask.type === 'redacao') {
        html = `<input type="number" id="done-score" placeholder="Nota da Redação (0 - 1000)">
                <input type="file" id="done-redacao-file" accept="image/*" onchange="handleRedacaoPhotoUpload(event)">`;
    } else {
        html = `<input type="number" id="done-time" value="${activeTask.plannedTime || ''}" placeholder="Tempo real (minutos)">`;
        if (activeTask.type === 'questoes' || activeTask.type === 'simulado') {
            html += `<div style="display:flex; gap:10px;"><input type="number" id="done-hits" placeholder="Acertos"><input type="number" id="done-errors" placeholder="Erros"></div>`;
        }
    }
    container.innerHTML = html; document.getElementById('modal-done').style.display = 'flex';
}

function setDifficulty(val) {
    document.getElementById('task-difficulty-val').value = val;
    document.querySelectorAll('#difficulty-selection button').forEach(b => b.style.background = 'var(--bg)');
    document.getElementById('btn-diff-' + val).style.background = 'var(--card)';
}

async function confirmTaskCompletion() {
    let updateData = { status: 'done', completedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (activeTask.type === 'redacao') {
        const score = parseInt(document.getElementById('done-score').value);
        if (isNaN(score)) return showAlert("Insira a nota.");
        updateData.score = score; if (tempRedacaoPhoto) updateData.photo = tempRedacaoPhoto;
    } else {
        const time = parseInt(document.getElementById('done-time').value);
        if (isNaN(time)) return showAlert("Insira o tempo.");
        updateData.realTime = time;
        if (activeTask.type === 'questoes' || activeTask.type === 'simulado') {
            const hits = parseInt(document.getElementById('done-hits').value);
            const errs = parseInt(document.getElementById('done-errors').value);
            const diff = document.getElementById('task-difficulty-val').value;
            if (isNaN(hits) || isNaN(errs) || !diff) return showAlert("Preencha todos os campos.");
            updateData.hits = hits; updateData.errors = errs; updateData.difficulty = diff;
        }
    }
    await db.collection("tasks").doc(activeTask.id).update(updateData); closeModal('modal-done');
}

function renderConquistas() {
    const doneTasks = currentTasks.filter(t => t.status === 'done');
    const totalQ = doneTasks.reduce((acc, t) => acc + ((t.hits || 0) + (t.errors || 0)), 0);
    document.getElementById('stats-total-q').innerText = totalQ;
    const medals = [
        { title: "Calouro", desc: "100 questões", icon: "🌱", val: totalQ, target: 100 },
        { title: "Veterano", desc: "500 questões", icon: "🔥", val: totalQ, target: 500 },
        { title: "Escritor", desc: "5 redações", icon: "🖋️", val: doneTasks.filter(t => t.type === 'redacao').length, target: 5 }
    ];
    document.getElementById('medal-container').innerHTML = medals.map(m => `
        <div class="medal-card ${m.val >= m.target ? 'unlocked' : 'locked'}">
            <span class="medal-icon">${m.icon}</span><div class="medal-title">${m.title}</div>
            <div class="medal-desc">${m.desc}</div>
        </div>`).join('');
}

let timerObj = { pomo: { int: null, time: 3000 }, stop: { int: null, time: 0, start: null } };
function formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; }

function startPomodoro() {
    let mins = document.getElementById('pomo-focus-time').value;
    timerObj.pomo.time = mins * 60;
    startPomoReal();
}

function startPomoReal() {
    clearInterval(timerObj.pomo.int);
    timerObj.pomo.int = setInterval(() => {
        timerObj.pomo.time--;
        document.getElementById('pomo-display').innerText = formatTime(timerObj.pomo.time);
        if (timerObj.pomo.time <= 0) { clearInterval(timerObj.pomo.int); showAlert("Fim do Foco!"); }
    }, 1000);
}

function pauseTimer(type) { clearInterval(timerObj[type].int); }

function startStopwatch() {
    clearInterval(timerObj.stop.int);
    timerObj.stop.start = Date.now() - (timerObj.stop.time * 1000);
    timerObj.stop.int = setInterval(() => {
        timerObj.stop.time = Math.floor((Date.now() - timerObj.stop.start) / 1000);
        document.getElementById('stop-display').innerText = formatTime(timerObj.stop.time);
    }, 1000);
}

function pauseStopwatch() { clearInterval(timerObj.stop.int); }
function resetStopwatch() { pauseStopwatch(); timerObj.stop.time = 0; document.getElementById('stop-display').innerText = "00:00"; }
function restoreTimers() {}

function toggleDashDates() { document.getElementById('custom-dates').style.display = (document.getElementById('dash-filter-type').value === 'custom') ? 'flex' : 'none'; }
function getFilteredTasks() { return currentTasks.filter(t => t.status === 'done'); }

let donutChart, dailyBarChart;
function initCharts() {
    const tasks = getFilteredTasks();
    if (donutChart) donutChart.destroy();
    const hits = tasks.reduce((a, t) => a + (t.hits || 0), 0);
    const errs = tasks.reduce((a, t) => a + (t.errors || 0), 0);
    donutChart = new Chart(document.getElementById('accDonutChart'), { type: 'doughnut', data: { labels: ['Acertos', 'Erros'], datasets: [{ data: [hits, errs], backgroundColor: ['#22c55e', '#ef4444'] }] } });
}

const iaQuestions = [
    { q: "Qual sua média atual estimada?", o: ["Abaixo de 600", "600-700", "700-750", "Acima de 750"] },
    { q: "Qual curso você quer?", o: ["Medicina", "Engenharia/Computação", "Direito/Humanas", "Outros"] },
    { q: "Quantas horas líquidas tem por dia?", o: ["1-2h", "3-4h", "5-6h", "7h+"] },
    { q: "Qual sua maior dificuldade?", o: ["Matemática", "Natureza", "Humanas", "Linguagens"] },
    { q: "Como está sua base em Matemática?", o: ["Preciso do zero", "Básica", "Média", "Avançada"] },
    { q: "Já faz redações toda semana?", o: ["Sim", "Não", "Às vezes", "Vou começar"] },
    { q: "Como você estuda teoria?", o: ["Videoaula", "Leitura/PDF", "Resumos", "Mapas Mentais"] },
    { q: "Faz quantos simulados por mês?", o: ["Nenhum", "1 por mês", "2 por mês", "4+ por mês"] },
    { q: "Tem dificuldade em Natureza?", o: ["Muita", "Média", "Pouca", "Sou bom"] },
    { q: "Como é seu sono?", o: ["Menos de 6h", "6-7h", "7-8h", "8h+"] },
    { q: "Você trabalha ou só estuda?", o: ["Só estudo", "Trabalho Integral", "Meio Período", "Freelancer"] },
    { q: "Qual matéria você MAIS odeia?", o: ["Física", "Química", "Matemática", "Português"] },
    { q: "Sente muita ansiedade na prova?", o: ["Muita", "Moderada", "Pouca", "Tranquilo"] },
    { q: "Como está seu desempenho em Humanas?", o: ["Bom (+35 acertos)", "Médio (25-35)", "Baixo (<25)", "Não sei"] },
    { q: "Está disposto a ter uma Mente Blindada?", o: ["Sim, foco total!", "Vou tentar", "Talvez", "Sim!"] }
];

let currentIAQuestion = 0;
let userIAResponses = [];

function startIAQuestionnaire() {
    currentIAQuestion = 0; userIAResponses = [];
    document.getElementById('modal-ia-questions').style.display = 'flex';
    document.getElementById('question-container').style.display = 'block';
    document.getElementById('ia-loading').style.display = 'none';
    showIAQuestion();
}

function showIAQuestion() {
    const q = iaQuestions[currentIAQuestion];
    document.getElementById('ia-q-title').innerText = `Pergunta ${currentIAQuestion + 1} de ${iaQuestions.length}`;
    document.getElementById('ia-q-text').innerText = q.q;
    const optionsDiv = document.getElementById('ia-options');
    optionsDiv.innerHTML = '';
    q.o.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn-action';
        btn.innerText = opt;
        btn.onclick = () => {
            userIAResponses.push(opt);
            currentIAQuestion++;
            if (currentIAQuestion < iaQuestions.length) showIAQuestion();
            else generateCronogramaIA();
        };
        optionsDiv.appendChild(btn);
    });
}

async function generateCronogramaIA() {
    // Verifica se a chave está disponível
    if (!GEMINI_API_KEY) {
        closeModal('modal-ia-questions');
        showAlert("⚠️ Chave do Gemini não configurada. Por favor, adicione sua chave nas Configurações.");
        openSettings(); // Abre as configurações para o usuário colar a chave
        return;
    }

    document.getElementById('question-container').style.display = 'none';
    document.getElementById('ia-loading').style.display = 'block';

    const hoje = new Date().toISOString().split('T')[0];
    const prompt = `Você é um Mentor de Aprovação do ENEM especialista no método "Mente Blindada". Seu objetivo é levar o estudante Rafael aos 800+ de média geral para cursar Ciência da Computação na UFMG.

Contexto do Usuário:
- Nome: Rafael (19 anos, BH)
- Foco: ENEM 2026
- Respostas do Perfil: ${userIAResponses.join(", ")}
- Data de Início: ${hoje}

Tarefa:
Gere um cronograma de estudos para os próximos 7 dias úteis. Você deve priorizar Matemática Básica e Natureza, alternando entre teoria (aula) e prática (questões).

Regras Estritas:
1. Use APENAS estas matérias: [Matemática, Biologia, Física, Química, História, Geografia, Filosofia, Sociologia, Linguagens].
2. O conteúdo deve ser específico (Ex: em vez de "Biologia", use "Transporte Passivo" ou "Citologia").
3. Retorne APENAS um array JSON puro, sem textos explicativos, sem Markdown (sem aspas triplas \`\`\`), pronto para ser lido por um script.

Estrutura do JSON:
[
  {
    "date": "YYYY-MM-DD",
    "type": "aula|questoes|simulado|redacao",
    "materia": "Nome da Matéria",
    "content": "Tópico Específico",
    "startTime": "HH:MM",
    "endTime": "HH:MM"
  }
]`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `Erro HTTP ${response.status}`);
        }

        const data = await response.json();
        const raw = data.candidates[0].content.parts[0].text;
        const cleanJson = raw.replace(/```json|```/g, "").trim();
        const tasks = JSON.parse(cleanJson);

        if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("Resposta da IA inválida.");

        const batch = db.batch();
        tasks.forEach(t => {
            const ref = db.collection("tasks").doc();
            batch.set(ref, {
                ...t,
                userId: auth.currentUser.uid,
                status: 'pending',
                qnt: t.qnt || 0,
                reviewed: false
            });
        });
        await batch.commit();

        closeModal('modal-ia-questions');
        showAlert(`✅ Cronograma com ${tasks.length} tarefas aplicado com sucesso!`);

    } catch (e) {
        console.error("Erro Gemini:", e);
        closeModal('modal-ia-questions');
        showAlert("❌ Erro ao gerar cronograma: " + e.message);
    }
}
