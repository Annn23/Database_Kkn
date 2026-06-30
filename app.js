// =============================================
// C'MON — Citrus Monitoring | app.js
// =============================================
// API keys diambil dari config.js (file terpisah, di-gitignore)

// --- 1. INISIALISASI SUPABASE ---
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// --- 2. LOGIKA DASHBOARD & TABEL ---
let localDataLog = [];
const tableBody = document.getElementById('tableBody');

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
}

function flashValue(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.remove('value-updated');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('value-updated');
    }
}

function updateCards(data) {
    const fields = [
        { id: 'valSuhu', key: 'suhu' },
        { id: 'valHum', key: 'kelembapan_udara' },
        { id: 'valTanah', key: 'rata_rata_tanah' },
        { id: 'valTds', key: 'tds' },
        { id: 'valJarak', key: 'jarak_air' },
        { id: 'valPh', key: 'ph', format: (v) => v ? v.toFixed(2) : '--' },
    ];

    fields.forEach(f => {
        const val = f.format ? f.format(data[f.key]) : (data[f.key] ?? '--');
        const el = document.getElementById(f.id);
        if (el && el.innerText !== String(val)) {
            el.innerText = val;
            flashValue(f.id);
        }
    });
}

function appendToTable(data, prepend = true) {
    const row = document.createElement('tr');
    const pHClass = data.ph < 6 || data.ph > 8 ? "ph-warning" : "ph-normal";

    row.innerHTML = `
        <td>${formatTime(data.created_at)}</td>
        <td>${data.suhu ?? '--'}</td>
        <td>${data.kelembapan_udara ?? '--'}</td>
        <td>${data.rata_rata_tanah ?? '--'}</td>
        <td>${data.tds ?? '--'}</td>
        <td>${data.jarak_air ?? '--'}</td>
        <td class="${pHClass}">${data.ph ? data.ph.toFixed(2) : '--'}</td>
    `;

    if (prepend) {
        tableBody.prepend(row);
        if (tableBody.children.length > 30) tableBody.removeChild(tableBody.lastChild);
    } else {
        tableBody.appendChild(row);
    }
}

async function loadInitialData() {
    const { data, error } = await supabaseClient
        .from('sensor_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        const statusEl = document.getElementById('dbStatus');
        statusEl.classList.add('error');
        statusEl.innerHTML = `<span class="status-dot" style="background:#E53935"></span> Koneksi Error`;
        return;
    }

    if (data && data.length > 0) {
        localDataLog = [...data].reverse();
        updateCards(data[0]);
        data.forEach(row => appendToTable(row, false));
    }
}

function setupRealtimeListener() {
    supabaseClient
        .channel('realtime_sensor_data')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, (payload) => {
            const newData = payload.new;
            localDataLog.push(newData);
            updateCards(newData);
            appendToTable(newData, true);
        }).subscribe();
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    if (localDataLog.length === 0) return alert("Belum ada data.");
    let csvContent = "data:text/csv;charset=utf-8,ID,Waktu Server,Suhu (C),Kelembapan Udara (%),Rata-rata Tanah (%),TDS (PPM),Jarak Air (cm),Nilai pH\n";
    localDataLog.forEach(row => {
        csvContent += `${row.id},"${formatTime(row.created_at)}",${row.suhu},${row.kelembapan_udara},${row.rata_rata_tanah},${row.tds},${row.jarak_air},${row.ph}\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `IoT_Sensor_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// --- 3. PAGE NAVIGATION ---
const dashboardPage = document.getElementById('dashboardPage');
const chatPage = document.getElementById('chatPage');
const navDashboard = document.getElementById('navDashboard');
const navAiNav = document.getElementById('navAiNav');
const askAiBtn = document.getElementById('askAiBtn');
const chatInput = document.getElementById('chatInput');
const chatBox = document.getElementById('chatBox');

function switchToPage(page) {
    // Update page views
    dashboardPage.classList.remove('active');
    chatPage.classList.remove('active');

    // Update nav items
    navDashboard.classList.remove('active');
    navAiNav.classList.remove('active');

    if (page === 'dashboard') {
        dashboardPage.classList.add('active');
        navDashboard.classList.add('active');
    } else if (page === 'chat') {
        chatPage.classList.add('active');
        navAiNav.classList.add('active');
        setTimeout(() => chatInput.focus(), 100);
    }

    // Scroll to top on page switch
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

navDashboard.addEventListener('click', () => switchToPage('dashboard'));
navAiNav.addEventListener('click', () => switchToPage('chat'));
askAiBtn.addEventListener('click', () => switchToPage('chat'));

// --- 4. UI CHATBOT & ATTACHMENT ---
function appendMessage(message, isUser = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${isUser ? 'user' : ''}`;

    const avatarClass = isUser ? 'user' : 'bot';
    const avatarIcon = isUser ? 'fa-user' : 'fa-robot';
    const bubbleClass = isUser ? 'user' : 'bot markdown-body';

    const formattedMessage = isUser ? message : marked.parse(message);

    msgDiv.innerHTML = `
        <div class="chat-avatar ${avatarClass}">
            <i class="fas ${avatarIcon}"></i>
        </div>
        <div class="chat-bubble ${bubbleClass}">
            ${formattedMessage}
        </div>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Variabel untuk menyimpan data sementara
let attachedCsvText = "";
let attachedImageBase64 = null;

document.getElementById('btnUploadCsv').addEventListener('click', () => document.getElementById('csvUploader').click());
document.getElementById('btnCamera').addEventListener('click', () => document.getElementById('cameraUploader').click());

// LOGIKA MEMBACA CSV
document.getElementById('csvUploader').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Hanya file dengan format .csv yang diperbolehkan!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        attachedCsvText = event.target.result;
        appendMessage(`<i class="fas fa-file-csv"></i> File CSV "${file.name}" berhasil dibaca. Silakan kirim pesan untuk mulai menganalisis data ini.`, true);
    };
    reader.readAsText(file);
});

// LOGIKA MEMBACA & MENGKOMPRESI GAMBAR
document.getElementById('cameraUploader').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            // Kompresi ukuran gambar ke maksimal 800px
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            attachedImageBase64 = canvas.toDataURL('image/jpeg', 0.8);

            const imgPreview = `<br><img src="${attachedImageBase64}" style="max-width:200px;border-radius:8px;margin-top:8px;border:1px solid rgba(0,0,0,0.1);">`;
            appendMessage(`<i class="fas fa-camera"></i> Gambar tanaman berhasil dilampirkan.${imgPreview}`, true);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// --- 5. FUNGSI FETCH GROQ API ---
async function fetchGroqResponse(userPrompt) {
    if (!CONFIG.GROQ_API_KEY) return "⚠️ Error: API Key Groq belum diatur.";

    const apiUrl = "https://api.groq.com/openai/v1/chat/completions";

    const vSuhu = document.getElementById('valSuhu').innerText;
    const vHum = document.getElementById('valHum').innerText;
    const vTanah = document.getElementById('valTanah').innerText;
    const vTds = document.getElementById('valTds').innerText;
    const vPh = document.getElementById('valPh').innerText;

    const systemPrompt = `Kamu adalah C'MON Bot, asisten AI ahli pertanian pintar berbasis IoT.
Kondisi kebun real-time: Suhu ${vSuhu}°C, Kelembapan ${vHum}%, Tanah ${vTanah}%, TDS ${vTds} PPM, pH ${vPh}. Berikan jawaban ringkas, solutif, dan gunakan markdown.`;

    // Menyusun prompt jika ada CSV
    let finalUserPrompt = userPrompt;
    if (attachedCsvText) {
        finalUserPrompt += `\n\n--- DATA CSV TERLAMPIR ---\n${attachedCsvText.substring(0, 4000)}\n\n(Instruksi untuk AI: Analisis data CSV di atas dan berikan kesimpulan, tren, atau jawaban yang relevan dengan pertanyaan user.)`;
    }

    let messagesPayload = [{ role: "system", content: systemPrompt }];

    // Struktur payload berbeda jika ada lampiran gambar
    if (attachedImageBase64) {
        messagesPayload.push({
            role: "user",
            content: [
                { type: "text", text: finalUserPrompt },
                { type: "image_url", image_url: { url: attachedImageBase64 } }
            ]
        });
    } else {
        messagesPayload.push({ role: "user", content: finalUserPrompt });
    }

    const selectedModel = attachedImageBase64 ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.1-8b-instant";

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messagesPayload,
                temperature: 0.6,
                max_tokens: 1024
            })
        });

        const data = await response.json();

        // Reset form attachment
        attachedCsvText = "";
        attachedImageBase64 = null;
        document.getElementById('csvUploader').value = "";
        document.getElementById('cameraUploader').value = "";

        if (data.error) {
            console.error("API Error Response:", data.error);
            return `**Gagal memproses!** Pesan dari server: *${data.error.message}*`;
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Fetch Error:", error);
        return "Gagal terhubung ke server Groq. Periksa koneksi internet atau Console log Anda.";
    }
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text && !attachedCsvText && !attachedImageBase64) return;

    const promptToSend = text || "Tolong analisis data atau gambar yang saya lampirkan.";

    if (text) appendMessage(text, true);
    chatInput.value = '';

    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'chat-msg';
    typingDiv.innerHTML = `
        <div class="chat-avatar bot"><i class="fas fa-robot"></i></div>
        <div class="chat-bubble bot" style="color:var(--text-muted);font-style:italic;">
            <i class="fas fa-spinner fa-spin"></i> Membaca dan menganalisis...
        </div>
    `;
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    const aiResponse = await fetchGroqResponse(promptToSend);

    document.getElementById(typingId).remove();
    appendMessage(aiResponse, false);
}

document.getElementById('sendChatBtn').addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- INIT ---
loadInitialData();
setupRealtimeListener();

// --- SPLASH SCREEN (5 detik) ---
setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    const mainContent = document.getElementById('mainContent');
    const bottomNav = document.getElementById('bottomNav');

    // Fade out splash
    splash.classList.add('fade-out');

    // Show main content and nav
    setTimeout(() => {
        mainContent.classList.add('visible');
        bottomNav.classList.add('visible');

        // Remove splash from DOM after transition
        setTimeout(() => {
            splash.remove();
        }, 600);
    }, 300);
}, 5000);
