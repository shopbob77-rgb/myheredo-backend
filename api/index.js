const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo jest w pełni sprawny!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret) {
            return res.status(500).json({ error: "Brak skonfigurowanych kluczy API na Vercelu." });
        }

        // 1. Logowanie i pobieranie tokenu
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

        // Ekstracja ID organizacji z klucza client_id (format: organization.ID)
        const orgIdMatch = clientId.match(/organization\.([a-f0-9\-]+)/i);
        const organizationId = orgIdMatch ? orgIdMatch[1] : null;

        // 2. Budowanie pancernego obiektu BEZ pytania o kolekcje
        // Wysyłamy element bezpośrednio do organizacji
        const bezpiecznyElement = {
            organizationId: organizationId,
            type: 2, // Zabezpieczona notatka
            name: "MyHeredo - Protokół Sukcesji",
            notes: tekstNotatki,
            collectionIds: [], // Pusta tablica - zapis bezpośredni w sejfie organizacji
            secureNote: {
                type: 0
            }
        };

        // 3. Wysłanie żądania zapisu
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
            
            // Szybki fallback: Jeśli Bitwarden bezwzględnie odrzuci pustą tablicę kolekcji,
            // wysyłamy obiekt bez tego klucza jako czysty zasób osobisty powiązany z sesją API
            const fallbackElement = {
                type: 2,
                name: "MyHeredo - Protokół Sukcesji",
                notes: tekstNotatki,
                secureNote: { type: 0 }
            };

            const fallbackResponse = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(fallbackElement)
            });

            if (fallbackResponse.ok) {
                return res.status(200).json({ success: true });
            }

            return res.status(500).json({ error: "Bitwarden odrzucił strukturę zapisu.", details: cipherErr });
        }

    } catch (error) {
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;

module.exports = app;
