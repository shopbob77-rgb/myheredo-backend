module.exports = async (req, res) => {
    // 1. Ustawienia nagłówków CORS (Zgoda na komunikację z Twoim frontendem)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Obsługa zapytań preflight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Metoda niedozwolona. Użyj POST." });
    }

    try {
        // ==========================================
        // CONFIG: TUTAJ WKLEJ POPRAWNE ID SWOJEJ KOLEKCJI Z BITWARDENA
        // ==========================================
        const MY_BITWARDEN_COLLECTION_ID = "2ea9a78e-cc80-41d9-b92c-b45d01489fe8"; 
        // ==========================================

        const { action, dmsDays, vault, tekstNotatki } = req.body;

        const organizationId = process.env.BW_ORGANIZATION_ID;
        const clientId = process.env.BW_CLIENT_ID;
        const clientSecret = process.env.BW_CLIENT_SECRET;

        if (!organizationId || !clientId || !clientSecret) {
            return res.status(200).json({ success: false, log: "Brak zmiennych środowiskowych w panelu Vercel." });
        }

        // 2. Autoryzacja OAuth2 w chmurze Bitwarden
        const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`
        });

        if (!tokenResponse.ok) {
            return res.status(200).json({ success: false, log: "Autoryzacja odrzucona przez Bitwarden Identity API. Sprawdź klucze." });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 3. Budowanie zawartości przesyłanej notatki
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `--- SYSTEM SUKCESJI MYHEREDO ACTIVE ---\nData: ${new Date().toLocaleString('pl-PL')}\nInterwał DMS: ${dmsDays || 90} dni\n\nPayload:\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = "Aktualizacja skrytki MyHeredo - Brak zawartości.";
        }

        // 4. Przygotowanie technicznego formatu Base64 akceptowanego przez walidator chmury
        const cleanTitle = `MyHeredo - Protokol (${action || 'Sync'})`;
        const base64Title = Buffer.from(cleanTitle).toString('base64');
        const base64Notes = Buffer.from(finalContent).toString('base64');

        // Konstrukcja kompatybilna z silnikiem Bitwarden (Typ szyfru 2)
        const bitwardenName = `2.${base64Title}|${base64Title}`;
        const bitwardenNotes = `2.${base64Notes}|${base64Notes}`;

        const payloadCipher = {
            organizationId: organizationId.trim(),
            folderId: null,
            collectionIds: [MY_BITWARDEN_COLLECTION_ID.trim()], 
            type: 2, 
            name: bitwardenName,
            notes: bitwardenNotes,
            secureNote: {
                type: 0
            }
        };

        // 5. Wysłanie żądania utworzenia wpisu
        const cipherResponse = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadCipher)
        });

        if (cipherResponse.ok) {
            return res.status(200).json({ success: true, log: "Zapisano pomyślnie w Bitwarden!" });
        } else {
            return res.status(200).json({ 
                success: false, 
                log: `Bitwarden API zwrócił status błędu: ${cipherResponse.status}. Prawdopodobnie nieprawidłowe ID kolekcji lub brak uprawnień zapisu dla klucza organizacji.` 
            });
        }

    } catch (globalError) {
        // Całkowite zabezpieczenie przed crashem funkcji Serverless
        return res.status(200).json({ success: false, log: `Błąd krytyczny skryptu backendu: ${globalError.message}` });
    }
};
