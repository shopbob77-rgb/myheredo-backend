const express = require('express');
const cors = require('cors');

const app = express();

// Pełne zezwolenie na komunikację z Twoim front-endem
app.use(cors({ origin: '*' }));
app.use(express.json());

// Pomocnicza trasa testowa, żeby sprawdzić czy serwer w ogóle żyje
app.get('/api', (req, res) => {
    res.send('Backend MyHeredo działa i czeka na zapytania POST!');
});

// Główna trasa obsługująca zapis do Bitwardena
app.post('/api', async (req, res) => {
    try {
        // 1. Pobieramy klucze bezpośrednio z bezpiecznych zmiennych Vercela
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const { tekstNotatki } = req.body;

        if (!clientId || !clientSecret) {
            console.error("Błąd: Brak zmiennych środowiskowych na Vercelu!");
            return res.status(500).json({ error: "Serwer nie posiada skonfigurowanych kluczy API Bitwarden." });
        }

        console.log("Próba logowania do Bitwarden Identity za pomocą:", clientId);

        // 2. KROK 1: Pobieranie tokenu dostępu z serwera IDENTITY (Formatowanie x-www-form-urlencoded)
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
       
        params.append('client_id', clientId.trim());
        params.append('client_secret', clientSecret.trim());

        const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!tokenResponse.ok) {
            const tokenErr = await tokenResponse.text();
            console.error("Bitwarden Identity odrzucił klucze:", tokenErr);
            return res.status(500).json({ error: "Błąd uwierzytelniania w Bitwarden. Zweryfikuj klucze." });
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;
        console.log("Sukces: Pomyślnie pobrano token autoryzacyjny!");

        // 3. KROK 2: Szukanie ID kolekcji o nazwie "MyHeredo" lub pobranie pierwszej lepszej dostępnej
        const collectionsResponse = await fetch('https://api.bitwarden.com/collections', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let collectionId = null;
        if (collectionsResponse.ok) {
            const collectionsData = await collectionsResponse.json();
            const existingColl = collectionsData.data?.find(c => c.name === "MyHeredo" || c.name === "Sejf cyfrowy -demo");
            if (existingColl) {
                collectionId = existingColl.id;
            } else if (collectionsData.data && collectionsData.data.length > 0) {
                collectionId = collectionsData.data[0].id;
            }
        }

        if (!collectionId) {
            console.error("Nie znaleziono żadnej kolekcji w organizacji.");
            return res.status(400).json({ error: "Nie znaleziono żadnej kolekcji w organizacji Bitwarden. Utwórz choć jedną kolekcję w panelu." });
        }

        // 4. KROK 3: Wysłanie bezpiecznej notatki jako nowy zasób (Cipher) w organizacji
        const bezpiecznyElement = {
            type: 2, // Zabezpieczona notatka (Secure Note)
            name: "MyHeredo - Protokół Sukcesji",
            notes: tekstNotatki,
            collectionIds: [collectionId],
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
            console.log("Notatka została pomyślnie zapisana w Bitwardenie!");
            return res.status(200).json({ success: true });
        } else {
            const cipherErr = await cipherResponse.text();
            console.error("Bitwarden API odrzucił zapis notatki:", cipherErr);
            return res.status(500).json({ error: "Bitwarden odrzucił zapis zasobu.", details: cipherErr });
        }

    } catch (error) {
        console.error("Krytyczny błąd serwera proxy:", error);
        return res.status(500).json({ error: "Wewnętrzny błąd serwera podczas przetwarzania protokołu." });
    }
});

// Eksport aplikacji dla środowiska Vercel Serverless
module.exports = app;

module.exports = app;
