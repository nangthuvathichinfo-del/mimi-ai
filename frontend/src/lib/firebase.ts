import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken as getAppCheckToken,
  type AppCheck,
} from "firebase/app-check";

const env = import.meta.env;

/** "mock": dữ liệu mẫu, không cần Firebase. "live": gọi Firebase Auth và /api thật. */
export const API_MODE: "mock" | "live" =
  env.VITE_API_MODE === "live" && env.VITE_FIREBASE_API_KEY ? "live" : "mock";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let appCheck: AppCheck | undefined;

export function firebase() {
  if (API_MODE !== "live") return null;
  if (!app) {
    app = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    });
    auth = getAuth(app);
    auth.languageCode = "vi";
    if (env.VITE_USE_EMULATORS === "1") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    } else if (env.VITE_RECAPTCHA_ENTERPRISE_KEY) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return { app: app!, auth: auth!, appCheck };
}

export async function appCheckToken(): Promise<string | undefined> {
  const fb = firebase();
  if (!fb?.appCheck) return undefined;
  const { token } = await getAppCheckToken(fb.appCheck, false);
  return token;
}
