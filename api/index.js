module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = req.body || {};
        
        // Jeśli frontend wyśle 'get_vault' - zwracamy dane
        if (body.action === "get_vault") {
            return res.status(200).json({ status: "SUCCESS", vaultData: { "notatka": "test" } });
        }
        
        // Jeśli frontend wyśle 'save_cipher' - przyjmujemy dane
        if (body.action === "save_cipher") {
            console.log("Dane do zapisu:", body.data);
            return res.status(200).json({ status: "SUCCESS", message: "Zapisano w chmurze" });
        }

        return res.status(200).json({ status: "SUCCESS", message: "Brak akcji" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
