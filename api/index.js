const https = require('https');

function getRequestBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                const params = new URLSearchParams(body);
                const obj = {};
                for (const [key, value] of params) { obj[key] = value; }
                resolve(obj);
            }
        });
    });
}

// Pomocnicza funkcja do wykonywania żądań HTTPS
function makeHttpsRequest(options, payload = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', (chunk) => resBody += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body: resBody });
            });
        });
        req.on('error', (err) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

module.exports = async (req, res) => {
    // Wsparcie dla CORS (zapobiega błędom sieciowym w przeglądarce)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(200).json({ 
            status: "Działa", 
            message: "Serwer MyHeredo działa poprawnie. Oczekuje na bezpieczne połączenia POST z aplikacji frontendu." 
        });
    }

    try {
        const body = await getRequestBody(req);
        const { action, dmsDays, vault, tekstNotatki } = body;

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;
        const collectionId = "2ea9a78e-cc80-41d9-b92c-b45d01489fe8";

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(400).json({ success: false, log: "Brak zmiennych środowiskowych BW_ w panelu Vercel." });
        }

        // 1. Logowanie OAuth2 do Bitwarden (Wspólne dla GET i POST)
        const tokenDataString = `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`;
        const tokenOptions = {
            hostname: 'identity.bitwarden.com',
            port: 443,
            path: '/connect/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenDataString)
            }
        };

        const tokenResult = await makeHttpsRequest(tokenOptions, tokenDataString);
        const tokenParsed = JSON.parse(tokenResult.body);
        const accessToken = tokenParsed.access_token;

        if (!accessToken) {
            return res.status(401).json({ success: false, log: "Bitwarden odrzucił dane uwierzytelniające API." });
        }

        // ==========================================
        // SYSTEM LOGOWANIA / POBIERANIA (get_vault)
        // ==========================================
        if (action === "get_vault") {
            const getOptions = {
                hostname: 'api.bitwarden.com',
                port: 443,
                path: `/organizations/${organizationId.trim()}/ciphers`,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            };

            const getResult = await makeHttpsRequest(getOptions);
            if (getResult.statusCode < 200 || getResult.statusCode >= 300) {
                return res.status(400).json({ success: false, log: "Nie udało się pobrać zawartości organizacji Bitwarden." });
            }

            const ciphersParsed = JSON.parse(getResult.body);
            let extractedVaultData = {};

            // Przeszukujemy elementy w poszukiwaniu najświeższych wpisów MyHeredo
            if (ciphersParsed.data && Array.isArray(ciphersParsed.data)) {
                const myHeredoCiphers = ciphersParsed.data.filter(item => 
                    item.name && item.name.includes("MyHeredo") && item.notes
                );

                // Szukamy zapisanego stanu struktury sejfu w polu notes
                for (const cipher of myHeredoCiphers) {
                    if (cipher.notes.includes("[DANE SEJFU]:")) {
                        try {
                            const jsonPart = cipher.notes.split("[DANE SEJFU]:")[1].trim();
                            extractedVaultData = JSON.parse(jsonPart);
                            break; // Znaleziono najnowszą strukturę skrytki
                        } catch (e) {
                            // Ignoruj błędy parsowania pojedynczego wpisu, szukaj dalej
                        }
                    }
                }
            }

            return res.status(200).json({ success: true, vaultData: extractedVaultData });
        }

        // ==========================================
        // SYSTEM ZAPISU (activate_dms / update_category)
        // ==========================================
        let secureContent = `--- PROTOKÓŁ SYSTEMU MYHEREDO ---\n`;
        secureContent += `Wygenerowano: ${new Date().toLocaleString('pl-PL')}\n`;
        secureContent += `Typ akcji: ${action || 'Zapis ręczny'}\n`;
        
        if (action === "activate_dms" || vault) {
            secureContent += `Interwał DMS: ${dmsDays || 90} dni\n\n`;
            secureContent += `[DANE SEJFU]:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            secureContent += `\n[TREŚĆ NOTATKI]:\n${tekstNotatki}`;
        } else {
            secureContent += `\nAktualizacja skrytki użytkownika.`;
        }

        const itemTitle = `MyHeredo - Protokol (${action || 'Sync'})`;

        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: [collectionId],
            type: 2, // Secure Note (Bezpieczna Notatka)
            name: itemTitle,
            notes: secureContent,
            secureNote: { type: 0 }
        });

        const cipherOptions = {
            hostname: 'api.bitwarden.com',
            port: 443,
            path: '/ciphers',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadCipher)
            }
        };

        const postResult = await makeHttpsRequest(cipherOptions, payloadCipher);

        if (postResult.statusCode >= 200 && postResult.statusCode < 300) {
            return res.status(200).json({ success: true, log: "Sukces! Dane zapisane w organizacji Bitwarden." });
        } else {
            return res.status(400).json({ success: false, log: `Bitwarden API odrzucił strukturę. Status: ${postResult.statusCode}` });
        }

    } catch (globalError) {
        return res.status(500).json({ success: false, log: `Błąd wewnętrzny serwera: ${globalError.message}` });
    }
};
