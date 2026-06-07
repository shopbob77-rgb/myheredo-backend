const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error("Błąd Firebase:", err);
  }
}

const db = admin.firestore();

// =========================================================================
// FUNKCJA POMOCNICZA: Pobieranie tymczasowego tokenu sesji z Bitwarden Teams
// =========================================================================
async function getBitwardenToken() {
  const clientId = process.env.BITWARDEN_CLIENT_ID;
  const clientSecret = process.env.BITWARDEN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Brak ustawionych zmiennych klucza API Organizacji w Vercel!");
  }

  // Bitwarden wymaga wysłania danych w formacie x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "api");

  const response = await fetch("https://identity.bitwarden.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Błąd autoryzacji Identity Bitwarden: ${errText}`);
  }

  const data = await response.json();
  return data.access_token; // Zwraca aktywny token typu Bearer
}

// =========================================================================
// GŁÓWNA FUNKCJA HANDLERA VERCEL
// =========================================================================
module.exports = async (req, res) => {
  // 1. USTAWIEŃ NAGŁÓWKÓW CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: "online", message: "MyHeredo API gotowe." });

  // 2. PARSOWANIE BODY
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      const buffers = [];
      for await (const chunk of req) { buffers.push(chunk); }
      const data = Buffer.concat(buffers).toString();
      if (data) body = JSON.parse(data);
    }
  } catch (e) {
    return res.status(400).json({ error: "Błędny format danych JSON." });
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) return res.status(400).json({ error: "Brak pola 'action'." });

  try {
    // ---------------------------------------------------------------------
    // KROK 1: REJESTRACJA UŻYTKOWNIKA + AUTOMATYCZNE ZAPROSZENIE DO TEAMS
    // ---------------------------------------------------------------------
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      const userCheck = await db.collection('users').doc(email).get();
      let secretBase32;
      let bitwardenStatus = "Oczekuje / Brak organizacji";

      if (userCheck.exists) {
        secretBase32 = userCheck.data().twoFactorSecret;
      } else {
        const secret = speakeasy.generateSecret({ length: 20 });
        secretBase32 = secret.base32.toUpperCase().replace(/=/g, '');

        // --- INTEGRACJA Z BITWARDEN TEAMS ---
        try {
          const token = await getBitwardenToken();
          
          // Wyciągamy ID organizacji, które jest zaszyte w pierwszej części klucza client_id
          // Format client_id to zazwyczaj: organization.ID-ORGANIZACJI
          const orgId = process.env.BITWARDEN_CLIENT_ID.replace("organization.", "");

          // Wywołujemy endpoint Bitwardena zapraszający użytkownika jako Member (typ 2)
          const bwInviteResponse = await fetch(`https://api.bitwarden.com/api/v1/organizations/${orgId}/members`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              emails: [email],
              type: 2, // 2 = Regularny członek (Member) Twojej organizacji
              accessAll: false,
              collections: [] // Na start czysta tablica kolekcji
            })
          });

          if (bwInviteResponse.ok) {
            bitwardenStatus = "Wysłano zaproszenie Teams";
          } else {
            const errLog = await bwInviteResponse.text();
            console.error("Bitwarden zaproszenie odrzucone:", errLog);
            bitwardenStatus = "Błąd zaproszenia Bitwarden API";
          }
        } catch (bwErr) {
          console.error("Błąd łączności podczas rejestracji w BW:", bwErr.message);
          bitwardenStatus = "Awaria integracji API: " + bwErr.message;
        }

        // Zapis użytkownika w Firebase z dodanym statusem integracji
        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          bitwardenIntegrationStatus: bitwardenStatus,
          createdAt: new Date().toISOString()
        });
      }

      const issuer = "MyHeredo";
      const pureOtpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${email}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
      const qrCodeDataUrl = await qrcode.toDataURL(pureOtpauthUrl);

      return res.status(200).json({
        success: true,
        qrCode: qrCodeDataUrl,
        bitwardenMessage: bitwardenStatus
      });
    }

    // WERYFIKACJA KODU Z APLIKACJI (2FA)
    if (action === 'verify_2fa_and_activate') {
      const { email, token } = payload;
      if (!email || !token) return res.status(400).json({ error: "Brak e-maila lub tokenu." });

      const userDoc = await db.collection('users').doc(email).get();
      if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje." });
      
      const verified = speakeasy.totp.verify({
        secret: userDoc.data().twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2
      });

      if (verified) {
        await db.collection('users').doc(email).update({ twoFactorEnabled: true });
        return res.status(200).json({ success: true });
      } else {
        return res.status(400).json({ error: "Błędny kod 2FA." });
      }
    }

    // ---------------------------------------------------------------------
    // KROK 2: POWIĄZANIE SUWAKA DNI Z DOSTĘPEM AWARYJNYM (EMERGENCY ACCESS)
    // ---------------------------------------------------------------------
    if (action === 'activate_succession') {
      const { email, heirs, dmsTimeoutDays, vaultData, categoryNames } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      // Zapis w Firebase
      await db.collection('successions').doc(email).set({
        userEmail: email,
        heirs: heirs || [],
        dmsTimeoutDays: dmsTimeoutDays || 30,
        vaultData: vaultData || {},
        categoryNames: categoryNames || {},
        activatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      }, { merge: true });

      // Jeśli mamy zdefiniowanego spadkobiercę, konfigurujemy to w Bitwardenie
      if (heirs && heirs.length > 0) {
        const primaryHeirEmail = heirs[0].email;

        try {
          const token = await getBitwardenToken();
          
          // Uderzamy do punktu konfiguracji relacji awaryjnej (Emergency Access)
          const bitwardenResponse = await fetch('https://api.bitwarden.com/api/v1/emergency-access', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`, // Bezpieczny token sesyjny
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 1, // Read-only dostęp do sejfu po zatwierdzeniu sukcesji
              email: primaryHeirEmail,
              waitTimeDays: parseInt(dmsTimeoutDays) // WARTOŚĆ Z TWOJEGO SUWAKA!
            })
          });

          if (!bitwardenResponse.ok) {
            const errText = await bitwardenResponse.text();
            throw new Error(`Bitwarden API Error: ${errText}`);
          }
        } catch (bwError) {
          console.error("Błąd konfiguracji suwaka w Bitwarden:", bwError.message);
          return res.status(200).json({ 
            success: true, 
            message: "Zapisano w Firebase, ale wystąpił błąd synchronizacji suwaka z Bitwardenem: " + bwError.message 
          });
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: "Protokół zsynchronizowany z parametrem czasowym Bitwardena." 
      });
    }

    return res.status(400).json({ error: "Nieznana akcja: " + action });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
};
