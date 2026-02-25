const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);

// --- KONFIGURASI ---
// Ganti URL dengan target CTF via Argumen atau Hardcode
const CTF_URL = args[0] || 'https://lappungctf.dev';

// Pilih salah satu metode autentikasi: 'token' atau 'session' atau 'userpass'
let AUTH_MODE = 'token'; 

// Input default
let CTFD_TOKEN = args[1] || '';
let CTFD_USER = args[1] || '';
let CTFD_PASS = args[2] || '';

if (args.length === 3) {
    AUTH_MODE = 'userpass';
} else if (args.length === 2 && args[1].length > 20) {
    AUTH_MODE = 'token';
} else if (args.length === 0) {
    // Default LappungCTF
    AUTH_MODE = 'token';
    CTFD_TOKEN = 'ctfd_9c0c9166f6c8319d7a2cb2524bddb891f5c8b1baac9e0cd20dbfefea819bbd0b';
}

const SESSION_COOKIE = ''; 
// -------------------

let globalSession = SESSION_COOKIE;

async function loginCTFd(url, username, password) {
    console.log(`\n🔄 Mencoba login ke ${url} sebagai ${username}...`);
    try {
        const loginPageRes = await fetch(`${url}/login`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            }
        });
        const loginPageText = await loginPageRes.text();

        let csrfMatch = loginPageText.match(/name=["']nonce["'][\s\S]*?value=["']([a-zA-Z0-9]+)["']/);
        if (!csrfMatch) csrfMatch = loginPageText.match(/value=["']([a-zA-Z0-9]+)["'][\s\S]*?name=["']nonce["']/);
        if (!csrfMatch) csrfMatch = loginPageText.match(/id=["']nonce["'][\s\S]*?value=["']([a-zA-Z0-9]+)["']/);
        if (!csrfMatch) csrfMatch = loginPageText.match(/'csrfNonce':\s*"([a-zA-Z0-9]+)"/);
        if (!csrfMatch) csrfMatch = loginPageText.match(/csrf_nonce\s*=\s*"([a-zA-Z0-9]+)"/);
        if (!csrfMatch) csrfMatch = loginPageText.match(/<meta[^>]+name=["']csrf-nonce["'][^>]+content=["']([a-zA-Z0-9]+)["']/i);
        if (!csrfMatch) csrfMatch = loginPageText.match(/<meta[^>]+content=["']([a-zA-Z0-9]+)["'][^>]+name=["']csrf-nonce["']/i);

        const csrfNonce = csrfMatch ? csrfMatch[1] : null;

        if (!csrfNonce) {
            throw new Error("Gagal mengambil CSRF Token dari halaman login.");
        }

        const initialCookies = loginPageRes.headers.get("set-cookie");

        const formData = new URLSearchParams();
        formData.append("name", username);
        formData.append("password", password);
        formData.append("nonce", csrfNonce);
        formData.append("_submit", "Submit");

        const postHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": `${url}/login`,
            "Origin": url
        };
        if (initialCookies) postHeaders["Cookie"] = initialCookies;

        const loginPostRes = await fetch(`${url}/login`, {
            method: "POST",
            headers: postHeaders,
            body: formData,
            redirect: "manual"
        });

        let cookieHeaderVal = "";
        const rawSetCookie = loginPostRes.headers.get("set-cookie");
        if (rawSetCookie) {
            const rawCookies = rawSetCookie.split(/, (?=[a-zA-Z0-9%!#$%&'*+.^_`|~-]+=)/);
            cookieHeaderVal = rawCookies.map(c => c.split(';')[0].trim()).join('; ');
        }

        if (cookieHeaderVal && cookieHeaderVal.includes("session=")) {
            const sessionMatch = cookieHeaderVal.match(/session=([^;]+)/);
            if (sessionMatch) {
                console.log("✅ Login berhasil! Mendapatkan session cookie.");
                return sessionMatch[1];
            }
        }
        
        throw new Error("Login gagal! Pastikan username dan password benar.");
    } catch (e) {
        console.error(`❌ Error Login:`, e.message);
        return null;
    }
}

// Helper: RCTF Login Method
async function loginRCTF(url, token) {
    console.log(`\n🔄 Mencoba login rCTF ke ${url} dengan token ${token.substring(0,10)}...`);
    try {
        const res = await fetch(`${url}/api/v1/auth/login`, {
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ teamToken: token }),
            redirect: "manual"
        });

        const resBody = await res.json();
        
        if (resBody && resBody.kind === "goodLogin" && resBody.data && resBody.data.authToken) {
            console.log("✅ Login rCTF berhasil! Mendapatkan authToken.");
            return resBody.data.authToken;
        }

        console.log("⚠️ Response body RCTF auth:", JSON.stringify(resBody));
        throw new Error("Login rCTF gagal! Token mungkin salah.");
    } catch (e) {
        console.error(`❌ Error Login rCTF:`, e.message);
        return null;
    }
}

// Helper untuk fetch dengan Node.js native (agar bisa custom header dengan mudah)
async function fetchCTFd(endpoint, silent = false, isRCTF = false) {
    const url = `${CTF_URL}${endpoint}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };

    if (AUTH_MODE === 'token' && CTFD_TOKEN) {
        headers['Authorization'] = isRCTF ? `Bearer ${CTFD_TOKEN}` : `Token ${CTFD_TOKEN}`;
    } else if ((AUTH_MODE === 'session' || AUTH_MODE === 'userpass') && globalSession) {
        headers['Cookie'] = `session=${globalSession}; auth=${globalSession}`;
    } else {
        if (!silent) console.warn("⚠️ Peringatan: Anda belum mengatur Token atau Session!");
    }

    try {
        const response = await fetch(url, { headers });
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            // Not a JSON response
        }

        if (!response.ok) {
            // Allow returning the error JSON if it contains known API structures
            if (data && (data.kind || data.success !== undefined)) {
                return data;
            }
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return data;
    } catch (e) {
        if (!silent) console.error(`❌ Error fetching ${endpoint}:`, e.message);
        return null;
    }
}

// Helper: Ubah string menjadi nama folder yang aman
function sanitizePath(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

// Download file dari URL ke path tujuan
async function downloadFile(url, dest, isRCTF = false) {
    if (fs.existsSync(dest)) {
        console.log(`    ⏩ File sudah ada: ${path.basename(dest)}`);
        return;
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (AUTH_MODE === 'token' && CTFD_TOKEN) {
        headers['Authorization'] = isRCTF ? `Bearer ${CTFD_TOKEN}` : `Token ${CTFD_TOKEN}`;
    } else if ((AUTH_MODE === 'session' || AUTH_MODE === 'userpass') && globalSession) {
        headers['Cookie'] = `session=${globalSession}; auth=${globalSession}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const fileStream = fs.createWriteStream(dest, { flags: 'wx' });
    await require('stream/promises').pipeline(res.body, fileStream);
    console.log(`    ✅ Berhasil didownload: ${path.basename(dest)}`);
}

async function start() {
    console.log(`\n🚀 Memulai script downloader untuk: ${CTF_URL}`);
    console.log(`🔑 Metode Autentikasi: ${AUTH_MODE}`);

    // Attempt RCTF platform detection first by checking /api/v1/challs or /fixtures/challs.json
    // An unauthenticated request to RCTF /api/v1/challs usually returns { kind: "badToken" }
    const rctfProbeRes = await fetchCTFd('/api/v1/challs', true, true);
    let isRCTF = rctfProbeRes && rctfProbeRes.kind !== undefined;
    let rctfEndpoint = '/api/v1/challs';

    if (!isRCTF) {
        // Fallback to testing static /fixtures/challs.json (like in LA CTF)
        const staticProbeRes = await fetchCTFd('/fixtures/challs.json', true, true);
        if (staticProbeRes && staticProbeRes.kind === "goodChallenges") {
             isRCTF = true;
             rctfEndpoint = '/fixtures/challs.json';
        }
    }

    if (isRCTF) {
        if ((AUTH_MODE === 'userpass' || AUTH_MODE === 'token') && (CTFD_TOKEN || CTFD_USER || CTFD_PASS)) {
            // For rCTF we expect the "teamToken" to be passed where the password usually goes, or username. 
            // In the user's curl they only passed 1 big token.
            const tokenToUse = CTFD_TOKEN || CTFD_USER || CTFD_PASS;
            if (tokenToUse) {
                const authToken = await loginRCTF(CTF_URL, tokenToUse);
                if (!authToken) {
                    console.log("❌ Berhenti karena gagal login rCTF.");
                    return;
                }
                // RCTF uses Authorization: Bearer <authToken> for API requests (like /api/v1/challs)
                CTFD_TOKEN = authToken;
                AUTH_MODE = 'token'; 
            }
        }
    } else {
        // CTFd Platform Login Logic
        if (AUTH_MODE === 'userpass') {
            const session = await loginCTFd(CTF_URL, CTFD_USER, CTFD_PASS);
            if (!session) {
                console.log("❌ Berhenti karena gagal login CTFd.");
                return;
            }
            globalSession = session;
        }
    }

    let ctfName = "CTF_Challenges";
    
    if (isRCTF) {
        console.log(`✅ Platform terdeteksi: rCTF`);
    } else {
        console.log(`✅ Platform terdeteksi: CTFd`);
        console.log(`\n📡 Mengambil info nama CTF...`);
        // Attempt 1: API Configs (CTFd only)
        const configRes = await fetchCTFd('/api/v1/configs?key=ctf_name', true);
        if (configRes && configRes.success && configRes.data) {
            if (Array.isArray(configRes.data) && configRes.data.length > 0) {
               ctfName = configRes.data[0].value || ctfName;
            } else if (configRes.data.value) {
                ctfName = configRes.data.value;
            }
        } 
    }

    // Attempt 2: HTML Title Fallback (Used if API config fails or if it is rCTF)
    if (ctfName === "CTF_Challenges") {
        try {
            const htmlHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
            if (AUTH_MODE === 'token' && CTFD_TOKEN) htmlHeaders['Authorization'] = isRCTF ? `Bearer ${CTFD_TOKEN}` : `Token ${CTFD_TOKEN}`;
            else if ((AUTH_MODE === 'session' || AUTH_MODE === 'userpass') && globalSession) htmlHeaders['Cookie'] = `session=${globalSession}; auth=${globalSession}`;
            
            const htmlRes = await fetch(CTF_URL, { headers: htmlHeaders });
            const htmlText = await htmlRes.text();
            
            // Try to find the title without Cloudflare trigger
            const titleMatch = htmlText.match(/<title>(.*?)<\/title>/);
            if (titleMatch && titleMatch[1] && !titleMatch[1].includes("Just a moment")) {
                ctfName = titleMatch[1].trim();
            }
        } catch (e) {
            console.log("⚠️ HTML fallback gagal:", e.message);
        }
    }

    if (ctfName === "CTF_Challenges") {
        console.log(`⚠️ Gagal mengambil nama CTF otomatis. Menggunakan nama default.`);
    } else {
        console.log(`✅ Nama CTF: ${ctfName}`);
    }

    ctfName = sanitizePath(ctfName);
    const BASE_DIR = path.join(__dirname, ctfName);

    if (!fs.existsSync(BASE_DIR)) {
        fs.mkdirSync(BASE_DIR, { recursive: true });
    }

    console.log(`\n📡 Mengambil daftar challenge dari API...`);
    
    let challenges = [];
    
    if (isRCTF) {
        const challsRes = await fetchCTFd(rctfEndpoint, false, true);
        if (!challsRes || challsRes.kind !== "goodChallenges") {
            console.log("❌ Gagal mengambil daftar challenge rCTF. Apakah Token valid (jika dibutuhkan)?");
            return;
        }
        challenges = challsRes.data;
        console.log(`✅ Ditemukan ${challenges.length} challenge.\n`);
        
        for (const chal of challenges) {
            const catSafe = sanitizePath(chal.category || 'Uncategorized');
            const nameSafe = sanitizePath(chal.name);
            
            console.log(`🛠️ Memproses: [${chal.category}] ${chal.name} (ID: ${chal.id})`);
            const chalDir = path.join(BASE_DIR, catSafe, nameSafe);
            if (!fs.existsSync(chalDir)) {
                fs.mkdirSync(chalDir, { recursive: true });
            }
            
            // In rCTF, all details are returned in the /api/v1/challs endpoint!
            const mdPath = path.join(chalDir, 'README.md');
            let mdContent = `# ${chal.name} (${chal.points} pts)\n\n`;
            mdContent += `**Category:** ${chal.category}\n\n`;
            if (chal.author && chal.author !== "Unknown") mdContent += `**Author:** ${chal.author}\n\n`;
            mdContent += `## Description\n${chal.description || '*No description provided.*'}\n\n`;
            
            fs.writeFileSync(mdPath, mdContent);
            console.log(`    📄 Deskripsi disimpan di README.md`);
            
            if (chal.files && chal.files.length > 0) {
                for (const fileUrl of chal.files) {
                    const fileName = sanitizePath(fileUrl.url.split('/').pop().split('?')[0]);
                    const downloadPath = path.join(chalDir, fileName);
                    
                    let fullUrl = fileUrl.url;
                    if (!fullUrl.startsWith('http')) fullUrl = `${CTF_URL}${fullUrl}`;

                    try {
                        await downloadFile(fullUrl, downloadPath, true);
                    } catch (e) {
                        console.error(`    ❌ Gagal download ${fileName}:`, e.message);
                    }
                }
            } else {
                console.log(`    📂 Tidak ada file attachment.`);
            }
        }
    } else {
        // CTFd Parsing Logic
        const challsRes = await fetchCTFd('/api/v1/challenges');
        if (!challsRes || !challsRes.success) {
            console.log("❌ Gagal mengambil daftar challenge CTFd. Apakah Token/Session valid?");
            return;
        }

        challenges = challsRes.data;
        console.log(`✅ Ditemukan ${challenges.length} challenge.\n`);

        for (const chal of challenges) {
            const catSafe = sanitizePath(chal.category || 'Uncategorized');
            const nameSafe = sanitizePath(chal.name);
            
            console.log(`🛠️ Memproses: [${chal.category}] ${chal.name} (ID: ${chal.id})`);

            const chalDir = path.join(BASE_DIR, catSafe, nameSafe);
            if (!fs.existsSync(chalDir)) {
                fs.mkdirSync(chalDir, { recursive: true });
            }

            const detailRes = await fetchCTFd(`/api/v1/challenges/${chal.id}`);
            if (!detailRes || !detailRes.success) {
                console.log(`    ⚠️ Gagal mengambil detail untuk challenge: ${chal.name}`);
                continue;
            }

            const details = detailRes.data;

            const mdPath = path.join(chalDir, 'README.md');
            let mdContent = `# ${chal.name} (${chal.value} pts)\n\n`;
            mdContent += `**Category:** ${chal.category}\n\n`;
            if (details.author && details.author !== "Unknown") mdContent += `**Author:** ${details.author}\n\n`;
            mdContent += `## Description\n${details.description || '*No description provided.*'}\n\n`;
            
            if (details.connection_info) {
                mdContent += `## Connection Info\n\`${details.connection_info}\`\n\n`;
            }
            
            fs.writeFileSync(mdPath, mdContent);
            console.log(`    📄 Deskripsi disimpan di README.md`);

            if (details.files && details.files.length > 0) {
                for (const fileUrl of details.files) {
                    const fileName = sanitizePath(fileUrl.split('/').pop().split('?')[0]);
                    const downloadPath = path.join(chalDir, fileName);
                    
                    let fullUrl = fileUrl;
                    if (!fullUrl.startsWith('http')) fullUrl = `${CTF_URL}${fileUrl}`;

                    try {
                        await downloadFile(fullUrl, downloadPath);
                    } catch (e) {
                        console.error(`    ❌ Gagal download ${fileName}:`, e.message);
                    }
                }
            } else {
                console.log(`    📂 Tidak ada file attachment.`);
            }
        }
    }

    console.log(`\n🎉 Proses selesai! Semua file & deskripsi telah tersimpan di direktori:\n📁 ${BASE_DIR}\n`);
}

start();
