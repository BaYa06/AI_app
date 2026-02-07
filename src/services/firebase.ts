// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { Platform } from "react-native";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDPSyOOInQ6OOynp9C0feGm8CJP-XH-52o",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "flashly-e7519.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "flashly-e7519",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "flashly-e7519.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1002555500804",
  appId: process.env.FIREBASE_APP_ID || "1:1002555500804:web:3950b643edc8145c9f8851",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-8277VNE36N"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Analytics only on web platform
export const analytics = Platform.OS === 'web' ? getAnalytics(app) : null;

export default app;
