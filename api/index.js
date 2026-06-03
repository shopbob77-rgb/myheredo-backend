const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// 1. Konfiguracja CORS (Zielone światło dla przeglądarki)
app.use(cors({
    origin: 'https://myheredo.pl',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
}));

app.use(express.json());

// 2. Obsługa zapytania próbnego OPTIONS na ścieżce /api
app.options('/api', (req, res) => {
    return res.sendStatus(200);
});

// 3. Główna funkcja pobierająca token i odsyłająca go do Twojej strony
app.post('/api', async (req, res) => {
    try {
        // Pobieramy Twoje klucze bezpośrednio z bezpiecznych zmiennych Vercela
      const clientId = process.env.client_id;
const clientSecret = process.env.client_secret;

        if (!clientId || !clientSecret) {
            console.error("Błąd: Brak zmiennych środowiskowych na Vercelu!");
            return res.status(500).json({ error: "Serwer nie jest skonfigurowany (brak kluczy API)" });
        }

        console.log("Łączę się z Bitwardenem w celu pobrania tokenu...");

        // Budujemy poprawne zapytanie OAuth2 do Bitwardena
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'api');
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        const response = await axios.post('https://identity.bitwarden.com/connect/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // KROK KRYTYCZNY: Odsyłamy token w formacie JSON do Twojej strony głównej
        if (response.data && response.data.access_token) {
            console.log("Token pobrany pomyślnie, odsyłam do aplikacji!");
            return res.json({ access_token: response.data.access_token });
        } else {
            return res.status(500).json({ error: "Bitwarden nie zwrócił tokenu w odpowiedzi" });
        }

    } catch (error) {
        console.error("Błąd podczas komunikacji z Bitwardenem:", error.message);
        if (error.response) {
            console.error("Szczegóły błędu z Bitwardena:", error.response.data);
        }
        return res.status(500).json({ error: "Błąd uwierzytelniania w Bitwarden" });
    }
});

module.exports = app;
