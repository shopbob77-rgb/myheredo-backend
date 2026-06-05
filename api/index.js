module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = await new Promise(resolve => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(JSON.parse(data || '{}')));
        });

        // Używamy natywnego fetch, który jest stabilny w Vercel
        const response = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1',
                'Bitwarden-Client-Version': '2024.0.0',
                'Device-Identifier': '00000000-0000-0000-0000-000000000000'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        // Zwracamy wynik z Bitwarden bezpośrednio do frontendu
        return res.status(response.status).json(data);

    } catch (error) {
        console.error("Błąd połączenia z Bitwarden:", error);
        return res.status(500).json({ error: "Nie udało się połączyć z Bitwarden", details: error.message });
    }
};
