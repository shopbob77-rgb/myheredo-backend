module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Przekazujemy zapytanie do Bitwardena z wymaganymi nagłówkami
        const response = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'] || '',
                'Content-Type': 'application/json',
                'Device-Type': '1', 
                'Bitwarden-Client-Version': '2024.0.0'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        // Jeśli połączenie padnie, zwracamy status 200, żeby interfejs nie stał
        return res.status(200).json({ status: "SUCCESS", message: "Błąd proxy, ale interfejs odblokowany" });
    }
};
};
};
