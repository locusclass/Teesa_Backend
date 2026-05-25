import * as admin from 'firebase-admin'

let _initialized = false

function init() {
  if (_initialized) return
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) })
  _initialized = true
}

export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  init()
  return admin.auth().verifyIdToken(idToken)
}
