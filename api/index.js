const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// 1. Włączamy obsługę CORS z jawnym statusem dla OPTIONS
app.use(cors({
    origin: 'https://myheredo.pl',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200 // Wymusza status 200 OK dla zapytań OPTIONS
}));

app.use(express.json());

// 2. Obsługa zapytania próbnego OPTIONS bezpośrednio na /api (pancerne zabezpieczenie)
app.options('/api', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://myheredo.pl');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.sendStatus(200);
});

// 3. Twoja główna funkcja odbierająca dane z aplikacji
app.post('/api', async (req, res) => {
    try {
        // ... Twój istniejący kod pobierający token z Bitwardena ...
        // Na końcu udanego procesu pamiętaj o odesłaniu odpowiedzi, np.:
        // return res.json({ access_token: "pobrany_token" });
    } catch (error) {
        console.error(error);
        return res.status(500).send("Błąd serwera");
    }
});

// Eksport dla architektury serverless Vercela
module.exports = app;

// Tutaj zostaje Twoja druga reguła cors z paczki npm (może zostać, nie przeszkadza):
app.use(cors({
    origin: '*',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json()); // Upewnij się, że to też jest pod app = express()
// Pełne zezwolenie na zapytania z DuckDuckera
app.use(cors({
    origin: '*',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const BW_CLIENT_ID = process.env.BW_CLIENT_ID;
const BW_CLIENT_SECRET = process.env.BW_CLIENT_SECRET;
const BW_IDENTITY_URL = 'https://identity.bitwarden.com/connect/token';

// Reagujemy na główny punkt wejścia funkcji Serverless
app.all('*', async (req, res) => {
    // Jeśli DuckDucker pyta o token
    if (req.method === 'POST') {
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('scope', 'api');
            params.append('client_id', BW_CLIENT_ID);
            params.append('client_secret', BW_CLIENT_SECRET);

            const response = await axios.post(BW_IDENTITY_URL, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            return res.json({ access_token: response.data.access_token });
        } catch (error) {
            console.error("Błąd Bitwarden:", error.response?.data || error.message);
            return res.status(500).json({ error: 'Nie udało się pobrać tokenu autoryzacji' });
        }
    }

    // Prosty test dla przeglądarki (GET)
    res.json({ status: "Serwer MyHeredo działa poprawnie" });
});

module.exports = app;
// Ważne dla Vercel: eksportujemy całą aplikację zamiast app.listen()
module.exports = app;
