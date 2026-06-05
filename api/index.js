module.exports = async (req, res) => {
    // 1. Zezwolenie na komunikację
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { action, data } = body;

        // Jeśli to zapis danych
        if (action === "save_cipher") {
            const response = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: {
                    'Authorization': req.headers['authorization'] || '',
                    'Content-Type': 'application/json',
                    'Device-Type': '1',
                    'Bitwarden-Client-Version': '2024.0.0'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json().catch(() => ({}));
            return res.status(response.status).json(result);
        }

        // Domyślna odpowiedź, by aplikacja nie "stała"
        return res.status(200).json({ status: "SUCCESS", message: "Serwer gotowy" });
    } catch (e) {
        return res.status(200).json({ status: "SUCCESS", debug: "Przekierowano (offline mode)" });
    }
};
