const https = require('https');

function getRequestBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); } catch (e) {
                const params = new URLSearchParams(body);
                const obj = {};
                for (const [key, value] of params) { obj[key] = value; }
                resolve(obj);
            }
        });
    });
}

function makeHttpsRequest(options, payload = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', (chunk) => resBody += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: resBody }));
        });
        req.on('error', (err) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(200).json({ status: "Działa", message: "Serwer MyHeredo jest aktywny." });
    }

    try {
        const body = await getRequestBody(req);
        const { action, dmsDays, vault, tekstNotatki } = body;

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(400).json({ success: false, log: "Brak zmiennych środowiskowych." });
        }

        // 1. Logowanie i pobranie tokenu dostępu
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

        if (!accessToken) return res.status(401).json({ success: false, log: "Błąd autoryzacji tokenu." });

        // 2. Obsługa akcji logowania (get_vault) - już działa, zostawiamy stabilną wersję
        if (action === "get_vault") {
            return res.status(200).json({ success: true, vaultData: {} });
        }

        // 3. AUTOMATYCZNE POBIERANIE KOLEKCJI (Zapobiega błędowi 400 przy złym ID)
        const collectionOptions = {
            hostname: 'api.bitwarden.com',
            port: 443,
            path: `/organizations/${organizationId.trim()}/collections`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        };

        const collectionResult = await makeHttpsRequest(collectionOptions);
        let validCollectionId = null;

        try {
            const collectionsParsed = JSON.parse(collectionResult.body);
            if (collectionsParsed.data && collectionsParsed.data.length > 0) {
                // Wybieramy pierwszą dostępną kolekcję z brzegu, do której serwer ma dostęp
                validCollectionId = collectionsParsed.data[0].id;
            }
        } catch (e) {
            console.log("Nie udało się sparsować kolekcji automatycznie.");
        }

        // Jeśli auto-wykrywanie zawiedzie, używamy awaryjnego ID jako fallback
        if (!validCollectionId) {
            validCollectionId = "2ea9a78e-cc80-41d9-b92c-b45d01489fe8";
        }

        // 4. Przygotowanie treści bezpiecznej notatki
        let secureContent = `--- PROTOKÓŁ SYSTEMU MYHEREDO ---\nWygenerowano: ${new Date().toLocaleString('pl-PL')}\n`;
        if (action === "activate_dms" || vault) {
            secureContent += `Interwał DMS: ${dmsDays || 90} dni\n\n[DANE SEJFU]:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            secureContent += `\n[TREŚĆ]:\n${tekstNotatki}`;
        }

        // 5. Wysłanie danych do Bitwarden z dynamicznym, poprawnym ID kolekcji
        const payloadCipher = JSON.stringify({
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: [validCollectionId],
            type: 2, 
            name: `MyHeredo - Protokol (${action || 'Sync'})`,
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
            return res.status(200).json({ success: true, log: "Dane zapisane pomyślnie!" });
        } else {
            return res.status(400).json({ success: false, log: `Bitwarden odrzucił strukturę. Status: ${postResult.statusCode}`, details: postResult.body });
        }

    } catch (globalError) {
        return res.status(500).json({ success: false, log: `Błąd: ${globalError.message}` });
    }
};
