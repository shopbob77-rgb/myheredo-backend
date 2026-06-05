const https = require('https');

module.exports = async (req, res) => {
    // 1. Pełne nagłówki CORS
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

    // Akceptujemy zapytania POST pod każdy wariant adresu URL
    if (req.method !== 'POST') {
        return res.status(200).json({ error: "Metoda niedozwolona. Backend oczekuje zapytania typu POST." });
    }

    try {
        const { action, dmsDays, vault, tekstNotatki } = req.body || {};

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(200).json({ success: false, log: "Brak zmiennych srodowiskowych BW_ na Vercelu." });
        }

        // 2. KROK 1: Autoryzacja OAuth2 w Bitwarden (Port 443 - Standard HTTPS)
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
                let body = '';
                tokenRes.on('data', (chunk) => body += chunk);
                tokenRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.access_token) resolve(parsed.access_token);
                        else reject(new Error("Bitwarden odrzucil klucze Client ID / Secret."));
                    } catch (e) {
                        reject(new Error("Blad parsowania odpowiedzi autoryzacji."));
                    }
                });
            });
            tokenReq.on('error', (err) => reject(err));
            tokenReq.write(tokenDataString);
            tokenReq.end();
        });

        // 3. Przygotowanie tresci
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `--- SYSTEM SUKCESJI ACTIVE ---\nData: ${new Date().toLocaleString('pl-PL')}\nInterwal: ${dmsDays || 90} dni\n\nPayload:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = "Aktualizacja skrytki MyHeredo";
        }

        // 4. Formatowanie CipherString
        const cleanTitle = `MyHeredo - Protokol (${action || 'Sync'})`;
        const base64Title = Buffer.from(cleanTitle).toString('base64');
        const base64Notes = Buffer.from(finalContent).toString('base64');

        const bitwardenName = `2.${base64Title}|${base64Title}`;
        const bitwardenNotes = `2.${base64Notes}|${base64Notes}`;

        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: ["2ea9a78e-cc80-41d9-b92c-b45d01489fe8"], // ID Twojej kolekcji
            type: 2,
            name: bitwardenName,
            notes: bitwardenNotes,
            secureNote: { type: 0 }
        });

        // 5. KROK 2: Wysylanie rekordu do Bitwarden API (Port 443 - Standard HTTPS)
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
                let body = '';
                cipherRes.on('data', (chunk) => body += chunk);
                cipherRes.on('end', () => {
                    if (cipherRes.statusCode >= 200 && cipherRes.statusCode < 300) {
                        resolve({ success: true, log: "Sukces! Zapisano w Bitwarden." });
                    } else {
                        resolve({ success: false, log: `Bitwarden API zwrocil status: ${cipherRes.statusCode}. Sprawdz czy ID kolekcji jest poprawne.` });
                    }
                });
            });
            cipherReq.on('error', (err) => resolve({ success: false, log: `Blad sieci API: ${err.message}` }));
            cipherReq.write(payloadCipher);
            cipherReq.end();
        });

        return res.status(200).json(result);

    } catch (globalError) {
        // Pelne wygaszenie bledow 500 - serwer zawsze odpowiada strukturalnie
        return res.status(200).json({ success: false, log: `Blad przetwarzania: ${globalError.message}` });
    }
};
