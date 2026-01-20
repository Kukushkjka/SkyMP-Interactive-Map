const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001; // Используем ваш порт 3001

// Пути к файлам
const DATA_FILE = path.join(__dirname, 'data', 'points.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const LOG_FILE = path.join(__dirname, 'data', 'actions.log');

// Убедимся, что папка data существует
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

app.use(express.static(__dirname));
app.use(bodyParser.json());

// Функция логирования
function writeLog(user, action) {
    const time = new Date().toLocaleString();
    const logEntry = `[${time}] Пользователь ${user}: ${action}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(logEntry.trim());
}

// --- МАРШРУТ АВТОРИЗАЦИИ (Исправляет 404) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!fs.existsSync(USERS_FILE)) {
        return res.status(500).json({ success: false, message: "Файл пользователей не найден" });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        writeLog(username, "вошел в систему");
        res.json({ success: true, username: user.username });
    } else {
        res.status(401).json({ success: false, message: "Неверный логин или пароль" });
    }
});

// Получение точек
app.get('/api/pois', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.json([]);
        res.json(JSON.parse(data || '[]'));
    });
});

// Сохранение точек
app.post('/api/pois', (req, res) => {
    const { username, points } = req.body;
    if (!username) return res.status(403).send('Доступ запрещен');

    fs.writeFile(DATA_FILE, JSON.stringify(points, null, 2), (err) => {
        if (err) return res.status(500).send('Ошибка сохранения');
        writeLog(username, `обновил карту (точек: ${points.length})`);
        res.send('Данные сохранены');
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=== СЕРВЕР ЗАПУЩЕН ===`);
    console.log(`Адрес: http://localhost:${PORT}`);
    console.log(`Логи: data/actions.log`);
});