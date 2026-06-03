const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo (Organization Cipher Engine) działa!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const organizationId = process.env.BW_ORGANIZATION_ID;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret || !organizationId) {
            return res.status(500).json({ 
                error: "Brak skonfigurowanych zmiennych środowiskowych na Vercelu.",
                details: { 
                    hasClientId: !!clientId, 
                    hasClientSecret: !!clientSecret, 
                    hasOrgId: !!organizationId 
                }
            });
        }

        // 1. Logowanie do Bitwarden Identity (Pobieranie tokenu)
        const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`
        });

        if (!tokenResponse.ok) {
            return res.status(500).json({ error: "Błąd uwierzytelniania w Bitwarden." });
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;

        // 2. Pobieranie kolekcji należących do tej organizacji
        const collectionsResponse = await fetch(`https://api.bitwarden.com/organizations/${organizationId.trim()}/collections`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let collectionId = null;
        if (collectionsResponse.ok) {
            const collectionsData = await collectionsResponse.json();
            if (collectionsData.data && collectionsData.data.length > 0) {
                collectionId = collectionsData.data[0].id;
            }
        }

        // 3. OFICJALNA STRUKTURA ZGODNA Z WALIDATOREM BITWARDEN API
        // Pola tekstowe w trybie niezaszyfrowanym (Organization API) muszą być przekazane dokładnie w ten sposób:
        const bezpiecznaNotatka = {
            type: 2, // 2 = Secure Note
            name: "MyHeredo - Protokół Sukcesji",
            folderId: null,
            favorite: false,
            collectionIds: collectionId ? [collectionId] : [],
            secureNote: {
                notes: tekstNotatki
            }
        };

        // Wywołanie dedykowanego punktu końcowego dla Organizacji
        const cipherResponse = await fetch(`https://api.bitwarden.com/organizations/${organizationId.trim()}/ciphers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bezpiecznaNotatka)
        });

        if (cipherResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            const cipherErr = await cipherResponse.text();
            console.error("Błąd zapisu w organizacji:", cipherErr);
            return res.status(500).json({ error: "Bitwarden odrzucił wpis organizacji.", details: cipherErr });
        }

    } catch (error) {
        console.error("Krytyczny błąd serwera:", error);
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;
