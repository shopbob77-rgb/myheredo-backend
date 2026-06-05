module.exports = async (req, res) => {
    // 1. Zezwól na wszystko - wyeliminuj blokady CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    // 2. Jeśli przeglądarka pyta o pozwolenie (OPTIONS), odpowiedz natychmiast
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. Najprostsza możliwa odpowiedź
    console.log("SERVER_DEBUG: Funkcja została wywołana!");
    return res.status(200).json({ status: "SUCCESS", message: "Serwer odpowiada!" });
};
