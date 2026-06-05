const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Prosty endpoint testowy typu GET
app.get('/api', (req, res) => {
    res.send('Backend MyHeredo (Secure Organization Engine) działa stabilnie!');
});

// Główny kontroler obsługujący żądania POST z aplikacji frontonowej
app.post('/api', async (req, res) => {
    try {
        const clientId = process.env.BW_CLIENT_ID || process.env.client_id;
        const clientSecret = process.env.BW_CLIENT_SECRET || process.env.client_secret;
        const organizationId = process.env.BW_ORGANIZATION_ID;
        
        // Wyciągamy parametry sterujące przesłane z pliku app.js
        const { action, masterKey, tekstNotatki, vault, dmsDays } = req.body;

        // Bezpiecznik: weryfikacja istnienia kluczy konfiguracyjnych na Vercelu
        if (!clientId || !clientSecret || !organizationId) {
            return res.status(500).json({ error: "Brak skonfigurowanych zmiennych środowiskowych na serwerze Vercel." });
        }

        // ==========================================
        // 🔐 OBSŁUGA STRATEGII 1: LOGOWANIE / ODSZYFROWANIE (get_vault)
        // ==========================================
        if (action === "get_vault") {
            // W prawdziwym środowisku produkcyjnym sprawdzasz tutaj poprawność klucza masterKey
            // Na potrzeby obecnej integracji weryfikujemy połączenie z chmurą i zwracamy strukturę startową
            const tokenResponse = await fetch('https://identity.bitwarden.com/connect/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=client_credentials&client_id=${clientId.trim()}&client_secret=${clientSecret.trim()}`
            });

            if (!tokenResponse.ok) {
                return res.status(401).json({ error: "Błąd uwierzytelniania kluczy organizacji w Bitwarden." });
            }

            // Sukces autoryzacji: wpuszczamy użytkownika i przekazujemy czystą strukturę sejfu
            return res.status(200).json({
                success: true,
                vaultData: { bank: "", crypto: "", business: "", social: "" }
            });
        }

        // ==========================================
        // 🛡️ OBSŁUGA STRATEGII 2: ZAPIS I AKTYWACJA PROTOKOŁU (DMS / UPDATE)
        // ==========================================
        
        // 1. Logowanie do Bitwarden (Pobieranie tokenu dostępowego OAuth2 dla organizacji)
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

        // 2. Parsowanie i ujednolicanie przesyłanej treści
        let finalContent = "";
        if (action === "activate_dms" || vault) {
            finalContent = `--- SYSTEM SUKCESJI MYHEREDO ACTIVE ---\n` +
                           `Data aktywacji protokołu: ${new Date().toLocaleString('pl-PL')}\n` +
                           `Zdefiniowany interwał DMS: ${dmsDays || 90} dni\n\n` +
                           `Zaszyfrowany ładunek struktur danych (Payload):\n${JSON.stringify(vault || {}, null, 2)}`;
        } else if (tekstNotatki) {
            finalContent = tekstNotatki;
        } else {
            finalContent = `Aktualizacja skrytki MyHeredo - Brak dodatkowej zawartości tekstowej.`;
        }

       // 3. Budowanie payloadu dla bezpiecznego obiektu kolekcji (Cipher typu Secure Note)
        const payloadCipher = {
            organizationId: organizationId.trim(),
            type: 2, 
            name: `MyHeredo - Protokół (${action || 'Sync'}) - ${new Date().toLocaleDateString('pl-PL')}`,
            notes: finalContent,
            folderId: null,
            collectionIds: ["2ea9a78e-cc80-41d9-b92c-b45d01489fe8"] // <--- DOKŁADNIE TA WARTOŚĆ
        };

        // 4. Wywołanie żądania zapisu bezpośrednio do zasobów sejfu chmury Bitwarden
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
            console.error("Szczegóły odrzucenia przez API Bitwarden:", cipherErr);
            return res.status(500).json({ error: "Chmura Bitwarden odrzuciła strukturę zapisu notatki.", details: cipherErr });
        }

    } catch (error) {
        console.error("Wewnętrzny krytyczny błąd serwera:", error);
        return res.status(500).json({ error: "Wewnętrzny błąd serwera podczas przetwarzania żądania." });
    }
});

module.exports = app;
