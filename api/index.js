const https = require('https');

// Pomocnicza funkcja do zbierania danych z żądania POST
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

// Pomocnicza funkcja do wykonywania bezpiecznych żądań HTTPS API
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
    // Pełna konfiguracja nagłówków CORS zapobiegająca blokadom przeglądarki
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Obsługa zapytania testowego CORS (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Bezpieczny komunikat zwrotny przy wejściu przez przeglądarkę (GET)
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

        // 1. Pobieranie tokenu dostępu OAuth2 z Identity Bitwarden
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
        let accessToken = '';
        try {
            const tokenParsed = JSON.parse(tokenResult.body);
            accessToken = tokenParsed.access_token;
        } catch (e) {
            return res.status(401).json({ success: false, log: "Błąd parsowania tokenu autoryzacji Bitwarden." });
        }

        if (!accessToken) {
            return res.status(401).json({ success: false, log: "Bitwarden odrzucił dane uwierzytelniające API (Client ID/Secret)." });
        }

        // 2. Bezpieczna obsługa akcji logowania (get_vault) – zwraca czysty profil początkowy
        if (action === "get_vault") {
            return res.status(200).json({ success: true, vaultData: {} });
        }

        // 3. Budowanie struktury czystego tekstu do pola "notes" (Ominięcie błędu 400 pól ukrytych)
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

        // Budowanie payloadu dla Bezpiecznej Notatki (Type 2)
        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: [collectionId],
            type: 2, 
            name: itemTitle,
            notes: secureContent,
            secureNote: { type: 0 }
        });

        // 4. Wysłanie gotowego protokołu do API Bitwarden
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
            return res.status(200).json({ success: true, log: "Sukces! Protokół został poprawnie zapisany w Bitwarden." });
        } else {
            return res.status(400).json({ success: false, log: `Bitwarden API odrzucił żądanie. Status HTTP: ${postResult.statusCode}` });
        }

    } catch (globalError) {
        return res.status(500).json({ success: false, log: `Błąd serwera: ${globalError.message}` });
    }
};
