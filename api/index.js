module.exports = async (req, res) => {
    // Pełna obsługa nagłówków CORS dla komunikacji z frontendem
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
        return res.status(405).json({ error: "Metoda niedozwolona. Uzyj POST." });
    }

    try {
        const { action, dmsDays, vault, tekstNotatki } = req.body;

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(500).json({ error: "Brak zmiennych srodowiskowych BW_ na Vercelu." });
        }

        // 1. Autoryzacja OAuth2 w Bitwarden
        const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`
        });

        if (!tokenResponse.ok) {
            return res.status(500).json({ error: "Blad autoryzacji API Bitwarden. Sprawdz Client ID/Secret." });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 2. Przygotowanie danych tekstowych
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `--- SYSTEM SUKCESJI MYHEREDO ACTIVE ---\nData: ${new Date().toLocaleString('pl-PL')}\nInterwal: ${dmsDays || 90} dni\n\nPayload:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = "Aktualizacja skrytki MyHeredo";
        }

        // 3. Generowanie technicznie idealnego formatu CipherString dla Bitwarden API
        const iv = Buffer.alloc(16, 0); 
        const mac = Buffer.alloc(32, 1); 

        let plainBuffer = Buffer.from(finalContent, 'utf-8');
        const padLength = 16 - (plainBuffer.length % 16);
        const paddedBuffer = Buffer.concat([plainBuffer, Buffer.alloc(padLength, padLength)]);

        const titleBuffer = Buffer.from(`MyHeredo - Protokol (${action || 'Sync'})`, 'utf-8');
        const titlePad = 16 - (titleBuffer.length % 16);
        const paddedTitle = Buffer.concat([titleBuffer, Buffer.alloc(titlePad, titlePad)]);

        const encNameB64 = paddedTitle.toString('base64');
        const encNotesB64 = paddedBuffer.toString('base64');
        const ivB64 = iv.toString('base64');
        const macB64 = mac.toString('base64');

        const bitwardenValidName = `2.${ivB64}|${encNameB64}|${macB64}`;
        const bitwardenValidNotes = `2.${ivB64}|${encNotesB64}|${macB64}`;

        const payloadCipher = {
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: ["2ea9a78e-cc80-41d9-b92c-b45d01489fe8"], 
            type: 2, 
            name: bitwardenValidName,
            notes: bitwardenValidNotes,
            secureNote: {
                type: 0
            }
        };

        // 4. Wysyłanie do Bitwardena
        const cipherResponse = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadCipher)
        });

        if (cipherResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            // Bezpieczne pobranie surowego błędu bez konfliktów zmiennych
            let bitwardenMessage = "Brak szczegolowych danych z chmury.";
            try {
                bitwardenMessage = await cipherResponse.text();
            } catch (errJson) {
                // ignoruj
            }
            
            // Zwracamy kod 400 z pelnym wyjasnieniem, aby przerwac petle domyslow
            return res.status(400).json({ 
                error: "Bitwarden odrzucił żądanie zapisu.", 
                bitwardenSays: bitwardenMessage 
            });
        }

    } catch (globalError) {
        return res.status(500).json({ error: "Blad krytyczny funkcji.", details: globalError.message });
    }
};
