// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, setUserId } from "firebase/analytics";
import { Platform } from "react-native";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAJIhirrPAvSLQRGI2ahDyV7oJKEQWGdA0",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "flashly-84e0a.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "flashly-84e0a",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "flashly-84e0a.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "509047998599",
  appId: process.env.FIREBASE_APP_ID || "1:509047998599:web:abc45e563dee361b185022",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-T7WRY5SBC6"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Analytics only on web platform
export const analytics = Platform.OS === 'web' ? getAnalytics(app) : null;

/**
 * Установить user_id для Firebase Analytics для отслеживания конкретного пользователя
 * @param userId - UUID пользователя (не email!). Передать null для сброса при выходе.
 */
export function setAnalyticsUserId(userId: string | null) {
  if (!analytics) {
    console.log('ℹ️ Analytics: недоступно (только web)');
    return;
  }
  
  try {
    setUserId(analytics, userId);
    if (userId) {
      console.log('✅ Analytics: user_id установлен:', userId);
    } else {
      console.log('🔄 Analytics: user_id сброшен');
    }
  } catch (error) {
    console.warn('⚠️ Analytics: ошибка setUserId:', error);
  }
}

export default app;
