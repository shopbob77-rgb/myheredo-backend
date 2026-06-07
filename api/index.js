// Wstaw to jako pierwszą linię wewnątrz głównej funkcji (action == 'register_user')
console.log("DEBUG: Otrzymano żądanie z frontend dla maila:", email);
const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const https = require("https"); // Używamy natywnego, stabilnego modułu Node.js

// 1. INICJALIZACJA FIREBASE
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error("Blad krytyczny Firebase Admin SDK:", err);
  }
}

const db = admin.firestore();

// =========================================================================
// FUNKCJA POMOCNICZA DO WYKONYWANIA ŻĄDAŃ HTTPS (Zastępuje problematyczny fetch)
// =========================================================================
function makeHttpsRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (e) => { reject(e); });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// =========================================================================
// BEZPIECZNA FUNKCJA: Pobieranie tokenu sesji z Bitwarden Teams
// =========================================================================
async function getBitwardenToken() {
  const clientId = process.env.BITWARDEN_CLIENT_ID;
  const clientSecret = process.env.BITWARDEN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Brak zmiennych BITWARDEN_CLIENT_ID lub BITWARDEN_CLIENT_SECRET w panelu Vercel.");
  }

  const postData = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=api`;

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const response = await makeHttpsRequest("https://identity.bitwarden.com/connect/token", options, postData);

  if (response.statusCode !== 200) {
    throw new Error(`Bitwarden Identity Error: ${response.statusCode} - ${response.body}`);
  }

  const data = JSON.parse(response.body);
  return data.access_token;
}

// =========================================================================
// GŁÓWNY HANDLER VERCEL
// =========================================================================
module.exports = async (req, res) => {
  // Nagłówki CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: "online", message: "Serwer MyHeredo dziala." });

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
    return res.status(400).json({ error: "Nieprawidlowy format żądania JSON." });
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) return res.status(400).json({ error: "Brak zdefiniowanego pola 'action'." });

  try {
    // 1. REJESTRACJA UŻYTKOWNIKA
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email użytkownika." });

      const userCheck = await db.collection('users').doc(email).get();
      let secretBase32;
      let bitwardenStatus = "Nie zainicjowano";

      if (userCheck.exists) {
        secretBase32 = userCheck.data().twoFactorSecret;
        bitwardenStatus = userCheck.data().bitwardenIntegrationStatus || "Konto juz istnialo";
      } else {
        const secret = speakeasy.generateSecret({ length: 20 });
        secretBase32 = secret.base32.toUpperCase().replace(/=/g, '');

        // Podstawowy bezpieczny zapis w Firebase
        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          bitwardenIntegrationStatus: "Przetwarzanie...",
          createdAt: new Date().toISOString()
        });

        try {
          if (!process.env.BITWARDEN_CLIENT_ID || !process.env.BITWARDEN_CLIENT_SECRET) {
            bitwardenStatus = "Blad: Brak zmiennych srodowiskowych na Vercelu.";
          } else {
            const token = await getBitwardenToken();
            
            // Bezpieczne parowanie ID organizacji
            let orgId = process.env.BITWARDEN_CLIENT_ID;
            if (orgId.includes("organization.")) {
              orgId = orgId.replace("organization.", "");
            }

            const postData = JSON.stringify({
              emails: [email],
              type: 2,
              accessAll: false,
              collections: []
            });

            const options = {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              }
            };

            const bwResponse = await makeHttpsRequest(`https://api.bitwarden.com/api/v1/organizations/${orgId}/members`, options, postData);

            if (bwResponse.statusCode === 200 || bwResponse.statusCode === 201) {
              bitwardenStatus = "Sukces: Zaproszenie Teams zostalo wyslane!";
            } else {
              bitwardenStatus = `Bitwarden API zwrocil status ${bwResponse.statusCode}: ${bwResponse.body}`;
            }
          }
        } catch (bwErr) {
          bitwardenStatus = "Awaria polaczenia Bitwarden: " + bwErr.message;
        }

        // Aktualizacja wyniku w Firebase
        await db.collection('users').doc(email).update({
          bitwardenIntegrationStatus: bitwardenStatus
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

    // 2. WERYFIKACJA 2FA
    if (action === 'verify_2fa_and_activate') {
      const { email, token } = payload;
      if (!email || !token) return res.status(400).json({ error: "Brak e-maila lub tokenu 2FA." });

      const userDoc = await db.collection('users').doc(email).get();
      if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje w bazie." });
      
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
        return res.status(400).json({ error: "Podany kod z aplikacji 2FA jest bledny." });
      }
    }

    // 3. SUWAK I EMERGENY ACCESS
    if (action === 'activate_succession') {
      const { email, heirs, dmsTimeoutDays, vaultData, categoryNames } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      await db.collection('successions').doc(email).set({
        userEmail: email,
        heirs: heirs || [],
        dmsTimeoutDays: dmsTimeoutDays || 30,
        vaultData: vaultData || {},
        categoryNames: categoryNames || {},
        activatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      }, { merge: true });

      if (heirs && heirs.length > 0) {
        const primaryHeirEmail = heirs[0].email;

        try {
          const token = await getBitwardenToken();
          
          const postData = JSON.stringify({
            type: 1,
            email: primaryHeirEmail,
            waitTimeDays: parseInt(dmsTimeoutDays)
          });

          const options = {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          const bwResponse = await makeHttpsRequest('https://api.bitwarden.com/api/v1/emergency-access', options, postData);

          if (bwResponse.statusCode !== 200 && bwResponse.statusCode !== 201) {
            throw new Error(`Status ${bwResponse.statusCode}: ${bwResponse.body}`);
          }
        } catch (bwError) {
          return res.status(200).json({ 
            success: true, 
            message: "Firebase OK, lecz problem z suwakiem w Bitwardenie: " + bwError.message 
          });
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: "Protokol uzbrojony w Firebase i zsynchronizowany z suwakiem dni." 
      });
    }

    return res.status(400).json({ error: "Nieznana akcja: " + action });

  } catch (error) {
    return res.status(500).json({ error: "Blad serwera: " + error.message });
  }
};
