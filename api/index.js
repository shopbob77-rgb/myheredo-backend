module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Jeśli to dotrze do Ciebie, wiemy, że połączenie Vercel-Frontend działa.
    console.log("DEBUG: Zapytanie dotarło do serwera");
    
    try {
        // Tu musiałoby być wywołanie Bitwardena...
        // Ale najpierw: czy Ty w ogóle masz pewność, że BW_CLIENT_ID 
        // to identyfikator użytkownika, a nie Organization ID?
        return res.status(200).json({ 
            debug: "Jeśli to widzisz, infrastruktura jest na 100% sprawna",
            env_check: process.env.BW_CLIENT_ID ? "ID jest ustawione" : "BRAK ID"
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
