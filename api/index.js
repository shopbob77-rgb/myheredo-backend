module.exports = async (req, res) => {
    // 1. ZABEZPIECZENIE CORS (Musi być na samym początku!)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. BEZPIECZNE PARSOWANIE JSON
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log("Otrzymano żądanie:", body.action); // To pojawi się w logach Vercela
    } catch (e) {
        console.error("Błąd parsowania JSON:", e);
        return res.status(400).json({ error: "Nieprawidłowy format danych" });
    }

    // 3. LOGIKA REJESTRACJI
    try {
        if (body.action === 'register_user') {
            // Tutaj Twoja właściwa logika rejestracji...
            return res.status(200).json({ success: true, message: "Rejestracja odebrana" });
        }
        res.status(404).json({ error: "Akcja nieznana" });
    } catch (error) {
        console.error("Błąd serwera:", error);
        res.status(500).json({ error: error.message });
    }
};
