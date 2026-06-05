module.exports = async (req, res) => {
    // 1. Obsługa CORS dla wszystkich zapytań
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 2. Obsługa zapytania typu "preflight" (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. Wymuszamy metodę POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Metoda niedozwolona. Backend oczekuje zapytania typu POST." });
    }

    try {
        // Logika Twojego backendu (symulacja lub połączenie z Bitwarden)
        return res.status(200).json({ status: 200, message: "Połączenie z backendem aktywne" });
    } catch (error) {
        return res.status(500).json({ error: "Błąd serwera", details: error.message });
    }
};
