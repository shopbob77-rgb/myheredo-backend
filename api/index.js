module.exports = async (req, res) => {
    // Nagłówki CORS - muszą być na początku
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Jeśli potrzebujesz logiki zapisu, tutaj ją obsłuż
        if (req.body.action === "save_cipher") {
            // ... (logika do Bitwardena)
            return res.status(200).json({ status: "SUCCESS", message: "Zapisano" });
        }
        
        // Domyślna odpowiedź, żeby aplikacja nie stała
        return res.status(200).json({ status: "OK" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
