module.exports = async (req, res) => {
    // Nagłówki CORS - kluczowe, by przeglądarka nie blokowała
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Obsługa "preflight" (zapytania sprawdzającego przeglądarki)
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Akceptujemy tylko POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Backend oczekuje zapytania typu POST." });
    }

    try {
        // Parsowanie danych z frontendu
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Logika serwerowa
        return res.status(200).json({ status: "SUCCESS", received: body.action || "no_action" });
    } catch (e) {
        return res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
};

        // Domyślna odpowiedź, by aplikacja nie "stała"
        return res.status(200).json({ status: "SUCCESS", message: "Serwer gotowy" });
    } catch (e) {
        return res.status(200).json({ status: "SUCCESS", debug: "Przekierowano (offline mode)" });
    }
};
