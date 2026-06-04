const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Backend MyHeredo (Secure Organization Engine) działa!');
});

app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const organizationId = process.env.BW_ORGANIZATION_ID;
        
        // Zależnie od tego czy frontend przysyła "tekstNotatki" czy "vault" z akcji activate_dms
        const { tekstNotatki, vault, dmsDays } = req.body;

        // Budujemy treść, która zostanie zapisana w bezpiecznej notatce
        let finalContent = "";
        if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else if (vault) {
            finalContent = `--- PROTOKÓŁ SUKCESJI MYHEREDO ---\n` +
                           `Okres bezczynności DMS: ${dmsDays || 90} dni\n` +
                           `Zaszyfrowane dane sejfu:\n${JSON.stringify(vault, null, 2)}`;
        } else {
            finalContent = "Pusty protokół sukcesji.";
        }

        if (!clientId || !clientSecret || !organizationId) {
            return res.status(500).json({ error: "Brak skonfigurowanych zmiennych na Vercelu." });
        }

        // 1. Logowanie do Bitwarden (Pobieranie tokenu jako Organizacja)
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

        // 2. Struktura danych dla Bezpiecznej Notatki Organizacji (Ciphers API)
        // Publiczne API organizacji pozwala na stabilne tworzenie obiektów w sejfie.
        // Wykorzystujemy typ 2 (Secure Note) przypisany do Twojego organizationId.
        const payloadCipher = {
            organizationId: organizationId.trim(),
            type: 2, // 2 = Secure Note (Bezpieczna Notatka)
            name: `MyHeredo - Protokół Sukcesji (${new Date().toLocaleDateString('pl-PL')})`,
            notes: finalContent,
            folderId: null,
            collectionIds: [] // Jeśli chcesz, możesz wkleić tu ID konkretnej kolekcji z Bitwardena w formacie stringa ["id-kolekcji"]
        };

        // 3. Wysłanie żądania utworzenia bezpiecznej notatki w organizacji zamiast Sends
        const cipherResponse = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadCipher)
        });

        if (cipherResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            const cipherErr = await cipherResponse.text();
            console.error("Szczegóły odrzucenia:", cipherErr);
            return res.status(500).json({ error: "Chmura Bitwarden odrzuciła zapis notatki w organizacji.", details: cipherErr });
        }

    } catch (error) {
        console.error("Błąd serwera:", error);
        return res.status(500).json({ error: "Wewnętrzny błąd serwera." });
    }
});

module.exports = app;
