module.exports = async (req, res) => {
    // 1. Ustawienia CORS (wymagane dla poprawnej komunikacji z przeglądarką)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 2. Bezpieczne parsowanie JSON
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // 3. Obsługa żądania
        return res.status(200).json({ 
            status: "SUCCESS", 
            message: "Połączenie nawiązane",
            receivedAction: body.action 
        });
    } catch (e) {
        return res.status(500).json({ error: "Błąd serwera" });
    }
};
