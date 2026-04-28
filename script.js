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
    "Geografia": "#14b8a6", "Filosofia": "#6366f1", "Sociologia": "#4f46e5", "1º Dia (Ling/Humanas)": "#d946ef", "2º Dia (Mat/Natureza)": "#84cc16", "Questões": "#fbbf24", "Geral": "#fbbf24"
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
    if(!topic) return; let custom = JSON.parse(localStorage.getItem('user_custom_topics')) || {};
    if(!custom[materia]) custom[materia] = [];
    if(!custom[materia].includes(topic)) { custom[materia].push(topic); localStorage.setItem('user_custom_topics', JSON.stringify(custom)); }
}

async function resetPlatform() {
    if(!confirm("Eita! Isso vai apagar TODO o seu histórico. Tem certeza?")) return;
    try {
        const snapshot = await db.collection("tasks").where("userId", "==", auth.currentUser.uid).get();
        const batch = db.batch(); snapshot.docs.forEach(doc => { batch.delete(doc.ref); }); await batch.commit();
        localStorage.clear(); 
        showAlert("Tudo zerado! Bora focar na meta.");
        document.getElementById('user-pic').src = auth.currentUser.photoURL || 'https://via.placeholder.com/70';
        loadEdits(); closeModal('modal-settings');
    } catch(e) { showAlert("Erro ao zerar: " + e.message); }
}

// NOVA LÓGICA DE COUNTDOWN DINÂMICO
function updateCountdown() {
    const anoTexto = document.getElementById('edit-ano').innerText;
    const match = anoTexto.match(/\d{4}/);
    const targetYear = match ? parseInt(match[0]) : 2026;
    
    // Definimos a data do ENEM como aprox 1 de Novembro do ano selecionado
    const targetDate = new Date(`${targetYear}-11-01T00:00:00`).getTime();
    const now = new Date().getTime();
    const diff = targetDate - now;
    let days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) days = 0;
    document.getElementById('countdown-days').innerText = days + " dias";
}

async function loadEdits() {
    // Tenta carregar do Firestore primeiro
    if (auth.currentUser) {
        const doc = await db.collection("users").doc(auth.currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.meta) document.getElementById('edit-meta').innerText = data.meta;
            if (data.ano) document.getElementById('edit-ano').innerText = data.ano;
        } else {
            // Fallback para localStorage se não houver no Firestore
            const meta = localStorage.getItem('enem_meta'), ano = localStorage.getItem('enem_ano');
            if(meta) document.getElementById('edit-meta').innerText = meta;
            if(ano) document.getElementById('edit-ano').innerText = ano;
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

function handleFileUpload(event) { const file = event.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = function(e) { uploadedImageBase64 = e.target.result; document.getElementById('set-photo').value = "Imagem carregada"; document.getElementById('set-photo').disabled = true; }; reader.readAsDataURL(file); }
function handleRedacaoPhotoUpload(event) { const file = event.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = function(e) { tempRedacaoPhoto = e.target.result; }; reader.readAsDataURL(file); }

function openSettings() {
    uploadedImageBase64 = ""; document.getElementById('set-name').value = auth.currentUser.displayName || '';
    const localPhoto = localStorage.getItem('custom_profile_pic');
    if(localPhoto && localPhoto.startsWith('data:image')) { document.getElementById('set-photo').value = "Imagem carregada"; document.getElementById('set-photo').disabled = true; } 
    else { document.getElementById('set-photo').value = localPhoto || auth.currentUser.photoURL || ''; document.getElementById('set-photo').disabled = false; }
    document.getElementById('modal-settings').style.display = 'flex';
}

async function saveSettings() {
    const name = document.getElementById('set-name').value; let photo = document.getElementById('set-photo').value;
    try {
        if(uploadedImageBase64) localStorage.setItem('custom_profile_pic', uploadedImageBase64); else if (photo !== "Imagem carregada") localStorage.setItem('custom_profile_pic', photo);
        await auth.currentUser.updateProfile({ displayName: name });
        document.getElementById('user-name').innerText = name.split(' ')[0];
        document.getElementById('user-pic').src = localStorage.getItem('custom_profile_pic') || auth.currentUser.photoURL || 'https://via.placeholder.com/70';
        closeModal('modal-settings'); 
        showAlert("Perfil atualizado com sucesso!");
    } catch(e) { showAlert("Erro ao atualizar: " + e.message); }
}

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthSelect = document.getElementById('cal-month'), yearSelect = document.getElementById('cal-year');
months.forEach((m, i) => { let opt = document.createElement('option'); opt.value = i; opt.innerText = m; monthSelect.appendChild(opt); });
for(let y = 2025; y <= 2027; y++) { let opt = document.createElement('option'); opt.value = y; opt.innerText = y; yearSelect.appendChild(opt); }
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
        restoreTimers(); // Restaura os cronometros se fechar a aba
    } else { document.getElementById('login-screen').style.display = 'flex'; document.getElementById('app').style.display = 'none'; }
});

function showPage(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active'); if(btn && btn.classList.contains('nav-link')) btn.classList.add('active');
    if(id === 'desempenho' || id === 'redacao' || id === 'conquistas') { initCharts(); renderConquistas(); }
}

function toggleChart(type) {
    const selectVal = document.getElementById(`${type}-chart-type`).value;
    if(selectVal === 'pie') { document.getElementById(`${type}-pie-container`).style.display = 'block'; document.getElementById(`${type}-bar-container`).style.display = 'none'; } 
    else { document.getElementById(`${type}-pie-container`).style.display = 'none'; document.getElementById(`${type}-bar-container`).style.display = 'block'; }
}

function toggleList(target) {
    const incDiv = document.getElementById('tasks-incomplete-container'), donDiv = document.getElementById('tasks-done-container');
    if(target === 'incomplete') { incDiv.style.display = incDiv.style.display === 'none' ? 'block' : 'none'; donDiv.style.display = 'none'; } 
    else { donDiv.style.display = donDiv.style.display === 'none' ? 'block' : 'none'; incDiv.style.display = 'none'; }
}

function toggleTaskFields() {
    const type = document.getElementById('task-type').value; const container = document.getElementById('dynamic-fields'); let html = '';
    const matSelect = `<select id="task-materia" onchange="updateTopicDatalist()"><option value="Matemática">Matemática</option><option value="Biologia">Biologia</option><option value="Física">Física</option><option value="Química">Química</option><option value="História">História</option><option value="Geografia">Geografia</option><option value="Filosofia">Filosofia</option><option value="Sociologia">Sociologia</option><option value="Linguagens">Linguagens</option></select>`;
    if (type === 'aula') html = matSelect + `<input type="text" id="task-content" list="topic-suggestions" placeholder="Conteúdo da Aula">`;
    else if (type === 'questoes') html = matSelect + `<input type="text" id="task-content" list="topic-suggestions" placeholder="Assunto das questões"><input type="number" id="task-qnt" placeholder="Quantidade de questões">`;
    else if (type === 'simulado') html = `<select id="task-materia"><option value="1º Dia (Ling/Humanas)">1º Dia (Ling/Humanas)</option><option value="2º Dia (Mat/Natureza)">2º Dia (Mat/Natureza)</option><option value="Questões">Questões (Simulado Geral)</option></select><input type="text" id="task-content" placeholder="Nome do Simulado (Ex: SAS, Bernoulli, Enem 2023)"><input type="number" id="task-qnt" placeholder="Quantidade de questões do simulado">`;
    else if (type === 'redacao') { html = `<input type="hidden" id="task-materia" value="Redação"><input type="text" id="task-content" placeholder="Tema da Redação"><label style="font-size:0.85rem; color:var(--dim); margin-top:10px; display:block;">Qual a sua meta de pontuação?</label><input type="number" id="task-meta-redacao" placeholder="Ex: 900" max="1000">`; }
    container.innerHTML = html; if(type === 'aula' || type === 'questoes') updateTopicDatalist();
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
    for(let i = 0; i < firstDay; i++) body.innerHTML += '<div></div>';
    for(let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayTasks = currentTasks.filter(t => t.date === dateStr).sort((a,b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
        const dayDiv = document.createElement('div'); dayDiv.className = `day-box ${todayStr === dateStr ? 'today' : ''}`;
        dayDiv.onclick = () => { selectedDate = dateStr; document.getElementById('daily-date-label').innerText = `Dia ${dateStr.split('-').reverse().join('/')}`; renderDailyTasks(dateStr); document.getElementById('modal-daily').style.display = 'flex'; };
        let html = `<span class="day-num">${d}</span>`;
        dayTasks.forEach(t => {
            let isRedacaoMedal = (t.type === 'redacao' && t.status === 'done' && t.metaRedacao && t.score >= t.metaRedacao) ? ' 🏆' : '';
            html += `<div class="tag ${t.type}" style="${t.status === 'done' ? 'opacity:0.6; text-decoration:line-through;' : ''}">${t.startTime ? t.startTime+' - ' : ''}${t.materia}${isRedacaoMedal}</div>`;
        });
        dayDiv.innerHTML = html; body.appendChild(dayDiv);
    }
}

function renderDailyTasks(dateStr) {
    const list = document.getElementById('daily-tasks-list'); const dayTasks = currentTasks.filter(t => t.date === dateStr).sort((a,b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
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
function timeToMins(timeStr) { if(!timeStr) return 0; let parts = timeStr.split(':'); return parseInt(parts[0]) * 60 + parseInt(parts[1]); }

async function handleSaveTask() {
    const type = document.getElementById('task-type').value, materia = document.getElementById('task-materia').value, contentElem = document.getElementById('task-content'), qntElem = document.getElementById('task-qnt'), startTime = document.getElementById('task-start-time').value, endTime = document.getElementById('task-end-time').value, metaRedacaoElem = document.getElementById('task-meta-redacao');
    let plannedTime = 0;
    
    if(startTime && endTime) {
        plannedTime = (new Date(`1970-01-01T${endTime}:00`) - new Date(`1970-01-01T${startTime}:00`)) / 60000;
        if (plannedTime <= 0) return showAlert("O horário final precisa ser maior que o de início.");
        // A trava de choque de horários foi removida aqui conforme solicitado.
    }
    
    let contentVal = contentElem ? contentElem.value : '';
    if((type === 'aula' || type === 'questoes') && contentVal) saveCustomTopic(materia, contentVal);

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

    if(editingTaskId) {
        const oldTask = currentTasks.find(t => t.id === editingTaskId);
        if(oldTask && oldTask.reviewed !== undefined) taskData.reviewed = oldTask.reviewed;
        if(oldTask && oldTask.type === 'redacao' && oldTask.metaRedacao) taskData.metaRedacao = oldTask.metaRedacao; 
        taskData.date = selectedDate; 
        // Não sobrescreve createdAt em edições
        await db.collection("tasks").doc(editingTaskId).update(taskData);
        closeModal('modal-task');
        loadTasks();
        document.getElementById('modal-success').style.display = 'flex'; 
        return;
    }

    taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); // Só adiciona em novas tarefas
    const repeat = document.getElementById('task-repeat').checked, baseDate = new Date(selectedDate + 'T12:00:00');
    for(let i = 0; i < (repeat ? 3 : 1); i++) {
        const d = new Date(baseDate); d.setDate(d.getDate() + (i * 7));
        taskData.date = d.toISOString().split('T')[0]; await db.collection("tasks").add(taskData);
    }
    closeModal('modal-task');
    loadTasks();
    document.getElementById('modal-success').style.display = 'flex'; 
}

function openEditModal(id) {
    const task = currentTasks.find(t => t.id === id); if(!task) return;
    editingTaskId = task.id; selectedDate = task.date;
    document.getElementById('modal-date-label').innerText = `Editar: ${task.date.split('-').reverse().join('/')}`;
    document.getElementById('task-type').value = task.type; toggleTaskFields();
    document.getElementById('task-materia').value = task.materia;
    if(document.getElementById('task-content')) document.getElementById('task-content').value = task.content || '';
    if(document.getElementById('task-qnt')) document.getElementById('task-qnt').value = task.qnt || '';
    
    if(document.getElementById('task-meta-redacao')) {
        document.getElementById('task-meta-redacao').value = task.metaRedacao || '';
        document.getElementById('task-meta-redacao').disabled = true;
        document.getElementById('task-meta-redacao').title = "A meta não pode ser alterada depois de agendada!";
    }
    
    document.getElementById('task-start-time').value = task.startTime || '00:00'; document.getElementById('task-end-time').value = task.endTime || '00:00';
    document.getElementById('repeat-container').style.display = 'none'; document.getElementById('delete-task-container').style.display = 'block'; 
    closeModal('modal-daily'); document.getElementById('modal-task').style.display = 'flex';
}

function loadTasks() {
    db.collection("tasks").where("userId", "==", auth.currentUser.uid).onSnapshot(snap => {
        currentTasks = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderCalendar(); renderTaskList(); renderReviewSection(); checkNotifications(); renderConquistas();
        if(document.getElementById('desempenho').classList.contains('active')) initCharts();
    });
}

function renderCard(t, statusClass, statusText) {
    let details = `${t.startTime || '?'} às ${t.endTime || '?'} (${t.plannedTime || 0} min)`;
    if(t.type === 'aula') details += ` | ${t.content}`;
    else if(t.type === 'simulado') details += ` | Simulado: ${t.content || 'Geral'} - Meta: ${t.qnt}Q`;
    else if(t.type === 'questoes') details += ` | ${t.content || ''} - Meta: ${t.qnt}Q`;
    else if(t.type === 'redacao') details += ` | Tema: ${t.content}`;

    const card = document.createElement('div'); card.className = `task-card ${statusClass}`;
    let photoBtn = (t.type === 'redacao' && t.photo) ? `<button class="btn-edit" style="color:var(--primary); border-color:var(--primary);" onclick="openPhotoModal('${t.photo}')">📷 Ver Foto</button>` : '';

    let diffHtml = t.difficulty ? `<span class="difficulty-badge diff-${t.difficulty}">${t.difficulty}</span>` : '';
    let scoreHtml = '';
    if (t.score !== undefined) { 
        if (t.type === 'redacao' && t.metaRedacao) {
            let scoreColor = 'var(--purple)', scoreText = `Nota: ${t.score} (Meta: ${t.metaRedacao})`;
            if (t.score < t.metaRedacao) { scoreColor = 'var(--danger)'; scoreText += ' - Não concluída'; } 
            else if (t.score === t.metaRedacao) { scoreColor = 'var(--accent)'; scoreText += ' - Na mosca!'; } 
            else { scoreColor = 'var(--success)'; scoreText += ' - Meta superada!'; }
            scoreHtml = `<div style="color:${scoreColor}; font-weight:bold; margin-top:5px;">🎯 ${scoreText}</div>`;
        } else { scoreHtml = `<div style="color:var(--purple); font-weight:bold; margin-top:5px;">Nota: ${t.score}</div>`; }
    }
    
    let editBtnHtml = `<button class="btn-edit" onclick="openEditModal('${t.id}')">✏️ Editar</button>`;
    if (t.type === 'redacao' && statusClass === 'done') { editBtnHtml = ''; }

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
        if (t.type === 'redacao') { t._statusWeight = statusClass === 'done' ? 1 : (statusClass === 'incomplete' ? 3 : 2); redacaoArr.push({task: t, card: card}); } 
        else {
            if (activeTaskFilter !== 'all' && t.type !== activeTaskFilter) return;
            if (statusClass === 'done') listDone.appendChild(card); else if (statusClass === 'incomplete') listIncomplete.appendChild(card); else listPending.appendChild(card);
        }
    });
    redacaoArr.sort((a,b) => { if(a.task._statusWeight !== b.task._statusWeight) return a.task._statusWeight - b.task._statusWeight; return b.task.date.localeCompare(a.task.date); }).forEach(item => redacaoList.appendChild(item.card));
    if(listPending.innerHTML === '') listPending.innerHTML = '<p style="color:var(--dim); font-size:0.9rem;">Nenhuma tarefa pendente por aqui!</p>';
    if(listIncomplete.innerHTML === '') listIncomplete.innerHTML = '<p style="color:var(--dim); font-size:0.9rem;">Você não tem tarefas atrasadas!</p>';
    if(listDone.innerHTML === '') listDone.innerHTML = '<p style="color:var(--dim); font-size:0.9rem;">Nenhuma tarefa concluída ainda.</p>';
    if(redacaoList.innerHTML === '') redacaoList.innerHTML = '<p style="color:var(--dim); font-size:0.9rem;">Nenhuma redação registrada.</p>';
}

function openPhotoModal(imgSrc) { document.getElementById('view-photo-img').src = imgSrc; document.getElementById('modal-photo-view').style.display = 'flex'; }
function openImprovementModal() { document.getElementById('modal-improvement').style.display = 'flex'; }

function openDifficultyDetails(diff) {
    const list = document.getElementById('diff-modal-list');
    const title = document.getElementById('diff-modal-title');
    const diffNames = { 'facil': 'Nível Fácil', 'medio': 'Nível Médio', 'dificil': 'Nível Difícil' };
    const diffColors = { 'facil': 'var(--success)', 'medio': 'var(--accent)', 'dificil': 'var(--danger)' };
    
    title.innerText = `Histórico: ${diffNames[diff]}`; title.style.color = diffColors[diff];
    const filtered = currentTasks.filter(t => t.status === 'done' && t.difficulty === diff && (t.type === 'questoes' || t.type === 'simulado'));
    
    if (filtered.length === 0) { list.innerHTML = '<p style="color:var(--dim); text-align:center;">Nenhuma questão avaliada nesse nível ainda.</p>'; } 
    else {
        let html = '';
        filtered.sort((a,b) => b.date.localeCompare(a.date)).forEach(t => {
            let desc = t.type === 'simulado' ? `Simulado: ${t.content || 'Geral'}` : (t.content || 'Treinamento Geral');
            html += `<div style="background:var(--card); padding:15px; border-radius:8px; margin-bottom:10px; border-left:4px solid ${getColor(t.materia)};">
                <div style="font-weight:bold; color:var(--text);">${t.date.split('-').reverse().join('/')} - ${t.materia}</div>
                <div style="font-size:0.85rem; color:var(--dim); margin-top:3px;">${desc}</div>
                <div style="margin-top:8px; font-size:0.9rem; font-weight:bold;">
                    <span style="color:var(--success);">✅ Acertos: ${t.hits||0}</span> <span style="margin: 0 5px; color:var(--border);">|</span> 
                    <span style="color:var(--danger);">❌ Erros: ${t.errors||0}</span>
                </div>
            </div>`;
        }); list.innerHTML = html;
    }
    document.getElementById('modal-diff-details').style.display = 'flex';
}

function renderReviewSection() {
    const reviewList = document.getElementById('review-list'), improveList = document.getElementById('improve-list');
    let reviewHtml = ''; let matStats = {}; let reviewedCount = 0; let pendingCount = 0;
    currentTasks.forEach(t => {
        let matLida = t.materia === "Geral" ? "Questões" : t.materia;
        if(t.status === 'done' && (t.type === 'questoes' || t.type === 'simulado')) {
            if(!matStats[matLida]) matStats[matLida] = { hits: 0, total: 0 };
            let hits = t.hits || 0, errors = t.errors || 0; matStats[matLida].hits += hits; matStats[matLida].total += (hits + errors);
            if(errors > 0) {
                if(t.reviewed) { reviewedCount++; } else {
                    pendingCount++;
                    let desc = t.type === 'simulado' ? `Simulado: ${t.content || 'Geral'}` : (t.content || 'Treino Geral');
                    reviewHtml += `<div style="background:var(--bg); padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--danger); flex-wrap: wrap; gap: 10px;">
                                    <div><strong style="color:#fff;">${matLida}</strong> <span style="color:var(--dim); font-size:0.9rem;">- ${desc}</span><div style="font-size:0.85rem; color:var(--danger); font-weight:bold; margin-top:3px;">❌ ${errors} erro(s) em ${t.date.split('-').reverse().join('/')}</div></div>
                                    <button onclick="markAsReviewed('${t.id}')" style="background:var(--success); color:#000; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:0.85rem;">Revisado</button>
                                   </div>`;
                }
            }
        }
    });
    if(reviewHtml === '') reviewHtml = '<div style="text-align:center; padding: 20px 0; color:var(--dim);">Nenhuma revisão pendente. 🎉</div>';
    reviewList.innerHTML = reviewHtml; document.getElementById('imp-reviewed-count').innerText = reviewedCount; document.getElementById('imp-pending-count').innerText = pendingCount;
    let improveArr = Object.keys(matStats).map(mat => { return { materia: mat, acc: matStats[mat].total > 0 ? (matStats[mat].hits / matStats[mat].total) : 0, total: matStats[mat].total }; }).filter(item => item.acc < 0.70 && item.total >= 5).sort((a,b) => a.acc - b.acc).slice(0, 4);
    let impHtml = ''; improveArr.forEach(item => { impHtml += `<span style="background:rgba(245, 158, 11, 0.15); color:var(--accent); padding:10px 15px; border-radius:8px; border:1px solid var(--accent); font-weight:bold; font-size:0.9rem;">${item.materia} (${(item.acc*100).toFixed(0)}%)</span>`; });
    if(impHtml === '') impHtml = '<div style="color:var(--success); font-weight:bold; width: 100%; text-align: center;">Suas médias estão ótimas! Continue assim! 🔥</div>';
    improveList.innerHTML = impHtml;
}

async function markAsReviewed(id) { await db.collection("tasks").doc(id).update({reviewed: true}); }
async function deleteTaskFromModal() { if(!editingTaskId) return; if(!confirm("Deseja apagar essa tarefa definitivamente?")) return; await db.collection("tasks").doc(editingTaskId).delete(); closeModal('modal-task'); }

function openDoneModal(id) {
    activeTask = currentTasks.find(t => t.id === id); tempRedacaoPhoto = ""; 
    document.getElementById('done-task-info').innerText = `${activeTask.materia === 'Geral' ? 'Questões' : activeTask.materia} (${activeTask.type.toUpperCase()})`;
    const container = document.getElementById('done-dynamic-fields');
    const diffContainer = document.getElementById('difficulty-selection');
    
    document.getElementById('task-difficulty-val').value = '';
    document.querySelectorAll('#difficulty-selection button').forEach(b => b.style.background = 'var(--bg)');

    if (activeTask.type === 'questoes' || activeTask.type === 'simulado') { diffContainer.style.display = 'block'; } 
    else { diffContainer.style.display = 'none'; }

    let html = '';
    if(activeTask.type === 'redacao') {
        html = `<input type="number" id="done-score" placeholder="Nota da Redação (0 - 1000)" max="1000">
                <div style="margin-top:15px; background:var(--bg); padding:15px; border-radius:8px; border:1px solid var(--border);">
                    <label style="font-size:0.85rem; color:var(--dim); display:block; margin-bottom:8px;">📷 Adicionar Foto da Redação (Opcional)</label>
                    <input type="file" id="done-redacao-file" accept="image/*" onchange="handleRedacaoPhotoUpload(event)" style="margin:0; padding:5px;">
                </div>`;
    } else {
        html = `<input type="number" id="done-time" value="${activeTask.plannedTime || ''}" placeholder="Tempo real gasto em minutos">`;
        if(activeTask.type === 'questoes' || activeTask.type === 'simulado') {
            html += `<div style="display:flex; gap:10px;"><input type="number" id="done-hits" placeholder="Acertos" style="border-color:var(--success)"><input type="number" id="done-errors" placeholder="Erros" style="border-color:var(--danger)"></div>`;
        }
    }
    container.innerHTML = html; document.getElementById('modal-done').style.display = 'flex';
}

function setDifficulty(val) {
    document.getElementById('task-difficulty-val').value = val;
    document.getElementById('btn-diff-facil').style.background = 'var(--bg)';
    document.getElementById('btn-diff-medio').style.background = 'var(--bg)';
    document.getElementById('btn-diff-dificil').style.background = 'var(--bg)';
    document.getElementById('btn-diff-'+val).style.background = 'var(--card)';
}

async function confirmTaskCompletion() {
    let updateData = { status: 'done', completedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewed: false };
    
    if(activeTask.type === 'redacao') {
        const score = parseInt(document.getElementById('done-score').value);
        if(isNaN(score)) return showAlert("Insira a nota da sua redação.");
        updateData.score = score; if(tempRedacaoPhoto) updateData.photo = tempRedacaoPhoto;
    } else {
        const time = parseInt(document.getElementById('done-time').value);
        if(isNaN(time)) return showAlert("Preencha o tempo gasto!");
        updateData.realTime = time;
        if(activeTask.type === 'questoes' || activeTask.type === 'simulado') {
            const hits = parseInt(document.getElementById('done-hits').value);
            const errs = parseInt(document.getElementById('done-errors').value);
            const diff = document.getElementById('task-difficulty-val').value;
            
            if(isNaN(hits) || isNaN(errs)) return showAlert("Preencha a quantidade de acertos e erros.");
            if(!diff) return showAlert("Não se esqueça de marcar a dificuldade da questão.");
            
            updateData.hits = hits; updateData.errors = errs; updateData.difficulty = diff;
        }
    }
    await db.collection("tasks").doc(activeTask.id).update(updateData); closeModal('modal-done');
}

// ==========================================
// GAMIFICAÇÃO: CONQUISTAS E 50 MISSÕES
// ==========================================
function renderConquistas() {
    const today = new Date(); 
    const todayStr = today.toISOString().split('T')[0];
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startWeekStr = startOfWeek.toISOString().split('T')[0];
    const endWeekStr = endOfWeek.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0,7);

    const doneTasks = currentTasks.filter(t => t.status === 'done');
    const questoes = doneTasks.filter(t => t.type === 'questoes' || t.type === 'simulado');
    const redacoes = doneTasks.filter(t => t.type === 'redacao');

    let stats = {
        totalQ: 0, facilQ: 0, medioQ: 0, dificilQ: 0,
        qToday: 0, qWeek: 0, qMonth: 0,
        timeToday: 0, timeWeek: 0, timeMonth: 0,
        redToday: 0, redWeek: 0, redMonth: 0,
        matQ: 0, natQ: 0, humQ: 0, linQ: 0
    };

    questoes.forEach(q => {
        let qs = (q.hits || 0) + (q.errors || 0);
        stats.totalQ += qs;
        if (q.difficulty === 'facil') stats.facilQ += qs;
        if (q.difficulty === 'medio') stats.medioQ += qs;
        if (q.difficulty === 'dificil') stats.dificilQ += qs;
        
        if (q.date === todayStr) { stats.qToday += qs; stats.timeToday += (q.realTime||0); }
        if (q.date >= startWeekStr && q.date <= endWeekStr) { stats.qWeek += qs; stats.timeWeek += (q.realTime||0); }
        if (q.date.startsWith(monthStr)) { stats.qMonth += qs; stats.timeMonth += (q.realTime||0); }

        let matLida = q.materia === "Geral" ? "Questões" : q.materia;
        if (matLida === 'Matemática') stats.matQ += qs;
        else if (['Biologia', 'Física', 'Química', '2º Dia (Mat/Natureza)'].includes(matLida)) stats.natQ += qs;
        else if (['História', 'Geografia', 'Filosofia', 'Sociologia', '1º Dia (Ling/Humanas)'].includes(matLida)) stats.humQ += qs;
        else if (matLida === 'Linguagens') stats.linQ += qs;
    });

    redacoes.forEach(r => {
        if (r.date === todayStr) stats.redToday++;
        if (r.date >= startWeekStr && r.date <= endWeekStr) stats.redWeek++;
        if (r.date.startsWith(monthStr)) stats.redMonth++;
    });

    document.getElementById('stats-total-q').innerText = stats.totalQ;
    document.getElementById('stats-facil-q').innerText = stats.facilQ;
    document.getElementById('stats-medio-q').innerText = stats.medioQ;
    document.getElementById('stats-dificil-q').innerText = stats.dificilQ;

    let metaBatidaCount = redacoes.filter(r => r.score && r.metaRedacao && r.score >= r.metaRedacao).length;

    const medals = [
        { title: "Calouro", desc: "Resolver 100 questões", icon: "🌱", val: stats.totalQ, target: 100 },
        { title: "Veterano", desc: "Resolver 500 questões", icon: "🔥", val: stats.totalQ, target: 500 },
        { title: "O Grande Mestre", desc: "Resolver 1.000 questões", icon: "👑", val: stats.totalQ, target: 1000 },
        { title: "Escritor", desc: "Fazer 5 redações", icon: "🖋️", val: redacoes.length, target: 5 },
        { title: "Elite 900+", desc: "Bater 10 metas de Redação", icon: "💎", val: metaBatidaCount, target: 10 }
    ];
    document.getElementById('medal-container').innerHTML = medals.map(m => {
        const isUnlocked = m.val >= m.target;
        return `<div class="medal-card ${isUnlocked ? 'unlocked' : 'locked'}">
                    <span class="medal-icon">${m.icon}</span><div class="medal-title">${m.title}</div>
                    <div class="medal-desc">${m.desc}</div><div style="font-size:0.75rem; color:var(--primary); margin-top:10px; font-weight:bold;">${Math.min(m.val, m.target)} / ${m.target}</div>
                </div>`;
    }).join('');

    const missionDefs = [
        { t:'diaria', title:'Aquecimento', desc:'Faça 5 questões hoje', val: stats.qToday, req: 5 },
        { t:'diaria', title:'Pegando o Ritmo', desc:'Faça 15 questões hoje', val: stats.qToday, req: 15 },
        { t:'diaria', title:'Foco Enem', desc:'Faça 30 questões hoje', val: stats.qToday, req: 30 },
        { t:'diaria', title:'Simulador Parcial', desc:'Faça 45 questões hoje', val: stats.qToday, req: 45 },
        { t:'diaria', title:'Guerreiro do Dia', desc:'Faça 60 questões hoje', val: stats.qToday, req: 60 },
        { t:'diaria', title:'Maratonista', desc:'Faça 90 questões hoje', val: stats.qToday, req: 90 },

        { t:'diaria', title:'Meia horinha', desc:'Estude 30 min hoje', val: stats.timeToday, req: 30 },
        { t:'diaria', title:'Uma horinha', desc:'Estude 60 min hoje', val: stats.timeToday, req: 60 },
        { t:'diaria', title:'Sessão Dupla', desc:'Estude 120 min hoje', val: stats.timeToday, req: 120 },
        { t:'diaria', title:'Hardcore', desc:'Estude 240 min hoje', val: stats.timeToday, req: 240 },
        { t:'diaria', title:'Nível Asiático', desc:'Estude 300 min hoje', val: stats.timeToday, req: 300 },

        { t:'semanal', title:'Semana Start', desc:'Faça 50 questões na semana', val: stats.qWeek, req: 50 },
        { t:'semanal', title:'Constância', desc:'Faça 100 questões na semana', val: stats.qWeek, req: 100 },
        { t:'semanal', title:'Acelerando', desc:'Faça 150 questões na semana', val: stats.qWeek, req: 150 },
        { t:'semanal', title:'Ritmo Forte', desc:'Faça 200 questões na semana', val: stats.qWeek, req: 200 },
        { t:'semanal', title:'Modo Máquina', desc:'Faça 300 questões na semana', val: stats.qWeek, req: 300 },
        { t:'semanal', title:'Imparável', desc:'Faça 400 questões na semana', val: stats.qWeek, req: 400 },

        { t:'semanal', title:'Dedicação', desc:'Estude 300 min na semana', val: stats.timeWeek, req: 300 },
        { t:'semanal', title:'Foco Total', desc:'Estude 600 min na semana', val: stats.timeWeek, req: 600 },
        { t:'semanal', title:'Ultra Foco', desc:'Estude 900 min na semana', val: stats.timeWeek, req: 900 },
        { t:'semanal', title:'Viciado em Estudar', desc:'Estude 1200 min na semana', val: stats.timeWeek, req: 1200 },

        { t:'mensal', title:'Mês Consistente', desc:'Faça 200 questões no mês', val: stats.qMonth, req: 200 },
        { t:'mensal', title:'Evolução Clara', desc:'Faça 400 questões no mês', val: stats.qMonth, req: 400 },
        { t:'mensal', title:'Mês de Ouro', desc:'Faça 600 questões no mês', val: stats.qMonth, req: 600 },
        { t:'mensal', title:'Rumo à Aprovação', desc:'Faça 800 questões no mês', val: stats.qMonth, req: 800 },
        { t:'mensal', title:'Mito do Enem', desc:'Faça 1000 questões no mês', val: stats.qMonth, req: 1000 },
        { t:'mensal', title:'Lenda Viva', desc:'Faça 1500 questões no mês', val: stats.qMonth, req: 1500 },

        { t:'mensal', title:'Primeira Canetada', desc:'Faça 1 redação no mês', val: stats.redMonth, req: 1 },
        { t:'mensal', title:'Escritor Júnior', desc:'Faça 2 redações no mês', val: stats.redMonth, req: 2 },
        { t:'mensal', title:'O Padrão', desc:'Faça 4 redações no mês', val: stats.redMonth, req: 4 },
        { t:'mensal', title:'Sede de Mil', desc:'Faça 6 redações no mês', val: stats.redMonth, req: 6 },
        { t:'mensal', title:'Redator Chefe', desc:'Faça 8 redações no mês', val: stats.redMonth, req: 8 },

        { t:'vitalicia', title:'Matemática I', desc:'100 questões de Mat', val: stats.matQ, req: 100 },
        { t:'vitalicia', title:'Matemática II', desc:'300 questões de Mat', val: stats.matQ, req: 300 },
        { t:'vitalicia', title:'Matemática III', desc:'500 questões de Mat', val: stats.matQ, req: 500 },

        { t:'vitalicia', title:'Natureza I', desc:'100 questões de Natureza', val: stats.natQ, req: 100 },
        { t:'vitalicia', title:'Natureza II', desc:'300 questões de Natureza', val: stats.natQ, req: 300 },
        { t:'vitalicia', title:'Natureza III', desc:'500 questões de Natureza', val: stats.natQ, req: 500 },

        { t:'vitalicia', title:'Humanas I', desc:'100 questões de Humanas', val: stats.humQ, req: 100 },
        { t:'vitalicia', title:'Humanas II', desc:'300 questões de Humanas', val: stats.humQ, req: 300 },
        { t:'vitalicia', title:'Humanas III', desc:'500 questões de Humanas', val: stats.humQ, req: 500 },

        { t:'vitalicia', title:'Linguagens I', desc:'100 questões de Linguagens', val: stats.linQ, req: 100 },
        { t:'vitalicia', title:'Linguagens II', desc:'300 questões de Linguagens', val: stats.linQ, req: 300 },
        { t:'vitalicia', title:'Linguagens III', desc:'500 questões de Linguagens', val: stats.linQ, req: 500 },

        { t:'vitalicia', title:'Iniciante', desc:'Acertar/Fazer 50 fáceis', val: stats.facilQ, req: 50 },
        { t:'vitalicia', title:'Intermediário', desc:'Acertar/Fazer 100 médias', val: stats.medioQ, req: 100 },
        { t:'vitalicia', title:'Avançado', desc:'Acertar/Fazer 50 difíceis', val: stats.dificilQ, req: 50 },
        { t:'vitalicia', title:'Dominante', desc:'Acertar/Fazer 150 difíceis', val: stats.dificilQ, req: 150 },

        { t:'vitalicia', title:'A Jornada Começa', desc:'250 totais', val: stats.totalQ, req: 250 },
        { t:'vitalicia', title:'Focado', desc:'750 totais', val: stats.totalQ, req: 750 },
        { t:'vitalicia', title:'Quase Lá', desc:'2000 totais', val: stats.totalQ, req: 2000 }
    ];

    const missContainer = document.getElementById('missions-container');
    let missHtml = '';
    missionDefs.forEach(m => {
        let pct = Math.min((m.val / m.req) * 100, 100);
        let completed = pct === 100;
        let cName = completed ? 'var(--success)' : (m.t === 'vitalicia' ? 'var(--success)' : 'var(--primary)');
        missHtml += `
            <div class="mission-item" style="border-color: ${completed ? 'var(--success)' : 'var(--border)'}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span class="mission-type ${m.t}">${m.t}</span>
                    <span style="font-size:0.8rem; font-weight:bold; color:${cName}">${Math.min(m.val, m.req)} / ${m.req}</span>
                </div>
                <div style="font-weight:bold; color:#fff;">${m.title}</div>
                <div style="font-size:0.8rem; color:var(--dim);">${m.desc}</div>
                <div class="mission-progress-bg"><div class="mission-progress-fill" style="width:${pct}%; background:${cName}"></div></div>
            </div>
        `;
    });
    missContainer.innerHTML = missHtml;
}

// ==========================================
// NOVOS TEMPORIZADORES INTELIGENTES (BACKGROUND)
// ==========================================
let timerObj = { 
    pomo: { int: null, time: 3000, target: null }, 
    stop: { int: null, time: 0, start: null } 
};

function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }

function startPomodoro() { 
    let mins = document.getElementById('pomo-focus-time').value; 
    timerObj.pomo.time = mins * 60; 
    startPomoReal(); 
}

function startPomoBreak() { 
    let mins = document.getElementById('pomo-break-time').value; 
    timerObj.pomo.time = mins * 60; 
    startPomoReal(); 
}

function startPomoReal() {
    clearInterval(timerObj.pomo.int);
    timerObj.pomo.target = Date.now() + (timerObj.pomo.time * 1000);
    localStorage.setItem('pomoTarget', timerObj.pomo.target);
    document.getElementById('pomo-card').classList.add('timer-active');
    
    timerObj.pomo.int = setInterval(() => {
        let remaining = Math.max(0, Math.floor((timerObj.pomo.target - Date.now()) / 1000));
        timerObj.pomo.time = remaining;
        document.getElementById('pomo-display').innerText = formatTime(remaining);
        if (remaining <= 0) {
            pauseTimer('pomo');
            showAlert("Tempo do Pomodoro Esgotado!");
            document.getElementById('pomo-card').classList.remove('timer-active');
        }
    }, 1000);
}

function pauseTimer(type) { 
    clearInterval(timerObj[type].int); 
    if(type === 'pomo') {
        localStorage.removeItem('pomoTarget');
        document.getElementById('pomo-card').classList.remove('timer-active');
    }
}

function startStopwatch() { 
    clearInterval(timerObj.stop.int); 
    timerObj.stop.start = Date.now() - (timerObj.stop.time * 1000);
    localStorage.setItem('stopStart', timerObj.stop.start);
    document.getElementById('stop-card').classList.add('timer-active');
    let limit = document.getElementById('stopwatch-input').value * 60; 
    
    timerObj.stop.int = setInterval(() => { 
        let elapsed = Math.floor((Date.now() - timerObj.stop.start) / 1000);
        if(elapsed <= limit) { 
            timerObj.stop.time = elapsed;
            document.getElementById('stop-display').innerText = formatTime(elapsed); 
        } else { 
            pauseStopwatch(); 
            showAlert("Simulado Finalizado!"); 
        } 
    }, 1000); 
}

function pauseStopwatch() { 
    clearInterval(timerObj.stop.int); 
    localStorage.removeItem('stopStart');
    document.getElementById('stop-card').classList.remove('timer-active');
}

function resetStopwatch() { 
    pauseStopwatch(); 
    timerObj.stop.time = 0; 
    document.getElementById('stop-display').innerText = "00:00"; 
}

function restoreTimers() {
    let pTarget = localStorage.getItem('pomoTarget');
    if (pTarget) {
        let remaining = Math.floor((pTarget - Date.now()) / 1000);
        if (remaining > 0) {
            timerObj.pomo.time = remaining;
            startPomoReal();
        } else {
            localStorage.removeItem('pomoTarget');
            document.getElementById('pomo-display').innerText = "00:00";
        }
    }
    let sStart = localStorage.getItem('stopStart');
    if (sStart) {
        timerObj.stop.start = parseInt(sStart);
        timerObj.stop.time = Math.floor((Date.now() - timerObj.stop.start) / 1000);
        startStopwatch();
    }
}

function toggleDashDates() { document.getElementById('custom-dates').style.display = (document.getElementById('dash-filter-type').value === 'custom') ? 'flex' : 'none'; }
function getFilteredTasks() {
    const type = document.getElementById('dash-filter-type').value; const today = new Date();
    return currentTasks.filter(t => {
        if (t.status !== 'done') return false; const taskDateObj = new Date(t.date + 'T12:00:00');
        if (type === 'week') { const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay()); const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); return taskDateObj >= new Date(startOfWeek.toISOString().split('T')[0]+'T00:00:00') && taskDateObj <= new Date(endOfWeek.toISOString().split('T')[0]+'T23:59:59'); } 
        else if (type === 'month') { return taskDateObj.getMonth() === today.getMonth() && taskDateObj.getFullYear() === today.getFullYear(); }
        else if (type === 'custom') { const startStr = document.getElementById('dash-start').value; const endStr = document.getElementById('dash-end').value; if(!startStr || !endStr) return true; return t.date >= startStr && t.date <= endStr; }
        return true; 
    });
}

let donutChart, dailyBarChart, redacaoLine, redacaoMonthChart, timePieChart, qntPieChart, timeBarChart, qntBarChart;
function initCharts() {
    const filteredDoneTasks = getFilteredTasks();
    if(document.getElementById('redacaoChart')) {
        if(redacaoLine) redacaoLine.destroy(); if(redacaoMonthChart) redacaoMonthChart.destroy();
        const redacoes = currentTasks.filter(t => t.type === 'redacao' && t.status === 'done').sort((a,b) => a.date.localeCompare(b.date));
        redacaoLine = new Chart(document.getElementById('redacaoChart').getContext('2d'), { type: 'line', data: { labels: redacoes.map(r => r.date.split('-').reverse().slice(0,2).join('/')), datasets: [{ label: 'Nota', data: redacoes.map(r => r.score), borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.2)', fill: true, tension: 0.3 }] }, options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 1000, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false } } } });
        let monthCounts = {}; redacoes.forEach(r => { let monthLabel = r.date.substring(0, 7).split('-').reverse().join('/'); monthCounts[monthLabel] = (monthCounts[monthLabel] || 0) + 1; });
        redacaoMonthChart = new Chart(document.getElementById('redacaoMonthChart').getContext('2d'), { type: 'bar', data: { labels: Object.keys(monthCounts), datasets: [{ label: 'Redações feitas', data: Object.values(monthCounts), backgroundColor: '#f59e0b', borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } } });
    }
    if(document.getElementById('accDonutChart')) {
        if(donutChart) donutChart.destroy(); if(dailyBarChart) dailyBarChart.destroy(); if(timePieChart) timePieChart.destroy(); if(qntPieChart) qntPieChart.destroy(); if(timeBarChart) timeBarChart.destroy(); if(qntBarChart) qntBarChart.destroy();   
        let totalHits = 0, totalErrors = 0, totalTime = 0; const dailyQuestions = {}; const timeData = {}; const qntData = {};
        filteredDoneTasks.forEach(t => {
            let matLida = t.materia === "Geral" ? "Questões" : t.materia;
            if(t.realTime) timeData[matLida] = (timeData[matLida] || 0) + t.realTime;
            if((t.type === 'questoes' || t.type === 'simulado') && t.hits !== undefined && t.errors !== undefined) {
                totalHits += t.hits; totalErrors += t.errors; if(t.realTime) totalTime += t.realTime;
                dailyQuestions[t.date] = (dailyQuestions[t.date] || 0) + (t.hits + t.errors); qntData[matLida] = (qntData[matLida] || 0) + (t.hits + t.errors);
            }
        });
        const totalQ = totalHits + totalErrors;
        document.getElementById('stat-accuracy').innerText = (totalQ > 0 ? ((totalHits / totalQ) * 100).toFixed(0) : 0) + '%';
        if(document.getElementById('stat-total-q-dash')) document.getElementById('stat-total-q-dash').innerText = totalQ; document.getElementById('stat-hits').innerText = totalHits;
        document.getElementById('stat-errors').innerText = totalErrors; document.getElementById('stat-avg-time').innerText = (totalQ > 0 ? Math.floor((totalTime * 60) / totalQ) : 0) + 's';
        document.getElementById('center-donut-text').innerHTML = `${totalQ}<br><span style="font-size:0.8rem; font-weight:normal; color:var(--dim)">questões</span>`;
        donutChart = new Chart(document.getElementById('accDonutChart').getContext('2d'), { type: 'doughnut', data: { labels: ['Certas', 'Erradas'], datasets: [{ data: [totalHits, totalErrors], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0, cutout: '75%' }] }, options: { plugins: { legend: { position: 'bottom', labels: { color: '#f1f5f9', padding: 20 } } } } });
        const sortedDates = Object.keys(dailyQuestions).sort();
        dailyBarChart = new Chart(document.getElementById('dailyBarChart').getContext('2d'), { type: 'bar', data: { labels: sortedDates.map(d => d.split('-').reverse().slice(0,2).join('/')), datasets: [{ label: 'Questões Feitas', data: sortedDates.map(d => dailyQuestions[d]), backgroundColor: '#38bdf8', borderRadius: 4 }] }, options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 5 } }, x: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false } } } });
        timePieChart = new Chart(document.getElementById('timePieChart').getContext('2d'), { type: 'pie', data: { labels: Object.keys(timeData), datasets: [{ data: Object.values(timeData), backgroundColor: Object.keys(timeData).map(getColor), borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f1f5f9' } } } } });
        timeBarChart = new Chart(document.getElementById('timeBarChart').getContext('2d'), { type: 'bar', data: { labels: Object.keys(timeData), datasets: [{ label: 'Minutos Estudados', data: Object.values(timeData), backgroundColor: Object.keys(timeData).map(getColor), borderRadius: 4 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Minutos', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } });
        qntPieChart = new Chart(document.getElementById('qntPieChart').getContext('2d'), { type: 'pie', data: { labels: Object.keys(qntData), datasets: [{ data: Object.values(qntData), backgroundColor: Object.keys(qntData).map(getColor), borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f1f5f9' } } } } });
        qntBarChart = new Chart(document.getElementById('qntBarChart').getContext('2d'), { type: 'bar', data: { labels: Object.keys(qntData), datasets: [{ label: 'Quantidade de Questões', data: Object.values(qntData), backgroundColor: Object.keys(qntData).map(getColor), borderRadius: 4 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Questões Feitas', color: '#94a3b8' }, ticks: { color: '#94a3b8', stepSize: 1 } }, y: { ticks: { color: '#94a3b8' } } } } });
    }
}

// CONFIGURAÇÃO DA IA
const GEMINI_API_KEY = "AIzaSyC5SaCT-6fbCRQroQ2hMdrwABoQlzoW2ro"; // Jogue sua chave aqui

const iaQuestions = [
    { q: "Qual sua média geral atual?", o: ["Abaixo de 600", "Entre 600 e 700", "Entre 700 e 750", "Acima de 750"] },
    { q: "Como está sua base em Matemática Básica?", o: ["Ruim (Travo em frações)", "Regular (Lembro o básico)", "Boa (Domino a base)", "Excelente (Cálculo rápido)"] },
    { q: "Qual sua maior dificuldade em Natureza?", o: ["Interpretação", "Fórmulas", "Contas Rápidas", "Teoria Aplicada"] },
    { q: "Como está seu desempenho na Redação?", o: ["Menos de 600", "Entre 600 e 720", "800+", "900+ fácil"] },
    { q: "Qual área você mais negligencia?", o: ["Linguagens", "Humanas", "Natureza", "Matemática"] },
    { q: "Horas livres para estudar por dia?", o: ["1 a 2 horas", "3 a 4 horas", "5 a 6 horas", "7+ horas"] },
    { q: "Qual seu nível de foco atual?", o: ["Me distraio muito", "Celular atrapalha", "Foco por até 2h", "Mente Blindada Ativo"] },
    { q: "Frequência de revisão?", o: ["Nunca reviso", "Só pré-simulado", "Semanalmente", "Anki/Flashcards"] },
    { q: "Como prefere aprender?", o: ["Videoaula", "50% Vídeo / 50% Exercício", "20% Teoria / 80% Prática", "Só Questões"] },
    { q: "Melhor turno de produtividade?", o: ["Manhã", "Tarde", "Noite", "Madrugada"] },
    { q: "Tempo de prova nos simulados?", o: ["Falta tempo sempre", "Termino no limite", "Termino com calma", "Sobra muito tempo"] },
    { q: "Conhecimento sobre TRI?", o: ["Não sei o que é", "Sei mas não aplico", "Priorizo as fáceis", "Estratégia completa"] },
    { q: "Objetivo principal?", o: ["Começar do zero", "Vencer o edital", "Refinar a nota", "Alta concorrência (UFMG)"] },
    { q: "Simulados por mês?", o: ["Nenhum", "1 por mês", "2 por mês", "4 por mês"] },
    { q: "Maior fraqueza emocional?", o: ["Procrastinação", "Ansiedade", "Cansaço", "Perfeccionismo"] }
];

let currentIAQuestion = 0;
let userIAResponses = [];

function startIAQuestionnaire() {
    currentIAQuestion = 0;
    userIAResponses = [];
    document.getElementById('modal-ia-questions').style.display = 'flex';
    showIAQuestion();
}

function showIAQuestion() {
    const q = iaQuestions[currentIAQuestion];
    document.getElementById('ia-q-title').innerText = `Pergunta ${currentIAQuestion + 1} de 15`;
    document.getElementById('ia-q-text').innerText = q.q;
    const optionsDiv = document.getElementById('ia-options');
    optionsDiv.innerHTML = '';
    q.o.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn-action';
        btn.style.background = 'var(--card)';
        btn.style.border = '1px solid var(--border)';
        btn.style.textAlign = 'left';
        btn.innerText = opt;
        btn.onclick = () => handleIAAnswer(opt);
        optionsDiv.appendChild(btn);
    });
}

function handleIAAnswer(answer) {
    userIAResponses.push(answer);
    currentIAQuestion++;
    if (currentIAQuestion < iaQuestions.length) {
        showIAQuestion();
    } else {
        generateCronogramaIA();
    }
}

async function generateCronogramaIA() {
    document.getElementById('question-container').style.display = 'none';
    document.getElementById('ia-loading').style.display = 'block';

    const prompt = `
        Aja como um mentor do ENEM. Usuário busca 800+ na UFMG.
        Respostas do Perfil: ${userIAResponses.join(", ")}.
        
        Sua tarefa: Gerar um JSON de cronograma para os próximos 7 dias úteis.
        Use APENAS matérias desta lista: [Citologia, Evolução, Ecologia, Fisiologia Humana, Genética, Estequiometria, Química Orgânica, Termoquímica, Eletrodinâmica, Ondulatória, Cinemática, Era Vargas, Idade Moderna, Filosofia Política, Geopolítica, Estatística, Geometria Plana/Espacial, Probabilidade, Análise Combinatória, Razão e Proporção, Figuras de Linguagem, Literatura].
        
        Formato do JSON (array de objetos):
        [{"date": "YYYY-MM-DD", "type": "aula|questoes|simulado|redacao", "materia": "Nome", "content": "Tópico da Lista", "startTime": "HH:MM", "endTime": "HH:MM"}]
        
        Regras:
        1. Se o perfil for fraco em Matemática, foque em fundamentos.
        2. Alterne teoria e questões.
        3. Retorne APENAS o JSON, sem textos extras.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        const rawResponse = data.candidates[0].content.parts[0].text;
        const tasks = JSON.parse(rawResponse.replace(/```json|```/g, ""));

        const batch = db.batch();
        tasks.forEach(t => {
            const docRef = db.collection("tasks").doc();
            batch.set(docRef, { ...t, userId: auth.currentUser.uid, status: 'pending', reviewed: false });
        });
        
        await batch.commit();
        closeModal('modal-ia-questions');
        showAlert("Cronograma Inteligente gerado e aplicado ao seu calendário!");
    } catch (e) {
        console.error(e);
        showAlert("Erro ao gerar cronograma. Verifique sua chave de API.");
        closeModal('modal-ia-questions');
    }
}