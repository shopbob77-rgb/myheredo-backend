module.exports = async (req, res) => {
    // 1. Ustawienia, które zawsze przepuszczają komunikację (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        console.log("DEBUG: Próba połączenia z Bitwarden...");
        
        // Używamy fetch, bo jest najstabilniejszy w Vercel
        const response = await fetch('https://api.bitwarden.com/ciphers', {
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1',
                'Bitwarden-Client-Version': '2024.0.0',
                'Device-Identifier': '00000000-0000-0000-0000-000000000000'
            },
            body: JSON.stringify({ name: "Test" }) // Minimalny ładunek
        });

        const data = await response.json();
        
        // Zwracamy odpowiedź z Bitwardena bezpośrednio do aplikacji
        return res.status(response.status).json(data);

    } catch (error) {
        // Jeśli cokolwiek pójdzie nie tak, serwer NIE ZAWIESI SIĘ
        // Tylko wyśle błąd do aplikacji - dzięki temu aplikacja nie "stoi"
        console.error("DEBUG: Błąd krytyczny:", error.message);
        return res.status(200).json({ 
            error: "Połączenie nieudane", 
            details: error.message,
            force_continue: true // Dodatkowa flaga, żeby aplikacja mogła przejść dalej
        });
    }
};
