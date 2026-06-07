const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

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
// BEZPIECZNA FUNKCJA POMOCNICZA: Pobieranie tokenu sesji z Bitwarden Teams
// =========================================================================
async function getBitwardenToken() {
  const clientId = process.env.BITWARDEN_CLIENT_ID;
  const clientSecret = process.env.BITWARDEN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Brak zmiennych BITWARDEN_CLIENT_ID lub BITWARDEN_CLIENT_SECRET w panelu Vercel.");
  }

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
    throw new Error(`Bitwarden Identity Server zwrocil blad: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// =========================================================================
// GŁÓWNY HANDLER VERCEL (WEJŚCIE DLA API)
// =========================================================================
module.exports = async (req, res) => {
  // USTAWIEŃ NAGŁÓWKÓW CORS (Zawsze na poczatku, zeby uniknac bledow w przegladarce)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Obsluga zapytan wstepnych OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Monitor statusu serwera przez zwykle GET
  if (req.method === 'GET') {
    return res.status(200).json({ status: "online", message: "Serwer MyHeredo dziala poprawnie." });
  }

  // PARSOWANIE STRUMIENIA DANYCH JSON
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
    console.error("Blad parsowania JSON:", e);
    return res.status(400).json({ error: "Nieprawidlowy format żądania JSON." });
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Brak zdefiniowanego pola 'action'." });
  }

  try {
    // ---------------------------------------------------------------------
    // AKCJA 1: REJESTRACJA UŻYTKOWNIKA + ZAPROSZENIE DO BITWARDEN TEAMS
    // ---------------------------------------------------------------------
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

        // Zapis w Firebase dziala najpierw, zeby system nie stanal w miejscu
        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          bitwardenIntegrationStatus: "W trakcie wysylania zaproszenia...",
          createdAt: new Date().toISOString()
        });

        // Proba wyslania zaproszenia do Bitwardena w bezpiecznym bloku try-catch
        try {
          if (!process.env.BITWARDEN_CLIENT_ID || !process.env.BITWARDEN_CLIENT_SECRET) {
            bitwardenStatus = "Blad: Brak skonfigurowanych zmiennych srodowiskowych na Vercelu.";
          } else {
            const token = await getBitwardenToken();
            const orgId = process.env.BITWARDEN_CLIENT_ID.replace("organization.", "");

            const bwInviteResponse = await fetch(`https://api.bit
