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

module.exports = async (req, res) => {
    // Nagłówki CORS
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

    // Jeśli użytkownik wejdzie przez przeglądarkę (GET) - wyświetlamy ładny komunikat zamiast surowego błędu
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

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(400).json({ success: false, log: "Brak zmiennych środowiskowych BW_ w panelu Vercel." });
        }

        // 1. Logowanie do OAuth2 Bitwarden
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

        const accessToken = await new Promise((resolve, reject) => {
            const tokenReq = https.request(tokenOptions, (tokenRes) => {
                let resBody = '';
                tokenRes.on('data', (chunk) => resBody += chunk);
                tokenRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(resBody);
                        if (parsed.access_token) resolve(parsed.access_token);
                        else reject(new Error("Bitwarden odrzucił klucze dostępowe API."));
                    } catch (e) {
                        reject(new Error("Błąd autoryzacji tokena."));
                    }
                });
            });
            tokenReq.on('error', (err) => reject(err));
            tokenReq.write(tokenDataString);
            tokenReq.end();
        });

        // 2. Przygotowanie danych tekstowych
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `Interwał: ${dmsDays || 90} dni. Dane skrytki: ${JSON.stringify(vault || {})}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = "Aktualizacja skrytki MyHeredo";
        }

        const itemTitle = `MyHeredo - Protokol (${action || 'Sync'})`;

        // 3. Budowanie struktury Fields akceptowanej przez Organizacje
        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: ["2ea9a78e-cc80-41d9-b92c-b45d01489fe8"],
            type: 2, 
            name: itemTitle,
            notes: `Zaszyfrowano protokołem MyHeredo. Wygenerowano: ${new Date().toLocaleString('pl-PL')}`,
            fields: [
                {
                    name: "Dane Logu",
                    value: finalContent,
                    type: 1 
                }
            ],
            secureNote: { type: 0 }
        });

        // 4. Wysłanie żądania utworzenia wpisu
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

        const result = await new Promise((resolve) => {
            const cipherReq = https.request(cipherOptions, (cipherRes) => {
                let cipherBody = '';
                cipherRes.on('data', (chunk) => cipherBody += chunk);
                cipherRes.on('end', () => {
                    // Zwracamy status HTTP odpowiadający sukcesowi (200/201)
                    if (cipherRes.statusCode >= 200 && cipherRes.statusCode < 300) {
                        resolve({ success: true, status: 200, log: "Sukces! Protokół został poprawnie zapisany w Bitwarden." });
                    } else {
                        resolve({ 
                            success: false, 
                            status: cipherRes.statusCode,
                            log: `Bitwarden API zwrócił status: ${cipherRes.statusCode}.` 
                        });
                    }
                });
            });
            cipherReq.on('error', (err) => resolve({ success: false, status: 500, log: `Błąd połączenia: ${err.message}` }));
            cipherReq.write(payloadCipher);
            cipherReq.end();
        });

        // Dostosowanie statusu odpowiedzi do wyniku operacji w Bitwardenie
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }

    } catch (globalError) {
        return res.status(500).json({ success: false, log: `Błąd wewnętrzny: ${globalError.message}` });
    }
};
