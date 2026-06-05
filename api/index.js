const https = require('https');

module.exports = async (req, res) => {
    // 1. Obsługa nagłówków CORS
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
        return res.status(405).json({ error: "Metoda niedozwolona." });
    }

    try {
        const { action, dmsDays, vault, tekstNotatki } = req.body || {};

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(200).json({ success: false, log: "Brak zmiennych srodowiskowych BW_ na Vercelu." });
        }

        // 2. KROK 1: Logowanie do Bitwarden przez OAuth2 (Natywny HTTPS POST)
        const tokenDataString = `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`;
        
        const tokenOptions = {
            hostname: 'identity.bitwarden.com',
            port: 444,
            path: '/connect/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenDataString)
            }
        };

        const accessToken = await new Promise((resolve, reject) => {
            const tokenReq = https.request(tokenOptions, (tokenRes) => {
                let body = '';
                tokenRes.on('data', (chunk) => body += chunk);
                tokenRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.access_token) resolve(parsed.access_token);
                        else reject(new Error("Brak tokena w odpowiedzi"));
                    } catch (e) {
                        reject(new Error("Blad parsowania tokena"));
                    }
                });
            });
            tokenReq.on('error', (err) => reject(err));
            tokenReq.write(tokenDataString);
            tokenReq.end();
        });

        // 3. Przygotowanie zawartości do wysłania
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `--- SYSTEM SUKCESJI ACTIVE ---\nData: ${new Date().toLocaleString('pl-PL')}\nInterwal: ${dmsDays || 90} dni\n\nPayload:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = "Aktualizacja skrytki MyHeredo";
        }

        // 4. Formatowanie CipherString dla Bitwardena
        const cleanTitle = `MyHeredo - Protokol (${action || 'Sync'})`;
        const base64Title = Buffer.from(cleanTitle).toString('base64');
        const base64Notes = Buffer.from(finalContent).toString('base64');

        const bitwardenName = `2.${base64Title}|${base64Title}`;
        const bitwardenNotes = `2.${base64Notes}|${base64Notes}`;

        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: ["2ea9a78e-cc80-41d9-b92c-b45d01489fe8"],
            type: 2,
            name: bitwardenName,
            notes: bitwardenNotes,
            secureNote: { type: 0 }
        });

        // 5. KROK 2: Wysłanie rekordu do Bitwarden API
        const cipherOptions = {
            hostname: 'api.bitwarden.com',
            port: 444,
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
                let body = '';
                cipherRes.on('data', (chunk) => body += chunk);
                cipherRes.on('end', () => {
                    if (cipherRes.statusCode >= 200 && cipherRes.statusCode < 300) {
                        resolve({ success: true, log: "Zapisano w Bitwarden!" });
                    } else {
                        resolve({ success: false, log: `Bitwarden API zwrocil status błędu: ${cipherRes.statusCode}. Sprawdz ID kolekcji.` });
                    }
                });
            });
            cipherReq.on('error', (err) => resolve({ success: false, log: `Blad sieci: ${err.message}` }));
            cipherReq.write(payloadCipher);
            cipherReq.end();
        });

        return res.status(200).json(result);

    } catch (globalError) {
        // Blok całkowicie eliminujący crash (zawsze zwraca czysty JSON 200)
        return res.status(200).json({ success: false, log: `Blad wewnetrzny: ${globalError.message}` });
    }
};
