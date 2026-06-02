const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const BW_CLIENT_ID = process.env.BW_CLIENT_ID;
const BW_CLIENT_SECRET = process.env.BW_CLIENT_SECRET;
const BW_IDENTITY_URL = 'https://identity.bitwarden.com/connect/token';

app.post('/', async (req, res) => {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'api');
        params.append('client_id', BW_CLIENT_ID);
        params.append('client_secret', BW_CLIENT_SECRET);

        const response = await axios.post(BW_IDENTITY_URL, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        res.json({ access_token: response.data.access_token });
    } catch (error) {
        console.error("Błąd uwierzytelniania Bitwarden:", error.response?.data || error.message);
        res.status(500).json({ error: 'Nie udało się pobrać tokenu autoryzacji' });
    }
});

// Ważne dla Vercel: eksportujemy całą aplikację zamiast app.listen()
module.exports = app;
