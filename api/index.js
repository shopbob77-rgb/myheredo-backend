module.exports = async (req, res) => {
    // 1. Zezwolenia CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Logika: Jeśli to zapis, tutaj wyślesz dane do Bitwarden
        if (body.action === "save_cipher") {
            console.log("Otrzymano dane do Bitwarden:", body.data);
            // Tutaj w przyszłości dodasz fetch do API Bitwardena
            return res.status(200).json({ status: "SUCCESS", message: "Przyjęto do zapisu" });
        }

        // Standardowe odczytanie sejfu
        return res.status(200).json({ status: "SUCCESS", vaultData: { test: "dane" } });
    } catch (e) {
        return res.status(200).json({ status: "ERROR", message: e.message });
    }
};
