module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Szybka odpowiedź, aby frontend "ruszył"
    return res.status(200).json({ status: "OK", timestamp: new Date() });
};
        return res.status(200).json({ status: "SUCCESS", message: "Serwer gotowy" });
    } catch (e) {
        return res.status(200).json({ status: "SUCCESS", debug: "Przekierowano (offline mode)" });
    }
};
