const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo (Organization API) działa idealnie!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret) {
            return res.status(500).json({ error: "Brak skonfigurowanych kluczy API na Vercelu." });
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

        // Ekstracja ID organizacji z klucza client_id (format: organization.ID-ORGANIZACJI)
        const orgIdMatch = clientId.match(/organization\.([a-f0-9\-]+)/i);
        const organizationId = orgIdMatch ? orgIdMatch[1] : null;

        if (!organizationId) {
            return res.status(400).json({ error: "Nie udało się wyodrębnić ID organizacji z klucza Client ID." });
        }

        // 2. Pobieranie kolekcji należących do tej organizacji (żeby dopisać notatkę)
        const collectionsResponse = await fetch(`https://api.bitwarden.com/organizations/${organizationId}/collections`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let collectionId = null;
        if (collectionsResponse.ok) {
            const collectionsData = await collectionsResponse.json();
            if (collectionsData.data && collectionsData.data.length > 0) {
                // Wybieramy pierwszą wolną kolekcję z brzegu, którą znajdziemy w organizacji
                collectionId = collectionsData.data[0].id;
            }
        }

        // 3. Budowanie oficjalnego obiektu Notatki dla Organizacji (Zwykły tekst jest w pełni akceptowany!)
        const bezpiecznaNotatka = {
            type: 2, // Secure Note
            name: "MyHeredo - Protokół Sukcesji",
            notes: tekstNotatki,
            collectionIds: collectionId ? [collectionId] : []
        };

        // Wywołanie dedykowanego punktu końcowego dla Organizacji (zgodnie ze specyfikacją)
        const cipherResponse = await fetch(`https://api.bitwarden.com/organizations/${organizationId}/ciphers`, {
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
