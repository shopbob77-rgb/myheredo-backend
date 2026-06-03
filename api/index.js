const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo (Secure Protocol Engine) działa!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const organizationId = process.env.BW_ORGANIZATION_ID;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret || !organizationId) {
            return res.status(500).json({ error: "Brak skonfigurowanych zmiennych na Vercelu." });
        }

        // 1. Logowanie do Bitwarden (Pobieranie tokenu)
        const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`
        });

        if (!tokenResponse.ok) {
            return res.status(500).json({ error: "Błąd uwierzytelniania w chmurze Bitwarden." });
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;

        // 2. Struktura danych dla bezpiecznego przesyłania tekstu (Bitwarden Send API)
        // Ten endpoint natywnie przyjmuje tekst w postaci Plaintext na poziomie chmury
        const rokPozniej = new Date();
        rokPozniej.setFullYear(rokPozniej.getFullYear() + 1);

        const payloadSend = {
            organizationId: organizationId.trim(),
            type: 1, // 1 = Typ Tekstowy (Text Send)
            name: "MyHeredo - Protokół Sukcesji",
            text: {
                text: tekstNotatki
            },
            notes: "Bezpieczny protokół wygenerowany przez aplikację MyHeredo.",
            deletionDate: rokPozniej.toISOString(),
            disabled: false
        };

        // 3. Wysłanie żądania utworzenia bezpiecznego zasobu
        const sendResponse = await fetch('https://api.bitwarden.com/sends', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadSend)
        });

        if (sendResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            const sendErr = await sendResponse.text();
            console.error("Szczegóły odrzucenia:", sendErr);
            return res.status(500).json({ error: "Chmura Bitwarden odrzuciła strukturę danych.", details: sendErr });
        }

    } catch (error) {
        console.error("Błąd serwera:", error);
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;

