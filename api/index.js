const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo działa w trybie pełnej automatyzacji!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret) {
            return res.status(500).json({ error: "Brak skonfigurowanych kluczy API na Vercelu." });
        }

        // 1. Pobieranie tokenu dostępu
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
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

        // 2. AUTOMATYCZNE TWORZENIE KOLEKCJI (Docelowe zachowanie)
        console.log("Automatyczne tworzenie/sprawdzanie kolekcji MyHeredo...");
        
        const nowaKolekcja = {
            name: "MyHeredo",
            externalId: "myheredo-auto-collection",
            groups: [] // Pusta tablica nadaje dostęp administratorom API
        };

        const createCollResponse = await fetch('https://api.bitwarden.com/collections', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(nowaKolekcja)
        });

        let collectionId = null;

        if (createCollResponse.ok) {
            const createdCollData = await createCollResponse.json();
            collectionId = createdCollData.id;
            console.log("Pomyślnie utworzono nową dedykowaną kolekcję:", collectionId);
        } else {
            // Jeśli kolekcja istnieje lub nie można jej stworzyć, próbujemy pobrać listę, 
            // a w razie niepowodzenia tworzymy awaryjny punkt zapisu bezpośredniego.
            const altResponse = await fetch('https://api.bitwarden.com/collections', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (altResponse.ok) {
                const altData = await altResponse.json();
                collectionId = altData.data?.[0]?.id;
            }
        }

        // Jeśli z jakiegoś powodu organizacja blokuje kolekcje, Bitwarden pozwala na zapis bez podawania ID kolekcji,
        // wrzucając element do głównego sejfu organizacji (jako "Nieprzypisane").
        const idKolekcjiDoZapisu = collectionId ? [collectionId] : [];

        // 3. Tworzenie bezpiecznej notatki
        const bezpiecznyElement = {
            type: 2, 
            name: "MyHeredo - Protokół Sukcesji",
            notes: tekstNotatki,
            collectionIds: idKolekcjiDoZapisu,
            secureNote: { type: 0 }
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
            return res.status(500).json({ error: "Bitwarden odrzucił zapis zasobu.", details: cipherErr });
        }

    } catch (error) {
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;
