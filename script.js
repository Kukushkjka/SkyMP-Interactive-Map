// --- КОНФИГУРАЦИЯ ---
const mapWidth = 15864;
const mapHeight = 10549;
const iconFolder = 'assets/icons/';
const totalIcons = 123;
const imagePath = 'assets/map/skyrim_map.jpg'; 
const ICON_SIZE = 32; 

let selectedIconType = '1.png'; 
let pois = []; 
let markersMap = {}; 
let isEditing = false; 
let currentUser = localStorage.getItem('loggedUser') || null;

// --- ИНИЦИАЛИЗАЦИЯ КАРТЫ ---
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 2,
    attributionControl: false
});

const bounds = [[0, 0], [mapHeight, mapWidth]];
L.imageOverlay(imagePath, bounds).addTo(map);
map.fitBounds(bounds);

// Таймер для приветственного окна
window.onload = () => {
    setTimeout(() => {
        const overlay = document.getElementById('welcome-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 1000);
        }
    }, 10000);
};

// --- АВТОРИЗАЦИЯ ---
async function loginUser() {
    const u = document.getElementById('user-login').value;
    const p = document.getElementById('user-pass').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p})
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.username;
            localStorage.setItem('loggedUser', currentUser);
            updateAuthUI();
            renderMarkers();
        } else alert("Ошибка входа!");
    } catch (e) { alert("Сервер недоступен!"); }
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem('loggedUser');
    updateAuthUI();
    renderMarkers();
}

function updateAuthUI() {
    document.getElementById('login-form').style.display = currentUser ? 'none' : 'block';
    document.getElementById('user-logged').style.display = currentUser ? 'block' : 'none';
    document.getElementById('editor-tools').style.display = currentUser ? 'block' : 'none';
    if(currentUser) document.getElementById('current-user-name').innerText = currentUser;
}

// --- СИНХРОНИЗАЦИЯ ---
async function loadPoisFromServer() {
    if (isEditing) return;
    try {
        const response = await fetch('/api/pois');
        const newPois = await response.json();
        if (JSON.stringify(newPois) !== JSON.stringify(pois)) {
            pois = newPois;
            renderMarkers();
        }
    } catch (e) { console.error("Sync Error:", e); }
}

async function updateAll() {
    if (!currentUser) return;
    renderMarkers(); 
    try {
        await fetch('/api/pois', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, points: pois })
        });
    } catch (e) { console.error("Save Error:", e); }
}
setInterval(loadPoisFromServer, 5000);

// --- ПОИСК И ПЕРЕМЕЩЕНИЕ ---
function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    query = query.toLowerCase().trim();
    if (query.length < 2) { resultsContainer.style.display = 'none'; renderMarkers(); return; }

    const filtered = pois.filter(p => p.title.toLowerCase().includes(query));
    if (filtered.length > 0) {
        resultsContainer.innerHTML = '';
        filtered.forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<b>${p.isActive ? '🔥 ' : ''}${p.title}</b><br><small>${p.category || 'Прочее'}</small>`;
            div.onclick = () => jumpToLocation(p);
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    } else resultsContainer.style.display = 'none';
    renderMarkers();
}

function jumpToLocation(poi) {
    const marker = markersMap[JSON.stringify(poi.coords)];
    if (marker) {
        map.flyTo(poi.coords, 0, { duration: 1.5 });
        setTimeout(() => marker.openPopup(), 1600);
        document.getElementById('search-results').style.display = 'none';
    }
}

// --- ХРОНОЛОГИЯ И ИСТОРИЯ ---
window.openHistory = function(index) {
    isEditing = true;
    const poi = pois[index];
    document.getElementById('history-title').innerText = `История: ${poi.title}`;
    let html = '';
    if (currentUser) {
        html += `<div style="margin-bottom:15px;"><textarea id="new-ev-${index}" placeholder="Событие..." style="width:100%; height:50px; background:#222; color:white; border:1px solid #444;"></textarea>
                 <button onclick="addEvent(${index})" style="width:100%; background:#007bff; color:white; border:none; padding:5px; cursor:pointer;">Записать</button></div>`;
    }
    const history = poi.history || [];
    history.slice().reverse().forEach(ev => {
        html += `<div class="history-entry"><span class="history-date">${ev.date} | ${ev.author}</span><div>${ev.text}</div></div>`;
    });
    document.getElementById('history-content').innerHTML = html || 'Записей нет';
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('modal-overlay').style.display = 'block';
};

window.addEvent = function(index) {
    const text = document.getElementById(`new-ev-${index}`).value;
    if (!text.trim()) return;
    if (!pois[index].history) pois[index].history = [];
    pois[index].history.push({ date: new Date().toLocaleString('ru-RU'), author: currentUser, text: text });
    updateAll();
    openHistory(index);
};

window.showGlobalHistory = function() {
    document.getElementById('history-title').innerText = `📜 Последние события сервера`;
    let all = [];
    pois.forEach(p => (p.history || []).forEach(e => all.push({...e, loc: p.title})));
    all.sort((a,b) => new Date(b.date) - new Date(a.date));
    let html = all.map(e => `<div class="history-entry" style="border-left-color:#28a745"><span class="history-date">${e.date} | <b>${e.loc}</b></span><div>${e.text}</div></div>`).join('');
    document.getElementById('history-content').innerHTML = html || 'Событий нет';
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('modal-overlay').style.display = 'block';
};

window.closeHistory = function() {
    document.getElementById('history-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    isEditing = false;
};

// --- МАРКЕРЫ ---
function renderMarkers() {
    map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    markersMap = {};
    const query = document.getElementById('map-search').value.toLowerCase();
    const activeFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(el => el.value);

    pois.forEach((poi, index) => {
        const category = poi.category || 'other';
        const isActive = poi.isActive || false;
        if (poi.title.toLowerCase().includes(query) && activeFilters.includes(category)) {
            const marker = L.marker(poi.coords, { 
                icon: L.icon({ iconUrl: `${iconFolder}${poi.icon}`, iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-32], className: isActive ? 'active-event-icon' : '' })
            }).addTo(map);
            markersMap[JSON.stringify(poi.coords)] = marker;

            const tooltip = `<div style="padding:2px 5px;"><b style="font-size:14px;">${isActive?'🔥 ':''}${poi.title}</b><br><small>${poi.description||''}</small></div>`;
            marker.bindTooltip(tooltip, { direction:'top', offset:[0,-32], opacity:0.9 });

            if (!currentUser) {
                marker.bindPopup(`<b>${poi.title}</b><br>${poi.description}`);
            } else {
                const form = document.createElement('div');
                form.className = 'poi-form';
                form.innerHTML = `
                    <input type="text" id="t-${index}" value="${poi.title}">
                    <textarea id="d-${index}" rows="2">${poi.description}</textarea>
                    <button class="btn-history" onclick="openHistory(${index})">📜 История ивентов</button>
                    <label style="font-size:11px; color:#333;"><input type="checkbox" id="a-${index}" ${isActive?'checked':''}> АКТИВНЫЙ ИВЕНТ</label>
                    <select id="c-${index}">
                        <option value="other" ${category==='other'?'selected':''}>Прочее</option>
                        <option value="city" ${category==='city'?'selected':''}>Город</option>
                        <option value="village" ${category==='village'?'selected':''}>Деревня</option>
                        <option value="dungeon" ${category==='dungeon'?'selected':''}>Пещера</option>
                        <option value="ruins" ${category==='ruins'?'selected':''}>Руины</option>
                        <option value="camp" ${category==='camp'?'selected':''}>Лагерь</option>
                        <option value="shrine" ${category==='shrine'?'selected':''}>Святилище</option>
                        <option value="mine" ${category==='mine'?'selected':''}>Шахта</option>
                    </select>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button class="btn-save" style="flex:2" onclick="saveEdit(${index})">ОК</button>
                        <button class="btn-delete" style="flex:1" onclick="deletePoi(${index})">✖</button>
                    </div>`;
                marker.bindPopup(form, { minWidth: 200 });
            }
            marker.on('popupopen', () => { if(currentUser) isEditing = true; });
            marker.on('popupclose', () => isEditing = false);
        }
    });
}

// --- УПРАВЛЕНИЕ ---
map.on('contextmenu', (e) => {
    if (!currentUser) return;
    pois.push({ coords: [e.latlng.lat, e.latlng.lng], title: "Новая локация", description: "", icon: selectedIconType, category: "other", isActive: false, history: [] });
    updateAll();
});

window.saveEdit = (i) => {
    pois[i].title = document.getElementById(`t-${i}`).value;
    pois[i].description = document.getElementById(`d-${i}`).value;
    pois[i].category = document.getElementById(`c-${i}`).value;
    pois[i].isActive = document.getElementById(`a-${i}`).checked;
    isEditing = false; updateAll(); map.closePopup();
};

window.deletePoi = (i) => { if(confirm("Удалить?")) { pois.splice(i,1); updateAll(); } };

function loadIconGallery() {
    const container = document.getElementById('iconSelector');
    for (let i = 1; i <= totalIcons; i++) {
        const name = `${i}.png`;
        const div = document.createElement('div');
        div.className = 'icon-option';
        div.innerHTML = `<img src="${iconFolder}${name}">`;
        div.onclick = () => {
            document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            selectedIconType = name;
            document.getElementById('status').innerText = `Выбрана: ${name}`;
        };
        container.appendChild(div);
    }
}

updateAuthUI();
loadIconGallery();
loadPoisFromServer();