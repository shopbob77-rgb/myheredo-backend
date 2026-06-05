module.exports = async (req, res) => {
    // 1. Zezwolenie na CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. Pobranie tokena z nagłówka
    const authToken = req.headers['authorization'];
    if (!authToken) {
        return res.status(401).json({ error: "Brak tokena w nagłówku Authorization" });
    }

    try {
        // 3. Przekazanie zapytania do Bitwarden
        const response = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': authToken, // Przekazujemy token dalej
                'Content-Type': 'application/json',
                'Device-Type': '1', 
                'Bitwarden-Client-Version': '2024.0.0'
            },
            body: JSON.stringify(req.body || {})
        });

        const data = await response.json();
        return res.status(response.status).json(data);

    } catch (error) {
        return res.status(500).json({ error: "Błąd proxy", details: error.message });
    }
};;
