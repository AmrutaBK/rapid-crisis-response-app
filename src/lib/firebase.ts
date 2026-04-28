import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const isConfigValid = firebaseConfig && firebaseConfig.apiKey !== "MISSING" && firebaseConfig.apiKey !== "placeholder";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
const googleProvider = new GoogleAuthProvider();

if (isConfigValid) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || "(default)");
} else {
  // Fallback to prevent crashes, but functionality will be limited
  console.warn("Firebase configuration is missing or invalid. Please ensure set_up_firebase has run successfully.");
  // We'll initialize with empty/dummy if forced, or just export nulls and handle in UI
}

export { auth, db, googleProvider, isConfigValid };
export const signInWithGoogle = () => {
  if (!isConfigValid) {
    alert("Firebase is not configured. Please run the setup tool.");
    return Promise.reject("Firebase not configured");
  }
  return signInWithPopup(auth, googleProvider);
};
