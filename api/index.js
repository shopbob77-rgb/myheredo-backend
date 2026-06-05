module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Pobierz token z nagłówka, który wysyła Twoja aplikacja
    const authToken = req.headers['authorization'];
    
    if (!authToken) {
        return res.status(401).json({ error: "Brak tokena w nagłówku Authorization" });
    }

    try {
        // Testujemy połączenie, sprawdzając profil
        const response = await fetch('https://api.bitwarden.com/accounts/profile', {
            method: 'GET',
            headers: {
                'Authorization': authToken,
                'Device-Type': '1', 
                'Bitwarden-Client-Version': '2024.0.0'
            }
        });

        const data = await response.text(); // Pobieramy jako tekst, żeby uniknąć błędu JSON
        
        return res.status(200).json({
            status: response.status,
            raw_response: data // Zobaczymy dokładnie, co odpisuje Bitwarden
        });

    } catch (error) {
        return res.status(500).json({ error: "Błąd połączenia", details: error.message });
    }
};;
