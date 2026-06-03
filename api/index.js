const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo gotowy do akcji!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret) {
            return res.status(500).json({ error: "Brak skonfigurowanych kluczy API na Vercelu." });
        }

        // 1. Logowanie i pobieranie tokenu dostępu
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

        // EKSTRAKCJA ID ORGANIZACJI: Klucze client_id dla organizacji mają format: organization.ID_ORGANIZACJI
        // Wyciągamy czyste ID organizacji potrzebne do nagłówków i obiektów
        const orgIdMatch = clientId.match(/organization\.([a-f0-9\-]+)/i);
        const organizationId = orgIdMatch ? orgIdMatch[1] : null;

        // 2. Pobieranie listy kolekcji, aby przypisać wymagany punkt zapisu
        const collectionsResponse = await fetch('https://api.bitwarden.com/collections', {
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

        if (!collectionId) {
            return res.status(400).json({ error: "Nie znaleziono wymaganej kolekcji w organizacji." });
        }

        // 3. OFICJALNA STRUKTURA CIPHER DLA ORGANIZACJI W BITWARDEN
        // Dołączamy wymagane pola identyfikacyjne organizacji
        const bezpiecznyElement = {
            organizationId: organizationId,
            type: 2, // Secure Note
            name: "MyHeredo - Protokół Sukcesji",
            notes: tekstNotatki,
            collectionIds: [collectionId],
            secureNote: {
                type: 0
            }
        };

        const cipherResponse = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bezpiecznyElement)
        });

        if (cipherResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            const cipherErr = await cipherResponse.text();
            console.error("Bitwarden odrzucił żądanie. Powód:", cipherErr);
            return res.status(500).json({ error: "Bitwarden odrzucił zapis zasobu.", details: cipherErr });
        }

    } catch (error) {
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;
